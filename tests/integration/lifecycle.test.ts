import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { app, bookingBody, createTestContext, latestTokenFromOutbox, resetDatabase, type TestContext } from "../helpers";
import { bookings, calendarDiscrepancies, jobs, outbox, reservations } from "../../server/db/schema";
import { FakeCalendarGateway } from "../../server/integrations/google-calendar/fake";
import { eventIdForBooking } from "../../server/integrations/google-calendar/types";
import { clearFreeBusyCache } from "../../server/modules/booking/availability";
import { drain } from "../../server/jobs/worker";
import { rescheduleByCustomer } from "../../server/modules/booking/service";

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
  ctx.mailer.sent.length = 0;
  ctx.mailer.failNext = 0;
  ctx.clock.now = new Date("2026-10-12T12:00:00Z");
});

async function requestBooking(overrides: Record<string, unknown> = {}) {
  const res = await app(ctx).post("/api/bookings").send(bookingBody(overrides)).expect(201);
  const [b] = await ctx.db.select().from(bookings).where(eq(bookings.reference, res.body.reference));
  return { receipt: res.body, booking: b };
}

const decisionToken = () => latestTokenFromOutbox(ctx, "owner.booking_request", "action");

async function approveViaEmail(expectStatus = 200, version = 1) {
  const token = await decisionToken();
  return app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version }).expect(expectStatus);
}

async function confirmBooking() {
  const { booking } = await requestBooking();
  const res = await approveViaEmail();
  expect(res.body.outcome).toBe("confirmed");
  const manage = await latestTokenFromOutbox(ctx, "customer.confirmed", "manage");
  return { booking, manage };
}

