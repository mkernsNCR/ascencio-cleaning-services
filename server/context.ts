import type pg from "pg";
import type { AppConfig } from "./config";
import type { Database } from "./db";
import type { CalendarGateway } from "./integrations/google-calendar/types";
import type { Mailer } from "./notifications/mailer";
import type { Logger } from "./lib/logger";

/** Dependencies shared by routes, domain commands, and workers. Tests substitute fakes. */
export interface AppContext {
  config: AppConfig;
  pool: pg.Pool;
  db: Database;
  calendar: CalendarGateway;
  mailer: Mailer;
  log: Logger;
  now: () => Date;
  /** Wakes the worker promptly after new work is committed (no-op when no worker runs here). */
  kick: () => void;
}
