// Database safeguards that tools syncing from the Drizzle schema (e.g. `drizzle-kit push`) silently
// remove, because Drizzle cannot represent them. They are re-checked and restored on every startup
// and periodically by the worker. If one cannot be restored, online booking pauses (fail safe).
import type pg from "pg";
import type { Executor } from "./index";
import { sql } from "drizzle-orm";
import type { Logger } from "../lib/logger";
import { AppError } from "../lib/errors";

interface Safeguard {
  name: string;
  /** Returns true when present. */
  check: string;
  /** Idempotent statement(s) that restore it. */
  restore: string;
}

const fk = (table: string, name: string, column: string, ref: string): Safeguard => ({
  name,
  check: `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND conrelid = '${table}'::regclass)`,
  restore: `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${ref}`,
});

const index = (name: string, ddl: string): Safeguard => ({
  name,
  check: `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = '${name}' AND relkind = 'i')`,
  restore: ddl,
});

// Order matters: the period column before the exclusion constraint that uses it.
const SAFEGUARDS: Safeguard[] = [
  {
    name: "btree_gist extension",
    check: `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')`,
    restore: `CREATE EXTENSION IF NOT EXISTS btree_gist`,
  },
  {
    name: "session table",
    check: `SELECT to_regclass('public.session') IS NOT NULL`,
    restore: `CREATE TABLE IF NOT EXISTS session (sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
      CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire)`,
  },
  {
    name: "reservations.period generated column",
    check: `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'reservations'::regclass AND attname = 'period' AND NOT attisdropped AND attgenerated = 's')`,
    restore: `ALTER TABLE reservations DROP COLUMN IF EXISTS period;
      ALTER TABLE reservations ADD COLUMN period tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED`,
  },
  {
    name: "reservations_no_overlap",
    check: `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap' AND conrelid = 'reservations'::regclass AND contype = 'x')`,
    restore: `ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (resource_id WITH =, booking_id WITH <>, period WITH &&) WHERE (released_at IS NULL)`,
  },
  {
    name: "bookings_transition trigger",
    check: `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bookings_transition' AND tgrelid = 'bookings'::regclass AND NOT tgisinternal)
      AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'bookings_enforce_transition')`,
    restore: `CREATE OR REPLACE FUNCTION bookings_enforce_transition() RETURNS trigger AS $$
      BEGIN
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
             (OLD.status = 'pending_approval' AND NEW.status IN ('confirmed', 'rejected', 'cancelled', 'expired'))
          OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed'))
        ) THEN
          RAISE EXCEPTION 'invalid booking transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.version < OLD.version THEN
          RAISE EXCEPTION 'booking version cannot decrease' USING ERRCODE = 'check_violation';
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS bookings_transition ON bookings;
      CREATE TRIGGER bookings_transition BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION bookings_enforce_transition()`,
  },
  index("pricing_versions_one_active", `CREATE UNIQUE INDEX IF NOT EXISTS pricing_versions_one_active ON pricing_versions (active) WHERE active`),
  index("bookings_calendar_event_idx", `CREATE UNIQUE INDEX IF NOT EXISTS bookings_calendar_event_idx ON bookings (calendar_event_id) WHERE calendar_event_id IS NOT NULL`),
  fk("pricing_versions", "pricing_versions_created_by_fkey", "created_by", "staff_users (id)"),
  fk("bookings", "bookings_pricing_version_id_fkey", "pricing_version_id", "pricing_versions (id)"),
  fk("bookings", "bookings_resource_id_fkey", "resource_id", "resources (id)"),
  fk("reservations", "reservations_booking_id_fkey", "booking_id", "bookings (id)"),
  fk("reservations", "reservations_resource_id_fkey", "resource_id", "resources (id)"),
  fk("booking_audit", "booking_audit_booking_id_fkey", "booking_id", "bookings (id)"),
  fk("calendar_discrepancies", "calendar_discrepancies_booking_id_fkey", "booking_id", "bookings (id)"),
  fk("calendar_discrepancies", "calendar_discrepancies_resolved_by_fkey", "resolved_by", "staff_users (id)"),
  fk("outbox", "outbox_booking_id_fkey", "booking_id", "bookings (id)"),
  index("bookings_status_start_idx", `CREATE INDEX IF NOT EXISTS bookings_status_start_idx ON bookings (status, start_at)`),
  index("reservations_booking_idx", `CREATE INDEX IF NOT EXISTS reservations_booking_idx ON reservations (booking_id)`),
  index("booking_audit_booking_idx", `CREATE INDEX IF NOT EXISTS booking_audit_booking_idx ON booking_audit (booking_id, created_at)`),
  index("action_tokens_subject_idx", `CREATE INDEX IF NOT EXISTS action_tokens_subject_idx ON action_tokens (scope, subject_id)`),
  index("jobs_ready_idx", `CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs (run_at) WHERE status IN ('queued', 'failed')`),
  index("outbox_ready_idx", `CREATE INDEX IF NOT EXISTS outbox_ready_idx ON outbox (next_attempt_at) WHERE status IN ('queued', 'failed')`),
  index("analytics_events_name_idx", `CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events (name, created_at)`),
];