describe("owner approval via email link", () => {
  it("GET preview is read-only, so mail scanners cannot approve", async () => {
    const { booking } = await requestBooking();
    const token = await decisionToken();
    for (let i = 0; i < 3; i++) {
      const preview = await app(ctx).get("/api/actions").set("Authorization", `Bearer ${token}`).expect(200);
      expect(preview.body.state).toBe("ready");
      expect(preview.body.booking.reference).toBe(booking.reference);
    }
    const [after] = await ctx.db.select().from(bookings);
    expect(after.status).toBe("pending_approval");
    expect(after.calendarStatus).toBe("not_created");
  });

  it("confirms only after the calendar event exists, with one deterministic event", async () => {
    const { booking } = await requestBooking();
    const res = await approveViaEmail(200);
    expect(res.body.outcome).toBe("confirmed");
    const [after] = await ctx.db.select().from(bookings);
    expect(after.status).toBe("confirmed");
    expect(after.calendarStatus).toBe("synced");
    expect(after.calendarEventId).toBe(eventIdForBooking(booking.id));
    const ev = await ctx.calendar.getEvent("primary", after.calendarEventId!);
    expect(ev?.start.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(ev?.end.toISOString()).toBe("2026-10-14T15:30:00.000Z"); // blocked interval includes buffer
    expect(ev?.summary).not.toContain("Lopez"); // minimal details on the owner event

    const confirmation = (await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.confirmed")))[0];
    expect(confirmation.attachments[0].content).toContain("DTEND:20261014T150000Z"); // ICS excludes buffer
    const reminder = (await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.reminder")))[0];
    expect(reminder.nextAttemptAt.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });

  it("rejects a replayed link and keeps a single event on repeated approval", async () => {
    await requestBooking();
    const token = await decisionToken();
    await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 1 }).expect(200);
    const replay = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 1 }).expect(409);
    expect(replay.body.error).toBe("token_used");
    expect(ctx.calendar.insertCalls).toBe(1);
  });

  it("recovers a lost insert response without creating a duplicate event", async () => {
    const { booking } = await requestBooking();
    ctx.calendar.loseNextInsertResponse = true;
    const res = await approveViaEmail(200);
    expect(res.body.outcome).toBe("processing"); // never "confirmed" while the outcome is unknown
    let [mid] = await ctx.db.select().from(bookings);
    expect(mid.status).toBe("pending_approval");
    expect(mid.calendarStatus).toBe("retrying");
    expect(await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.confirmed"))).toHaveLength(0);

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 5 * 60_000);
    await drain(ctx);
    [mid] = await ctx.db.select().from(bookings);
    expect(mid.status).toBe("confirmed");
    expect(ctx.calendar.insertCalls).toBe(1);
    expect([...ctx.calendar.calendars.get("primary")!.values()].filter((e) => e.privateProps?.bookingId === booking.id)).toHaveLength(1);
  });

  it("keeps the request pending and flags staff when Google shows a conflict at approval", async () => {
    await requestBooking();
    ctx.calendar.externalBusy.set("primary", [{ start: new Date("2026-10-14T13:00:00Z"), end: new Date("2026-10-14T14:00:00Z") }]);
    const res = await approveViaEmail(200);
    expect(res.body.outcome).toBe("conflict");
    const [b] = await ctx.db.select().from(bookings);
    expect(b.status).toBe("pending_approval");
    expect(await ctx.db.select().from(calendarDiscrepancies)).toHaveLength(1);
    expect(ctx.calendar.insertCalls).toBe(0);
  });

  it("does not consume the link when the calendar is disconnected", async () => {
    await requestBooking();
    ctx.calendar.healthStatus = "revoked";
    const res = await approveViaEmail(503);
    expect(res.body.error).toBe("calendar_disconnected");
    ctx.calendar.healthStatus = "connected";
    expect((await approveViaEmail(200)).body.outcome).toBe("confirmed");
  });

  it("rejects expired links and stale versions", async () => {
    await requestBooking();
    const token = await decisionToken();
    const stale = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 2 }).expect(409);
    expect(stale.body.error).toBe("stale_version");
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600_000);
    await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 1 }).expect(410);
    await app(ctx).get("/api/actions").set("Authorization", "Bearer not-a-real-token-value-xyz").expect(404);
  });

  it("rejection releases the slot and notifies the customer in their language", async () => {
    await requestBooking({ locale: "es" });
    const token = await decisionToken();
    const res = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "reject", version: 1, reason: "Fully booked" }).expect(200);
    expect(res.body.outcome).toBe("rejected");
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(0);
    const [mail] = await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.rejected"));
    expect(mail.subject).toMatch(/Actualización/);
    expect(mail.textBody).toContain("Fully booked");
    clearFreeBusyCache();
    const avail = await app(ctx).get("/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-14&to=2026-10-14");
    expect(avail.body.days[0].slots[0].localTime).toBe("08:00");
  });
});

