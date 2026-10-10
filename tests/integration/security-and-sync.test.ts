import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  app, bookingBody, createTestContext, latestTokenFromOutbox, resetDatabase, staffAgent, type TestContext,
} from "../helpers";
import { bookings, calendarDiscrepancies, calendarSyncState, jobs, outbox, reviews } from "../../server/db/schema";
import { FakeCalendarGateway } from "../../server/integrations/google-calendar/fake";
import { eventIdForBooking } from "../../server/integrations/google-calendar/types";
import { ensureWatchChannels, handleWebhook, reconcile, syncCalendar } from "../../server/integrations/google-calendar/sync";
import { drain } from "../../server/jobs/worker";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.calendar = new FakeCalendarGateway(["primary"]);
  ctx.clock.now = new Date("2026-10-12T12:00:00Z");
});

async function confirmedBooking() {
  await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
  const token = await latestTokenFromOutbox(ctx, "owner.booking_request", "action");
  await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 1 }).expect(200);
  const [b] = await ctx.db.select().from(bookings);
  return b;
}

describe("staff authorization", () => {
  it("denies anonymous access to booking and contact data", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    for (const path of ["/api/admin/bookings", "/api/admin/contacts", "/api/admin/reviews", "/api/admin/overview", "/api/admin/settings", "/api/admin/google/status"]) {
      await app(ctx).get(path).expect(401);
    }
    // The old unauthenticated listing endpoints are gone.
    await app(ctx).get("/api/bookings").expect(404);
    await app(ctx).get("/api/contact").expect(404);
  });

  it("requires CSRF for cookie-authenticated mutations", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    const { agent, csrf } = await staffAgent(ctx);
    await agent.post(`/api/admin/bookings/${b.id}/reject`).send({ version: 1 }).expect(403);
    const ok = await agent.post(`/api/admin/bookings/${b.id}/reject`).set("x-csrf-token", csrf).send({ version: 1, reason: "Test" }).expect(200);
    expect(ok.body.booking.status).toBe("rejected");
  });

  it("lets staff approve from the dashboard with version checks", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    const { agent, csrf } = await staffAgent(ctx);
    await agent.post(`/api/admin/bookings/${b.id}/approve`).set("x-csrf-token", csrf).send({ version: 9 }).expect(409);
    const res = await agent.post(`/api/admin/bookings/${b.id}/approve`).set("x-csrf-token", csrf).send({ version: 1 }).expect(200);
    expect(res.body.outcome).toBe("confirmed");
    const detail = await agent.get(`/api/admin/bookings/${b.id}`).expect(200);
    expect(detail.body.history.map((h: any) => h.action)).toEqual(["requested", "approval_requested", "confirmed"]);
    expect(detail.body.booking).not.toHaveProperty("idempotencyKey");
  });

  it("rejects bad credentials without revealing whether the account exists", async () => {
    const res1 = await app(ctx).post("/api/admin/login").send({ email: "nobody@example.test", password: "x" }).expect(401);
    expect(res1.body.error).toBe("invalid_credentials");
  });

  it("retires legacy GET mutation links without changing state", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const res = await app(ctx).get("/api/bookings/1/approve").expect(410);
    expect(res.text).toContain("no longer valid");
    await app(ctx).get("/api/reviews/1/approve").expect(410);
    const [b] = await ctx.db.select().from(bookings);
    expect(b.status).toBe("pending_approval");
  });

  it("accepts only JSON for API mutations", async () => {
    await app(ctx).post("/api/contact").type("form").send("firstName=a").expect(415);
  });

  it("does not return customer data or credentials in public responses", async () => {
    const res = await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("ana@example.test");
    expect(body).not.toContain("123 Main St");
    expect(body).not.toContain("Gate code");
  });
});