/** Wraps a check so its single boolean result always comes back in a column named "ok". */
const checkQuery = (guard: Safeguard) => `SELECT (${guard.check}) AS ok`;

/** Safeguards whose absence makes online booking unsafe (overlaps or invalid transitions possible). */
const CRITICAL = new Set(["btree_gist extension", "reservations.period generated column", "reservations_no_overlap", "bookings_transition trigger"]);

export interface SafeguardReport {
  repaired: string[];
  /** Safeguards still missing after repair, with the reason. */
  failed: { name: string; error: string }[];
}

/**
 * Checks every safeguard and restores missing ones, each in its own transaction so one failure (for
 * example existing overlapping reservations blocking the exclusion constraint) does not block others.
 */
export async function ensureSafeguards(pool: pg.Pool): Promise<SafeguardReport> {
  const report: SafeguardReport = { repaired: [], failed: [] };
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727275)");
    for (const guard of SAFEGUARDS) {
      const present = (await client.query<{ ok: boolean }>(checkQuery(guard))).rows[0]?.ok === true;
      if (present) continue;
      try {
        await client.query("BEGIN");
        await client.query(guard.restore);
        await client.query("COMMIT");
        report.repaired.push(guard.name);
      } catch (error) {
        await client.query("ROLLBACK");
        let message = (error as Error).message;
        if (guard.name === "reservations_no_overlap") {
          message += " — overlapping active reservations already exist; resolve them in the dashboard, then restart or wait for the next maintenance run";
        }
        report.failed.push({ name: guard.name, error: message });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727275)").catch(() => {});
    client.release();
  }
  return report;
}

/** Names of critical safeguards currently missing (read-only). */
export async function missingCriticalSafeguards(db: Executor): Promise<string[]> {
  const missing: string[] = [];
  for (const guard of SAFEGUARDS) {
    if (!CRITICAL.has(guard.name)) continue;
    const result = await db.execute<{ ok: boolean }>(sql.raw(checkQuery(guard)));
    if (result.rows[0]?.ok !== true) missing.push(guard.name);
  }
  return missing;
}

/**
 * Authoritative check for writes. Call inside the write transaction AFTER inserting the reservation:
 * the insert holds a lock on `reservations` that conflicts with ALTER TABLE, so a constraint drop
 * either committed before (and is seen here, rolling the write back) or waits until this transaction
 * commits (and this row was checked under the constraint). Never uses the cache.
 */
export async function assertBookingSafeguards(tx: Executor): Promise<void> {
  const missing = await missingCriticalSafeguards(tx);
  if (missing.length) {
    cached = { at: Date.now(), missing };
    throw new AppError(503, "booking_disabled", `Database safeguards missing: ${missing.join(", ")}`);
  }
}

// Short cache for read-only paths (availability display, early exits before slow calendar calls).
// Writes must use assertBookingSafeguards() instead.
let cached: { at: number; missing: string[] } | null = null;
const CACHE_MS = 30_000;

/** Cached, read-only health check. May be up to 30 seconds stale; not a guarantee for writes. */
export async function bookingSafeguardsHealthy(db: Executor): Promise<boolean> {
  if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), missing: await missingCriticalSafeguards(db) };
  return cached.missing.length === 0;
}

export function resetSafeguardCache() {
  cached = null;
}

/** Logs repaired or still-missing database safeguards. */
export function reportSafeguards(report: SafeguardReport, log: Logger) {
  if (report.repaired.length) {
    log.warn("restored missing database safeguards (was the schema synced by an external tool such as drizzle-kit push?)", { restored: report.repaired.join(", ") });
  }
  for (const f of report.failed) log.error("database safeguard could not be restored; online booking is paused until it is", { safeguard: f.name, error: f.error });
}
