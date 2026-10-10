import { eq, sql } from "drizzle-orm";
import { jobs, type JobRow } from "../db/schema";
import type { Executor } from "../db";

export type JobType =
  | "calendar.confirm"
  | "calendar.reschedule"
  | "calendar.delete"
  | "calendar.sync"
  | "calendar.reconcile"
  | "calendar.watch_renew"
  | "booking.expire"
  | "maintenance.cleanup";

export interface EnqueueJob {
  type: JobType;
  payload?: Record<string, unknown>;
  /** Deduplicates work. Existing queued/running jobs with the same key are left alone. */
  uniqueKey?: string;
  /** Re-arm a finished job with the same key (for idempotent handlers such as sync or approval retry). */
  requeueIfDone?: boolean;
  runAt?: Date;
  maxAttempts?: number;
}

/** Enqueues a job inside the caller's transaction. Returns the job id. */
export async function enqueueJob(db: Executor, job: EnqueueJob): Promise<number | null> {
  const values = {
    type: job.type,
    payload: job.payload ?? {},
    uniqueKey: job.uniqueKey ?? null,
    runAt: job.runAt ?? new Date(),
    maxAttempts: job.maxAttempts ?? 8,
  };
  if (!job.uniqueKey) {
    const [row] = await db.insert(jobs).values(values).returning({ id: jobs.id });
    return row.id;
  }
  if (job.requeueIfDone) {
    const result = await db.execute<{ id: number }>(sql`
      INSERT INTO jobs (type, payload, unique_key, run_at, max_attempts)
      VALUES (${values.type}, ${JSON.stringify(values.payload)}::jsonb, ${values.uniqueKey}, ${values.runAt}, ${values.maxAttempts})
      ON CONFLICT (unique_key) DO UPDATE
        SET status = 'queued', attempts = 0, last_error = NULL, run_at = EXCLUDED.run_at,
            payload = EXCLUDED.payload, updated_at = now()
        WHERE jobs.status IN ('succeeded', 'dead')
      RETURNING id`);
    if (result.rows[0]) return Number(result.rows[0].id);
  } else {
    const [row] = await db.insert(jobs).values(values).onConflictDoNothing({ target: jobs.uniqueKey }).returning({ id: jobs.id });
    if (row) return row.id;
  }
  const existing = await db.execute<{ id: number }>(sql`SELECT id FROM jobs WHERE unique_key = ${job.uniqueKey}`);
  return existing.rows[0] ? Number(existing.rows[0].id) : null;
}

export async function getJob(db: Executor, id: number): Promise<JobRow | undefined> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  return row;
}
