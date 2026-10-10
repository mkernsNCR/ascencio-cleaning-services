import { sql, eq } from "drizzle-orm";
import request from "supertest";
import { loadConfig } from "../server/config";
import { createDb, createPool } from "../server/db";
import { runMigrations } from "../server/db/migrate";
import { ensureDefaults } from "../server/modules/settings/repository";
import { FakeCalendarGateway } from "../server/integrations/google-calendar/fake";
import { LogMailer } from "../server/notifications/mailer";
import { createLogger } from "../server/lib/logger";
import { createApp } from "../server/http/app";
import type { AppContext } from "../server/context";
import { businessSettings, resources, staffUsers } from "../server/db/schema";
import { clearFreeBusyCache } from "../server/modules/booking/availability";
import { hashPassword } from "../server/lib/crypto";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "../shared/domain";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost/ascencio_test";

/** Monday 2026-10-12 08:00 America/New_York (EDT). Lead time 24h → first bookable day Tuesday. */
export const BASE_NOW = new Date("2026-10-12T12:00:00Z");

export interface TestContext extends AppContext {
  calendar: FakeCalendarGateway;
  mailer: LogMailer;
  clock: { now: Date };
}

let migrated = false;

export async function createTestContext(overrides: Record<string, string> = {}): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    PUBLIC_BASE_URL: "http://localhost:5000",
    MAIL_TRANSPORT: "log",
    GOOGLE_CALENDAR_MODE: "fake",
    ...overrides,
  } as NodeJS.ProcessEnv);
  const pool = createPool(config.databaseUrl);
  if (!migrated) {
    await runMigrations(pool, undefined, () => {});
    migrated = true;
  }
  const db = createDb(pool);
  const clock = { now: new Date(BASE_NOW) };
  return {
    config,
    pool,
    db,
    calendar: new FakeCalendarGateway(["primary"]),
    mailer: new LogMailer(),
    log: createLogger(true),
    now: () => new Date(clock.now),
    kick: () => {},
    clock,
  };
}

/** Empties all application tables and re-seeds proposed defaults with crew 1 mapped to "primary". */
export async function resetDatabase(ctx: AppContext, settings: Partial<BusinessSettings> = {}) {
  await ctx.db.execute(sql`
    TRUNCATE booking_audit, reservations, outbox, jobs, action_tokens, calendar_discrepancies, calendar_sync_state,
      calendar_connections, bookings, resources, pricing_versions, business_settings, contact_requests, reviews,
      analytics_events, session, staff_users RESTART IDENTITY CASCADE`);
  await ensureDefaults(ctx.db);
  await ctx.db.update(resources).set({ destinationCalendar: "primary" });
  if (Object.keys(settings).length) {
    await ctx.db.update(businessSettings).set({ settings: { ...DEFAULT_BUSINESS_SETTINGS, ...settings } }).where(eq(businessSettings.id, 1));
  }
  clearFreeBusyCache();
}

export function app(ctx: AppContext) {
  return request(createApp(ctx));
}

let keyCounter = 0;
export function bookingBody(overrides: Record<string, unknown> = {}) {
  keyCounter++;
  return {
    idempotencyKey: `test-key-${Date.now()}-${keyCounter}-abcdef`,
    locale: "en",
    serviceId: "standard",
    property: { bedrooms: 1, bathrooms: 1 },
    postalCode: "20001",
    start: "2026-10-14T12:00:00.000Z", // Wed 08:00 EDT
    firstName: "Ana",
    lastName: "Lopez",
    email: "ana@example.test",
    phone: "(240) 555-0134",
    address: "123 Main St, Washington, DC",
    notes: "Gate code is in the email",
    policyAccepted: true,
    ...overrides,
  };
}

export async function createStaff(ctx: AppContext, email = "owner@example.test", password = "correct horse battery staple") {
  await ctx.db.insert(staffUsers).values({ email, name: "Owner", passwordHash: await hashPassword(password) });
  return { email, password };
}

/** Logged-in supertest agent plus its CSRF token. */
export async function staffAgent(ctx: AppContext) {
  const creds = await createStaff(ctx);
  const agent = request.agent(createApp(ctx));
  const res = await agent.post("/api/admin/login").send(creds).expect(200);
  return { agent, csrf: res.body.csrfToken as string };
}

/** Extracts a token from the URL fragment of the most recent matching outbox message. */
export async function latestTokenFromOutbox(ctx: AppContext, type: string, kind: "action" | "manage"): Promise<string> {
  const result = await ctx.db.execute<{ text_body: string }>(sql`SELECT text_body FROM outbox WHERE type = ${type} ORDER BY id DESC LIMIT 1`);
  const text = result.rows[0]?.text_body ?? "";
  const pattern = kind === "action" ? /\/action#t=([A-Za-z0-9_-]+)/ : /\/booking\/manage#t=([A-Za-z0-9_-]+)/;
  const match = pattern.exec(text);
  if (!match) throw new Error(`No ${kind} token in latest ${type} message`);
  return match[1];
}
