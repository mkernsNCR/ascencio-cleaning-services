import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app, bookingBody, createTestContext, latestTokenFromOutbox, resetDatabase, type TestContext } from "../helpers";
import { actionTokens, bookings, calendarDiscrepancies, jobs, pricingVersions, resources } from "../../server/db/schema";
import { FakeCalendarGateway } from "../../server/integrations/google-calendar/fake";
import { DEFAULT_PRICING_RULES } from "../../shared/domain";
import { drain } from "../../server/jobs/worker";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.pool.end();
});

async function confirmBooking() {
  const res = await app(ctx).post("/api/bookings").send(bookingBody()).expect(201); // Wed 08:00–11:00 EDT
  const token = await latestTokenFromOutbox(ctx, "owner.booking_request", "action");
  const approved = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${token}`).send({ action: "approve", version: 1 }).expect(200);
  expect(approved.body.outcome).toBe("confirmed");
  const manage = await latestTokenFromOutbox(ctx, "customer.confirmed", "manage");
  const [b] = await ctx.db.select().from(bookings).where(eq(bookings.reference, res.body.reference));
  return { booking: b, manage };
}

const manageAvailability = (manage: string, date = "2026-10-14") =>
  app(ctx).get(`/api/booking-management/availability?from=${date}&to=${date}`).set("Authorization", `Bearer ${manage}`).expect(200);

describe("rescheduling respects unrelated calendar commitments", () => {
  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.calendar = new FakeCalendarGateway(["primary"]);
    ctx.clock.now = new Date("2026-10-12T12:00:00Z");
  });

  it("keeps a foreign event on the destination calendar that sits inside the booking's own event", async () => {
    const { manage } = await confirmBooking();
    // The owner adds a personal commitment 10:00–10:30 EDT, overlapping the booked 08:00–11:30 block.
    ctx.calendar.externalInsert("primary", new Date("2026-10-14T14:00:00Z"), new Date("2026-10-14T14:30:00Z"));

    const avail = await manageAvailability(manage);
    const times = avail.body.days[0].slots.map((s: any) => s.localTime);
    expect(times).not.toContain("08:30"); // 08:30–11:30 would overlap the 10:00 commitment
    expect(times).not.toContain("09:00");
    expect(times).toContain("11:00"); // 10:30 end + 30 min buffer

    const res = await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${manage}`)
      .send({ start: "2026-10-14T13:00:00.000Z" }).expect(409); // 09:00 EDT
    expect(res.body.error).toBe("slot_unavailable");
  });

  it("keeps busy time from busy-source calendars that overlaps the booking's own event", async () => {
    const { booking, manage } = await confirmBooking();
    await ctx.db.update(resources).set({ busyCalendars: ["personal"] }).where(eq(resources.id, booking.resourceId));
    ctx.calendar.externalBusy.set("personal", [{ start: new Date("2026-10-14T14:00:00Z"), end: new Date("2026-10-14T14:30:00Z") }]);

    const times = (await manageAvailability(manage)).body.days[0].slots.map((s: any) => s.localTime);
    expect(times).not.toContain("09:00");
    await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${manage}`)
      .send({ start: "2026-10-14T13:00:00.000Z" }).expect(409);
  });

  it("does not hide a foreign event that falls inside another booking's reserved interval", async () => {
    await confirmBooking(); // 08:00–11:00 + buffer → 11:30
    // Foreign event ending inside the other booking's trailing buffer (11:00–11:20 EDT).
    ctx.calendar.externalInsert("primary", new Date("2026-10-14T15:00:00Z"), new Date("2026-10-14T15:20:00Z"));
    const res = await app(ctx).get("/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-14&to=2026-10-14").expect(200);
    const times = res.body.days[0].slots.map((s: any) => s.localTime);
    expect(times).not.toContain("11:30"); // needs 30 min after the 11:20 commitment
    expect(times).toContain("12:00");
  });

  it("keeps a booking's Google event as busy when it was moved away from its reservation, and flags it", async () => {
    const { booking } = await confirmBooking(); // reservation 08:00–11:30 EDT
    // Someone drags the event in Google to 10:00–13:30 EDT.
    ctx.calendar.externalEdit("primary", booking.calendarEventId!, { start: new Date("2026-10-14T14:00:00Z"), end: new Date("2026-10-14T17:30:00Z") });

    const res = await app(ctx).get("/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-14&to=2026-10-14").expect(200);
    const times = res.body.days[0].slots.map((s: any) => s.localTime);
    expect(times).not.toContain("11:30");
    expect(times[0]).toBe("14:00"); // 13:30 + 30 min buffer
    const late = await app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-14T15:30:00.000Z", email: "late@example.test" })).expect(409);
    expect(late.body.error).toBe("slot_unavailable");

    const flagged = await ctx.db.select().from(calendarDiscrepancies).where(eq(calendarDiscrepancies.bookingId, booking.id));
    expect(flagged.map((d) => d.kind)).toEqual(["event_moved"]);
    // The customer's booking is not changed by the external edit.
    const [after] = await ctx.db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(after.startAt.toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("still applies the buffer only once around the system's own confirmed events", async () => {
    await confirmBooking();
    const res = await app(ctx).get("/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-14&to=2026-10-14").expect(200);
    expect(res.body.days[0].slots[0].localTime).toBe("11:30");
  });
});

describe("reschedule availability uses the booked duration", () => {
  beforeEach(async () => {
    await resetDatabase(ctx);
    ctx.calendar = new FakeCalendarGateway(["primary"]);
    ctx.clock.now = new Date("2026-10-12T12:00:00Z");
  });

  async function activatePricing(rules: typeof DEFAULT_PRICING_RULES) {
    await ctx.db.update(pricingVersions).set({ active: false });
    await ctx.db.insert(pricingVersions).values({ label: "changed", rules, active: true, approvedAt: new Date() });
  }

  it("offers slots for the original 3-hour job after prices change to 4 hours", async () => {
    const { manage } = await confirmBooking();
    await activatePricing({ ...DEFAULT_PRICING_RULES, services: { ...DEFAULT_PRICING_RULES.services, standard: { ...DEFAULT_PRICING_RULES.services.standard!, baseMinutes: 240 } } });
    const avail = await manageAvailability(manage, "2026-10-15");
    expect(avail.body.status).toBe("ok");
    expect(avail.body.durationMinutes).toBe(180);
    const times = avail.body.days[0].slots.map((s: any) => s.localTime);
    expect(times[times.length - 1]).toBe("15:00"); // 15:00 + 3h = 18:00 close
    await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${manage}`)
      .send({ start: "2026-10-15T19:00:00.000Z" }).expect(200); // Thu 15:00 EDT
  });

  it("does not force a quote fallback when the current rules would require one", async () => {
    const { manage } = await confirmBooking();
    await activatePricing({ ...DEFAULT_PRICING_RULES, services: { ...DEFAULT_PRICING_RULES.services, standard: { ...DEFAULT_PRICING_RULES.services.standard!, maxBookableMinutes: 60 } } });
    const avail = await manageAvailability(manage, "2026-10-15");
    expect(avail.body.status).toBe("ok");
    expect(avail.body.days[0].slots.length).toBeGreaterThan(0);
  });
});

