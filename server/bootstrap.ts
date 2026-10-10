import { loadConfig, type AppConfig } from "./config";
import { createDb, createPool } from "./db";
import { runMigrations } from "./db/migrate";
import { ensureSafeguards, reportSafeguards } from "./db/safeguards";
import { ensureDefaults } from "./modules/settings/repository";
import { createMailer } from "./notifications/mailer";
import { FakeCalendarGateway } from "./integrations/google-calendar/fake";
import { GoogleCalendarGateway } from "./integrations/google-calendar/google";
import { createLogger } from "./lib/logger";
import type { AppContext } from "./context";
import { resources } from "./db/schema";
import { isNull } from "drizzle-orm";

/** Builds the runtime context, applies migrations, and seeds proposed defaults once. */
export async function bootstrap(config: AppConfig = loadConfig()): Promise<AppContext> {
  const log = createLogger(config.env === "test");
  const pool = createPool(config.databaseUrl);
  // Publish applies the managed production schema before starting the app.
  // Its schema diff does not copy our development migration-history rows.
  // Replaying the SQL here would try to recreate tables Publish already created.
  if (!config.production) {
    await runMigrations(pool, undefined, (m) => log.info(m));
  }
  const db = createDb(pool);
  await ensureDefaults(db);
  await reportSafeguards(await ensureSafeguards(pool), log);

  let calendar;
  if (config.google.mode === "fake") {
    calendar = new FakeCalendarGateway(["primary"]);
    // Development convenience: map crews without a calendar to the fake primary calendar.
    await db.update(resources).set({ destinationCalendar: "primary" }).where(isNull(resources.destinationCalendar));
    log.warn("Google Calendar is in FAKE mode (development only). No real calendar is used.");
  } else {
    calendar = new GoogleCalendarGateway(db, config, log);
  }
  if (config.mail.transport === "log") log.warn("Mail transport is LOG: emails are recorded, not sent.");

  return { config, pool, db, calendar, mailer: createMailer(config, log), log, now: () => new Date(), kick: () => {} };
}