describe("customer self-service", () => {
  it("shows a minimal booking view and rejects expired or invalid links", async () => {
    const { receipt } = await requestBooking();
    const token = receipt.manageUrl.split("#t=")[1];
    const res = await app(ctx).get("/api/booking-management").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body).not.toHaveProperty("email");
    expect(res.body).not.toHaveProperty("phone");
    expect(res.body).not.toHaveProperty("notes");
    await app(ctx).get("/api/booking-management").set("Authorization", "Bearer bogus-token-value-123456789").expect(404);
    ctx.clock.now = new Date("2026-12-01T00:00:00Z");
    await app(ctx).get("/api/booking-management").set("Authorization", `Bearer ${token}`).expect(410);
  });

  it("cancels a pending request immediately and treats duplicate cancellation as safe", async () => {
    const { receipt } = await requestBooking();
    const token = receipt.manageUrl.split("#t=")[1];
    const first = await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${token}`).send({}).expect(200);
    expect(first.body.status).toBe("cancelled");
    const second = await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${token}`).send({}).expect(200);
    expect(second.body.status).toBe("cancelled");
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(0);
    expect(await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.cancelled"))).toHaveLength(1);
  });

  it("cancelling a confirmed appointment keeps protection until the event deletion is verified", async () => {
    const { booking, manage } = await confirmBooking();
    ctx.calendar.failNextWrites = { count: 1, kind: "unavailable" };
    await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${manage}`).send({}).expect(200);
    let [b] = await ctx.db.select().from(bookings);
    expect(b.status).toBe("cancelled");
    expect(b.calendarStatus).toBe("delete_pending");
    await drain(ctx); // first delete attempt fails
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(1);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 10 * 60_000);
    await drain(ctx);
    [b] = await ctx.db.select().from(bookings);
    expect(b.calendarStatus).toBe("not_created");
    expect((await ctx.calendar.getEvent("primary", eventIdForBooking(booking.id)))?.status).toBe("cancelled");
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(0);
  });

  it("enforces the cancellation cutoff for confirmed appointments", async () => {
    const { manage } = await confirmBooking();
    ctx.clock.now = new Date("2026-10-14T00:00:00Z"); // 12 hours before
    const res = await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${manage}`).send({}).expect(409);
    expect(res.body.error).toBe("inside_cutoff");
  });

  it("reschedules a confirmed appointment by moving the same calendar event", async () => {
    const { booking, manage } = await confirmBooking();
    const res = await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${manage}`)
      .send({ start: "2026-10-14T13:00:00.000Z" }).expect(200); // one hour later: overlaps its own old time
    expect(res.body.pendingChange).toBeNull();
    expect(res.body.start).toBe("2026-10-14T13:00:00.000Z");
    const ev = await ctx.calendar.getEvent("primary", eventIdForBooking(booking.id));
    expect(ev?.start.toISOString()).toBe("2026-10-14T13:00:00.000Z");
    const active = await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt));
    expect(active).toHaveLength(1);
    expect(active[0].startsAt.toISOString()).toBe("2026-10-14T13:00:00.000Z");
    const [mail] = await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.rescheduled"));
    expect(mail.attachments[0].content).toContain("SEQUENCE:3");
  });

  it("preserves the original appointment when the replacement time conflicts", async () => {
    const { booking, manage } = await confirmBooking();
    // Another customer holds Thursday 08:00.
    await app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-15T12:00:00.000Z", email: "other@example.test" })).expect(201);
    const taken = await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${manage}`)
      .send({ start: "2026-10-15T12:00:00.000Z" }).expect(409);
    expect(taken.body.error).toBe("slot_unavailable");

    // A conflict that appears in Google after the request is accepted is caught by the job.
    await rescheduleByCustomer(ctx, booking.id, "2026-10-16T12:00:00.000Z");
    ctx.calendar.externalBusy.set("primary", [{ start: new Date("2026-10-16T12:30:00Z"), end: new Date("2026-10-16T13:00:00Z") }]);
    await drain(ctx);
    const [b] = await ctx.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(b.startAt.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(b.pendingChange).toBeNull();
    const ev = await ctx.calendar.getEvent("primary", eventIdForBooking(booking.id));
    expect(ev?.start.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.reschedule_failed"))).toHaveLength(1);
    const active = await ctx.db.select().from(reservations).where(and(eq(reservations.bookingId, booking.id), isNull(reservations.releasedAt)));
    expect(active.map((r) => r.kind)).toEqual(["booking"]);
  });

  it("shows unresolved reschedules as processing and blocks conflicting actions", async () => {
    const { booking, manage } = await confirmBooking();
    await rescheduleByCustomer(ctx, booking.id, "2026-10-16T12:00:00.000Z");
    const view = await app(ctx).get("/api/booking-management").set("Authorization", `Bearer ${manage}`).expect(200);
    expect(view.body.processing).toBe(true);
    expect(view.body.pendingChange.start).toBe("2026-10-16T12:00:00.000Z");
    expect(view.body.canCancel).toBe(false);
    await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${manage}`).send({}).expect(409);
  });

  it("moves a pending request by swapping its reservation and re-issuing the owner link", async () => {
    const { receipt } = await requestBooking();
    const token = receipt.manageUrl.split("#t=")[1];
    const oldOwnerToken = await decisionToken();
    await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${token}`).send({ start: "2026-10-15T14:00:00.000Z" }).expect(200);
    const [b] = await ctx.db.select().from(bookings);
    expect(b.version).toBe(2);
    expect(b.startAt.toISOString()).toBe("2026-10-15T14:00:00.000Z");
    const preview = await app(ctx).get("/api/actions").set("Authorization", `Bearer ${oldOwnerToken}`).expect(200);
    expect(preview.body.state).not.toBe("ready");
    const fresh = await decisionToken();
    const ok = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${fresh}`).send({ action: "approve", version: 2 }).expect(200);
    expect(ok.body.outcome).toBe("confirmed");
  });
});

describe("expiry and reminders", () => {
  it("expires undecided requests, releases the slot, and tells the customer", async () => {
    await requestBooking();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600_000);
    await drain(ctx);
    const [b] = await ctx.db.select().from(bookings);
    expect(b.status).toBe("expired");
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(0);
    const sentTypes = ctx.mailer.sent.map((m) => m.subject);
    expect(sentTypes.some((s) => /expired/i.test(s))).toBe(true);
  });

  it("does not auto-expire while a calendar outcome is unresolved", async () => {
    await requestBooking();
    ctx.calendar.failNextWrites = { count: 20, kind: "unavailable" };
    await approveViaEmail();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600_000);
    await drain(ctx);
    const [b] = await ctx.db.select().from(bookings);
    expect(b.status).toBe("pending_approval");
    expect(b.calendarStatus).toBe("retrying");
    expect(await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt))).toHaveLength(1);
  });

  it("suppresses stale reminders for cancelled or changed bookings", async () => {
    const { manage } = await confirmBooking();
    await app(ctx).post("/api/booking-management/cancel").set("Authorization", `Bearer ${manage}`).send({}).expect(200);
    ctx.clock.now = new Date("2026-10-13T12:30:00Z");
    await drain(ctx);
    const [reminder] = await ctx.db.select().from(outbox).where(eq(outbox.type, "customer.reminder"));
    expect(reminder.status).toBe("suppressed");
    expect(ctx.mailer.sent.some((m) => /Reminder/.test(m.subject))).toBe(false);
  });

  it("sends the reminder for a still-confirmed booking", async () => {
    await confirmBooking();
    ctx.clock.now = new Date("2026-10-13T12:30:00Z");
    await drain(ctx);
    expect(ctx.mailer.sent.some((m) => /Reminder/.test(m.subject))).toBe(true);
  });
});

describe("mail delivery reliability", () => {
  it("retries failed SMTP independently without recreating bookings or events", async () => {
    await confirmBooking();
    ctx.mailer.failNext = 1;
    await drain(ctx);
    const failed = await ctx.db.select().from(outbox).where(eq(outbox.status, "failed"));
    expect(failed).toHaveLength(1);
    const bookingCount = (await ctx.db.select().from(bookings)).length;
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 5 * 60_000);
    await drain(ctx);
    expect(await ctx.db.select().from(outbox).where(eq(outbox.status, "failed"))).toHaveLength(0);
    expect((await ctx.db.select().from(bookings)).length).toBe(bookingCount);
    expect(ctx.calendar.insertCalls).toBe(1);
  });

  it("dead-letters after the retry budget and raises a staff alert", async () => {
    await requestBooking();
    ctx.mailer.failNext = 100;
    for (let i = 0; i < 8; i++) {
      await drain(ctx);
      ctx.clock.now = new Date(ctx.clock.now.getTime() + 2 * 3600_000);
    }
    const dead = await ctx.db.select().from(outbox).where(eq(outbox.status, "dead"));
    expect(dead.length).toBeGreaterThan(0);
    const alerts = await ctx.db.select().from(outbox).where(eq(outbox.type, "staff.alert"));
    expect(alerts.length).toBeGreaterThan(0);
    expect((await ctx.db.select().from(jobs).where(eq(jobs.type, "booking.expire")))).toHaveLength(1);
  });
});