describe("moving a pending request earlier caps its expiry", () => {
  beforeEach(async () => {
    await resetDatabase(ctx, { pendingExpiryHours: 72 });
    ctx.calendar = new FakeCalendarGateway(["primary"]);
    ctx.clock.now = new Date("2026-10-12T12:00:00Z");
  });

  it("caps expiry, the expiry job, and new decision links at the new start", async () => {
    const res = await app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-16T12:00:00.000Z" })).expect(201); // Fri
    const [created] = await ctx.db.select().from(bookings);
    expect(created.expiresAt!.toISOString()).toBe("2026-10-15T12:00:00.000Z"); // created + 72h
    const token = res.body.manageUrl.split("#t=")[1];

    const newStart = "2026-10-13T16:00:00.000Z"; // Tue 12:00 EDT, before the original expiry
    await app(ctx).post("/api/booking-management/reschedule").set("Authorization", `Bearer ${token}`).send({ start: newStart }).expect(200);
    const [moved] = await ctx.db.select().from(bookings);
    expect(moved.expiresAt!.toISOString()).toBe(newStart);
    const [job] = await ctx.db.select().from(jobs).where(eq(jobs.uniqueKey, `expire:${moved.id}`));
    expect(job.runAt.toISOString()).toBe(newStart);
    const decide = await ctx.db.select().from(actionTokens).where(eq(actionTokens.scope, "booking.decide"));
    const live = decide.filter((t) => !t.revokedAt && !t.consumedAt);
    expect(live.length).toBeGreaterThan(0);
    for (const t of live) expect(t.expiresAt.getTime()).toBeLessThanOrEqual(Date.parse(newStart));

    // At the new start the request expires instead of staying pending.
    ctx.clock.now = new Date("2026-10-13T16:01:00Z");
    await drain(ctx);
    const [after] = await ctx.db.select().from(bookings);
    expect(after.status).toBe("expired");
  });

  it("refuses approval once the requested start has passed", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-13T16:00:00.000Z" })).expect(201);
    const owner = await latestTokenFromOutbox(ctx, "owner.booking_request", "action");
    await ctx.db.update(bookings).set({ expiresAt: new Date("2026-10-20T00:00:00Z") }); // simulate a stale expiry
    ctx.clock.now = new Date("2026-10-13T16:30:00Z");
    await ctx.db.update(actionTokens).set({ expiresAt: new Date("2026-10-20T00:00:00Z") });
    const res = await app(ctx).post("/api/actions").set("Authorization", `Bearer ${owner}`).send({ action: "approve", version: 1 }).expect(409);
    expect(res.body.error).toBe("start_passed");
    expect((await ctx.db.select().from(bookings))[0].status).toBe("pending_approval");
  });
});