describe("reviews and contact (regression)", () => {
  it("validates rating bounds and publishes only after moderation", async () => {
    await app(ctx).post("/api/reviews").send({ name: "Maria Gonzalez", email: "m@example.test", rating: 6, body: "Great" }).expect(400);
    await app(ctx).post("/api/reviews").send({ name: "Maria Gonzalez", email: "m@example.test", rating: 5, body: "<b>Great</b> work" }).expect(201);
    let list = await app(ctx).get("/api/reviews").expect(200);
    expect(list.body).toEqual({ reviews: [], averageRating: null, count: 0 });

    const token = await latestTokenFromOutbox(ctx, "owner.review", "action");
    const [mail] = await ctx.db.select().from(outbox).where(eq(outbox.type, "owner.review"));
    expect(mail.html).toContain("&lt;b&gt;Great&lt;/b&gt;");
    await app(ctx).get("/api/actions").set("Authorization", `Bearer ${token}`).expect(200); // scanner visit
    expect((await ctx.db.select().from(reviews))[0].status).toBe("pending");
    await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "publish" }).expect(200);
    await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "publish" }).expect(409);

    list = await app(ctx).get("/api/reviews").expect(200);
    expect(list.body.count).toBe(1);
    expect(list.body.reviews[0].name).toBe("Maria G.");
    expect(list.body.reviews[0]).not.toHaveProperty("email");
  });

  it("stores contact and commercial quote requests durably and queues owner mail", async () => {
    await app(ctx).post("/api/contact").send({
      kind: "commercial_quote", locale: "es", firstName: "Luis", lastName: "R", email: "l@example.test", phone: "240-555-0199",
      company: "Oficina SA", businessType: "office", squareFeet: 4000, frequency: "weekly", contactWindow: "morning",
    }).expect(201);
    const { agent } = await staffAgent(ctx);
    const contacts = await agent.get("/api/admin/contacts").expect(200);
    expect(contacts.body[0]).toMatchObject({ kind: "commercial_quote", squareFeet: 4000, phone: "+12405550199" });
    expect(await ctx.db.select().from(outbox).where(eq(outbox.type, "owner.contact"))).toHaveLength(1);
  });

  it("hides demo reviews in production", async () => {
    await ctx.db.insert(reviews).values({ name: "Demo", email: "d@example.test", rating: 5, body: "demo", status: "approved", isDemo: true });
    const prod = await createTestContext({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), PUBLIC_BASE_URL: "https://example.test", GOOGLE_CALENDAR_MODE: "google" });
    prod.calendar = ctx.calendar;
    try {
      const res = await app(prod).get("/api/reviews").expect(200);
      expect(res.body.count).toBe(0);
    } finally {
      await prod.pool.end();
    }
    expect((await app(ctx).get("/api/reviews").expect(200)).body.count).toBe(1);
  });
});

