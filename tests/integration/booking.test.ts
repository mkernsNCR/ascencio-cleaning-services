import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, isNull, and } from "drizzle-orm";
import { app, bookingBody, createTestContext, resetDatabase, type TestContext } from "../helpers";
import { bookings, outbox, reservations, resources } from "../../server/db/schema";
import { clearFreeBusyCache } from "../../server/modules/booking/availability";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.pool.end();
});
beforeEach(async () => {
  await resetDatabase(ctx);
  ctx.calendar = new (ctx.calendar.constructor as any)(["primary"]);
});

const availabilityQuery = (extra = "") =>
  `/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-14&to=2026-10-14${extra}`;

describe("booking request", () => {
  it("stores a pending request with a buffered reservation and queues receipts", async () => {
    const res = await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body.reference).toMatch(/^AC-/);
    expect(res.body.manageUrl).toMatch(/\/booking\/manage#t=/);
    expect(res.body.estimateCents).toBeNull(); // proposed price list is not approved for publication

    const [b] = await ctx.db.select().from(bookings);
    expect(b.durationMinutes).toBe(180);
    expect(b.estimateCents).toBe(12000);
    expect(b.phone).toBe("+12405550134");
    const [r] = await ctx.db.select().from(reservations);
    expect(r.startsAt.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-10-14T15:30:00.000Z"); // 3h + 30 min buffer

    const mail = await ctx.db.select().from(outbox);
    expect(mail.map((m) => m.type).sort()).toEqual(["customer.request_received", "owner.booking_request", "owner.expiry_warning"]);
  });

  it("blocks the full buffered interval of a 3-hour job in availability", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    clearFreeBusyCache();
    const res = await app(ctx).get(availabilityQuery()).expect(200);
    const times = res.body.days[0].slots.map((s: any) => s.localTime);
    for (const blocked of ["08:00", "08:30", "09:00", "10:00", "11:00"]) expect(times).not.toContain(blocked);
    expect(times[0]).toBe("11:30");
    expect(res.body.timezone).toBe("America/New_York");
  });

  it("ignores client-supplied price and duration", async () => {
    await app(ctx).post("/api/bookings").send({ ...bookingBody(), estimatedPrice: 1, duration: 1, durationMinutes: 1, estimateCents: 1 }).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    expect(b.estimateCents).toBe(12000);
    expect(b.durationMinutes).toBe(180);
  });

  it("rejects quote-only services, invalid sizes, and uncovered ZIP codes", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody({ serviceId: "commercial" })).expect(400);
    await app(ctx).post("/api/bookings").send(bookingBody({ property: { bedrooms: 99, bathrooms: 1 } })).expect(400);
    const uncovered = await app(ctx).post("/api/bookings").send(bookingBody({ postalCode: "10001" })).expect(400);
    expect(uncovered.body.error).toBe("not_covered");
    const unknown = await app(ctx).post("/api/bookings").send(bookingBody({ serviceId: "spa_day" })).expect(400);
    expect(unknown.body.error).toBe("validation_error");
  });

  it("requires policy acknowledgement and valid contact details", async () => {
    const res = await app(ctx).post("/api/bookings").send(bookingBody({ policyAccepted: false, phone: "123", email: "nope" })).expect(400);
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(["policyAccepted", "phone", "email"]));
  });

  it("rejects starts that are not currently offered (stale, off-grid, closed, too soon)", async () => {
    for (const start of ["2026-10-14T12:10:00.000Z", "2026-10-17T13:00:00.000Z", "2026-10-12T14:00:00.000Z", "2026-10-14T20:30:00.000Z"]) {
      const res = await app(ctx).post("/api/bookings").send(bookingBody({ start })).expect(409);
      expect(res.body.error).toBe("slot_unavailable");
    }
    expect(await ctx.db.select().from(bookings)).toHaveLength(0);
  });

  it("returns the original result for a repeated idempotency key and 409 for a changed payload", async () => {
    const body = bookingBody();
    const first = await app(ctx).post("/api/bookings").send(body).expect(201);
    const again = await app(ctx).post("/api/bookings").send(body).expect(200);
    expect(again.body.reference).toBe(first.body.reference);
    const changed = await app(ctx).post("/api/bookings").send({ ...body, firstName: "Someone" }).expect(409);
    expect(changed.body.error).toBe("idempotency_conflict");
    expect(await ctx.db.select().from(bookings)).toHaveLength(1);
  });

  it("allows only one of two simultaneous overlapping requests across separate processes' connections", async () => {
    const other = await createTestContext();
    other.calendar = ctx.calendar;
    try {
      const results = await Promise.all([
        app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-14T12:00:00.000Z" })),
        app(other).post("/api/bookings").send(bookingBody({ start: "2026-10-14T13:00:00.000Z", email: "b@example.test" })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const active = await ctx.db.select().from(reservations).where(isNull(reservations.releasedAt));
      expect(active).toHaveLength(1);
    } finally {
      await other.pool.end();
    }
  });

  it("enforces non-overlap in the database even if application checks are bypassed", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    const [other] = await ctx.db.insert(bookings).values({ ...b, id: crypto.randomUUID(), reference: "AC-OTHER1", idempotencyKey: "manual-key-123456789" }).returning();
    await expect(ctx.db.insert(reservations).values({
      bookingId: other.id, resourceId: b.resourceId, kind: "booking",
      startsAt: new Date("2026-10-14T14:00:00Z"), endsAt: new Date("2026-10-14T16:00:00Z"),
    })).rejects.toThrow();
  });

  it("schedules separate crews independently", async () => {
    await ctx.db.insert(resources).values({ name: "Crew 2", sortOrder: 1, destinationCalendar: "crew2" });
    const a = await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const b = await app(ctx).post("/api/bookings").send(bookingBody({ email: "b@example.test" })).expect(201);
    expect(a.body.reference).not.toBe(b.body.reference);
    const rows = await ctx.db.select().from(bookings);
    expect(new Set(rows.map((r) => r.resourceId)).size).toBe(2);
    await app(ctx).post("/api/bookings").send(bookingBody({ email: "c@example.test" })).expect(409);
  });

  it("fails closed for a crew whose calendar errors, while other crews stay bookable", async () => {
    await ctx.db.insert(resources).values({ name: "Crew 2", sortOrder: 1, destinationCalendar: "crew2" });
    ctx.calendar.failingCalendars.add("primary");
    const res = await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    const [crew2] = await ctx.db.select().from(resources).where(eq(resources.destinationCalendar, "crew2"));
    expect(b.resourceId).toBe(crew2.id);
    expect(res.body.status).toBe("pending_approval");
  });

  it("never offers slots when the calendar is disconnected and offers a contact path instead", async () => {
    ctx.calendar.healthStatus = "revoked";
    const avail = await app(ctx).get(availabilityQuery()).expect(200);
    expect(avail.body.status).toBe("calendar_unavailable");
    expect(avail.body.days).toEqual([]);
    const res = await app(ctx).post("/api/bookings").send(bookingBody()).expect(503);
    expect(res.body.error).toBe("calendar_unavailable");
    await app(ctx).post("/api/contact").send({
      kind: "booking_fallback", locale: "en", firstName: "Ana", lastName: "L", email: "a@example.test", phone: "2405550134", message: "Need a time",
    }).expect(201);
  });

  it("blocks slots that overlap busy time on the owner's Google calendar", async () => {
    ctx.calendar.externalBusy.set("primary", [{ start: new Date("2026-10-14T16:00:00Z"), end: new Date("2026-10-14T17:00:00Z") }]); // 12–1 pm EDT
    const res = await app(ctx).get(availabilityQuery()).expect(200);
    const times = res.body.days[0].slots.map((s: any) => s.localTime);
    expect(times).toContain("08:30"); // ends 11:30 + buffer = 12:00
    expect(times).not.toContain("09:00");
    expect(times).not.toContain("13:00"); // needs 30 min buffer before
    expect(times).toContain("13:30");
  });

  it("reports quote-required and uncovered states from availability", async () => {
    const q = await app(ctx).get(availabilityQuery().replace("standard", "commercial")).expect(200);
    expect(q.body.status).toBe("quote_required");
    const nc = await app(ctx).get(availabilityQuery().replace("20001", "10001")).expect(200);
    expect(nc.body.status).toBe("not_covered");
  });

  it("refuses booking when the feature flag is off", async () => {
    const off = await createTestContext({ BOOKING_ENABLED: "false" });
    off.calendar = ctx.calendar;
    try {
      const avail = await app(off).get(availabilityQuery()).expect(200);
      expect(avail.body.status).toBe("booking_disabled");
      await app(off).post("/api/bookings").send(bookingBody()).expect(503);
    } finally {
      await off.pool.end();
    }
  });

  it("keeps reservation state consistent: only active reservations count", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    await ctx.db.update(reservations).set({ releasedAt: new Date() }).where(and(eq(reservations.bookingId, b.id)));
    clearFreeBusyCache();
    const res = await app(ctx).get(availabilityQuery()).expect(200);
    expect(res.body.days[0].slots[0].localTime).toBe("08:00");
  });
});
