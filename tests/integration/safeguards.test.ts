import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { app, bookingBody, createTestContext, resetDatabase, staffAgent, type TestContext } from "../helpers";
import { bookings, reservations } from "../../server/db/schema";
import { runMigrations } from "../../server/db/migrate";
import { ensureSafeguards, missingCriticalSafeguards, resetSafeguardCache } from "../../server/db/safeguards";
import { FakeCalendarGateway } from "../../server/integrations/google-calendar/fake";

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
  resetSafeguardCache();
});
afterEach(async () => {
  // Leave the shared test database healthy for other test files.
  await ctx.db.execute(sql`DELETE FROM reservations WHERE id IN (
    SELECT b.id FROM reservations a JOIN reservations b ON a.id < b.id AND a.resource_id = b.resource_id
      AND a.booking_id <> b.booking_id AND a.released_at IS NULL AND b.released_at IS NULL
      AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at))`);
  await ensureSafeguards(ctx.pool);
  resetSafeguardCache();
});

/** Reproduces what `drizzle-kit push` did to this schema in a scratch database. */
async function simulateDrizzlePush() {
  await ctx.db.execute(sql.raw(`
    ALTER TABLE reservations DROP COLUMN period;
    ALTER TABLE bookings DROP CONSTRAINT bookings_resource_id_fkey;
    ALTER TABLE reservations DROP CONSTRAINT reservations_booking_id_fkey;
    DROP INDEX pricing_versions_one_active;
    DROP TRIGGER bookings_transition ON bookings;
    DROP TABLE session;
    DROP TABLE schema_migrations;`));
}

describe("database safeguards", () => {
  it("are all present after normal migrations", async () => {
    expect(await missingCriticalSafeguards(ctx.db)).toEqual([]);
    const report = await ensureSafeguards(ctx.pool);
    expect(report).toEqual({ repaired: [], failed: [] });
  });

  it("are restored after a schema sync removed them, and enforcement works again", async () => {
    await simulateDrizzlePush();
    expect((await missingCriticalSafeguards(ctx.db)).sort()).toEqual(["bookings_transition trigger", "reservations.period generated column", "reservations_no_overlap"]);

    await runMigrations(ctx.pool, undefined, () => {}); // tables exist, migration record gone → baseline
    const report = await ensureSafeguards(ctx.pool);
    expect(report.failed).toEqual([]);
    expect(report.repaired).toEqual(expect.arrayContaining([
      "session table", "reservations.period generated column", "reservations_no_overlap", "bookings_transition trigger",
      "pricing_versions_one_active", "bookings_resource_id_fkey", "reservations_booking_id_fkey",
    ]));
    expect(await missingCriticalSafeguards(ctx.db)).toEqual([]);

    // Overlap protection is back.
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    const [b] = await ctx.db.select().from(bookings);
    const [other] = await ctx.db.insert(bookings).values({ ...b, id: crypto.randomUUID(), reference: "AC-OTHER2", idempotencyKey: "manual-key-987654321" }).returning();
    await expect(ctx.db.insert(reservations).values({
      bookingId: other.id, resourceId: b.resourceId, kind: "booking", startsAt: new Date("2026-10-14T13:00:00Z"), endsAt: new Date("2026-10-14T14:00:00Z"),
    })).rejects.toThrow();
    // Status transition rule is back.
    await expect(ctx.db.update(bookings).set({ status: "completed" }).where(sql`id = ${b.id}`)).rejects.toThrow(/invalid booking transition/);
    // Staff login works (session table restored).
    await staffAgent(ctx);
  });

  it("pauses online booking when overlap protection cannot be restored", async () => {
    await app(ctx).post("/api/bookings").send(bookingBody()).expect(201);
    await ctx.db.execute(sql`ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap`);
    // While unprotected, an overlapping reservation slipped in.
    const [b] = await ctx.db.select().from(bookings);
    const [other] = await ctx.db.insert(bookings).values({ ...b, id: crypto.randomUUID(), reference: "AC-OTHER3", idempotencyKey: "manual-key-555555555" }).returning();
    await ctx.db.insert(reservations).values({
      bookingId: other.id, resourceId: b.resourceId, kind: "booking", startsAt: new Date("2026-10-14T13:00:00Z"), endsAt: new Date("2026-10-14T14:00:00Z"),
    });

    const report = await ensureSafeguards(ctx.pool);
    expect(report.failed.map((f) => f.name)).toEqual(["reservations_no_overlap"]);
    expect(report.failed[0].error).toMatch(/overlapping active reservations/);
    resetSafeguardCache();

    const avail = await app(ctx).get("/api/availability?serviceId=standard&bedrooms=1&bathrooms=1&postalCode=20001&from=2026-10-15&to=2026-10-15").expect(200);
    expect(avail.body.status).toBe("booking_disabled");
    const res = await app(ctx).post("/api/bookings").send(bookingBody({ start: "2026-10-15T12:00:00.000Z", email: "x@example.test" })).expect(503);
    expect(res.body.error).toBe("booking_disabled");

    const { agent } = await staffAgent(ctx);
    const overview = await agent.get("/api/admin/overview").expect(200);
    expect(overview.body.launchChecklist.databaseSafeguardsMissing).toEqual(["reservations_no_overlap"]);
  });
});