describe("calendar sync and external edits", () => {
  it("flags a Google move for staff without changing the customer's booking", async () => {
    const b = await confirmedBooking();
    await syncCalendar(ctx, "primary"); // baseline
    ctx.calendar.externalEdit("primary", b.calendarEventId!, { start: new Date("2026-10-14T15:00:00Z"), end: new Date("2026-10-14T18:30:00Z") });
    await syncCalendar(ctx, "primary");
    const [d] = await ctx.db.select().from(calendarDiscrepancies);
    expect(d.kind).toBe("event_moved");
    const [after] = await ctx.db.select().from(bookings);
    expect(after.startAt.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(after.status).toBe("confirmed");
  });

  it("flags an external deletion and a colliding event", async () => {
    const b = await confirmedBooking();
    await syncCalendar(ctx, "primary");
    ctx.calendar.externalInsert("primary", new Date("2026-10-14T13:00:00Z"), new Date("2026-10-14T14:00:00Z"));
    ctx.calendar.externalEdit("primary", b.calendarEventId!, { delete: true });
    await syncCalendar(ctx, "primary");
    const kinds = (await ctx.db.select().from(calendarDiscrepancies)).map((d) => d.kind).sort();
    expect(kinds).toEqual(["event_collision", "event_deleted"]);
    expect((await ctx.db.select().from(bookings))[0].status).toBe("confirmed");
  });

  it("rebuilds after an invalid sync token (410) without deleting bookings", async () => {
    await confirmedBooking();
    await syncCalendar(ctx, "primary");
    const [state] = await ctx.db.select().from(calendarSyncState);
    ctx.calendar.invalidSyncTokens.add(state.syncToken!);
    const result = await syncCalendar(ctx, "primary");
    expect(result.rebuilt).toBe(true);
    expect(await ctx.db.select().from(bookings)).toHaveLength(1);
    expect(await ctx.db.select().from(calendarDiscrepancies)).toHaveLength(0);
  });

  it("detects busy-source collisions during reconciliation", async () => {
    const b = await confirmedBooking();
    const { agent, csrf } = await staffAgent(ctx);
    await agent.post(`/api/admin/resources/${b.resourceId}`).set("x-csrf-token", csrf)
      .send({ name: "Crew 1", active: true, sortOrder: 0, destinationCalendar: "primary", busyCalendars: ["personal"] }).expect(200);
    ctx.calendar.externalBusy.set("personal", [{ start: new Date("2026-10-14T14:00:00Z"), end: new Date("2026-10-14T15:00:00Z") }]);
    await reconcile(ctx);
    const kinds = (await ctx.db.select().from(calendarDiscrepancies)).map((d) => d.kind);
    expect(kinds).toContain("event_collision");
  });

  it("validates webhook channel credentials and queues a sync", async () => {
    const webhookCtx = { ...ctx, config: { ...ctx.config, google: { ...ctx.config.google, webhookEnabled: true } } };
    await confirmedBooking();
    await ensureWatchChannels(webhookCtx);
    const [state] = await ctx.db.select().from(calendarSyncState);
    const channel = ctx.calendar.channels.get(state.channelId!)!;
    expect(state.channelExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    expect((await handleWebhook(ctx, { channelId: state.channelId!, token: "wrong" })).accepted).toBe(false);
    expect((await handleWebhook(ctx, { channelId: "unknown", token: channel.token })).accepted).toBe(false);
    await app(ctx).post("/api/integrations/google/webhook").set("x-goog-channel-id", state.channelId!).set("x-goog-channel-token", "wrong").expect(404);
    await app(ctx).post("/api/integrations/google/webhook")
      .set("x-goog-channel-id", state.channelId!).set("x-goog-channel-token", channel.token)
      .set("x-goog-resource-id", channel.resourceId).set("x-goog-resource-state", "exists").expect(200);
    expect(await ctx.db.select().from(jobs).where(eq(jobs.type, "calendar.sync"))).toHaveLength(1);
    await drain(ctx);
    const [synced] = await ctx.db.select().from(calendarSyncState);
    expect(synced.lastSyncAt).not.toBeNull();
  });

  it("renews watch channels that are close to expiry", async () => {
    const webhookCtx = { ...ctx, config: { ...ctx.config, google: { ...ctx.config.google, webhookEnabled: true } } };
    await confirmedBooking();
    await ensureWatchChannels(webhookCtx);
    const [first] = await ctx.db.select().from(calendarSyncState);
    await ensureWatchChannels(webhookCtx); // still valid: unchanged
    expect((await ctx.db.select().from(calendarSyncState))[0].channelId).toBe(first.channelId);
    await ctx.db.update(calendarSyncState).set({ channelExpiresAt: new Date(ctx.clock.now.getTime() + 3600_000) });
    await ensureWatchChannels(webhookCtx);
    const [renewed] = await ctx.db.select().from(calendarSyncState);
    expect(renewed.channelId).not.toBe(first.channelId);
    expect(ctx.calendar.channels.has(first.channelId!)).toBe(false); // old channel stopped
  });

  it("surfaces revoked authorization as disconnected and blocks new approvals", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    ctx.calendar.healthStatus = "revoked";
    const { agent, csrf } = await staffAgent(ctx);
    const overview = await agent.get("/api/admin/overview").expect(200);
    expect(overview.body.calendar.status).toBe("revoked");
    const [b] = await ctx.db.select().from(bookings);
    const res = await agent.post(`/api/admin/bookings/${b.id}/approve`).set("x-csrf-token", csrf).send({ version: 1 }).expect(503);
    expect(res.body.error).toBe("calendar_disconnected");
    expect(eventIdForBooking(b.id)).toMatch(/^acb/);
  });
});
