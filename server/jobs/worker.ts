// Persistent background worker for calendar jobs and the mail outbox. Safe to run in several
// processes: rows are claimed with FOR UPDATE SKIP LOCKED. Calendar and mail work are separate.
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { bookings, jobs, outbox, type JobRow, type OutboxRow } from "../db/schema";
import { processConfirm, processDelete, processReschedule, RetryLater } from "../modules/booking/calendar-ops";
import { expireBooking, getBooking } from "../modules/booking/service";
import { enqueueStaffAlert } from "../modules/booking/notify";
import { purgeExpiredTokens } from "../modules/tokens";
import { ensureWatchChannels, reconcile, syncCalendar } from "../integrations/google-calendar/sync";
import { enqueueJob } from "./queue";
import { ensureSafeguards, reportSafeguards, resetSafeguardCache } from "../db/safeguards";

const STALE_LOCK_MS = 10 * 60_000;

export function backoffMs(attempt: number): number {
  // 30s, 1m, 2m, 4m … capped at 1h, with jitter to avoid synchronized retries.
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

async function claimJob(ctx: AppContext, specificId?: number): Promise<JobRow | null> {
  const now = ctx.now();
  const result = await ctx.db.execute(sql`
    UPDATE jobs SET status = 'running', locked_at = ${now}, attempts = attempts + 1, updated_at = ${now}
    WHERE id = (
      SELECT id FROM jobs
      WHERE status IN ('queued', 'failed') AND run_at <= ${now}
      ${specificId !== undefined ? sql`AND id = ${specificId}` : sql``}
      ORDER BY run_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`);
  const id = result.rows[0]?.id;
  if (id === undefined) return null;
  const [row] = await ctx.db.select().from(jobs).where(eq(jobs.id, Number(id)));
  return row ?? null;
}

async function runHandler(ctx: AppContext, job: JobRow): Promise<void> {
  const p = job.payload as Record<string, any>;
  switch (job.type) {
    case "calendar.confirm":
      await processConfirm(ctx, p.bookingId);
      return;
    case "calendar.reschedule":
      await processReschedule(ctx, p.bookingId);
      return;
    case "calendar.delete":
      await processDelete(ctx, p.bookingId);
      return;
    case "booking.expire": {
      const outcome = await expireBooking(ctx, p.bookingId);
      if (outcome.result === "retry_at") throw new RetryLater("Not yet expirable", outcome.at);
      return;
    }
    case "calendar.sync":
      await syncCalendar(ctx, p.calendarId);
      return;
    case "calendar.reconcile":
      await reconcile(ctx);
      return;
    case "calendar.watch_renew":
      await ensureWatchChannels(ctx);
      return;
    case "maintenance.cleanup": {
      const report = await ensureSafeguards(ctx.pool);
      resetSafeguardCache();
      reportSafeguards(report, ctx.log);
      if (report.failed.length) {
        await enqueueStaffAlert(ctx, ctx.db, `safeguards:${new Date(ctx.now()).toISOString().slice(0, 10)}`, "Online booking paused: database safeguard missing",
          `These database protections could not be restored: ${report.failed.map((f) => `${f.name} (${f.error})`).join("; ")}. Online booking shows the contact form until this is fixed.`);
      }
      await purgeExpiredTokens(ctx.db, new Date(ctx.now().getTime() - 90 * 86_400_000));
      await ctx.db.execute(sql`DELETE FROM jobs WHERE status = 'succeeded' AND updated_at < ${new Date(ctx.now().getTime() - 30 * 86_400_000)}`);
      return;
    }
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

/**
 * Runs a specific job now for a responsive request/response, or — if another worker already claimed
 * it — waits briefly for that run to finish. Returns without error either way; callers re-read state.
 */
export async function runJobNowOrWait(ctx: AppContext, jobId: number, timeoutMs = 8_000) {
  try {
    if (await runOneJob(ctx, jobId)) return;
  } catch (error) {
    ctx.log.warn("inline job attempt failed", { jobId, error });
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [job] = await ctx.db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
    if (!job || job.status !== "running") return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Runs one claimed job and records the outcome. Returns false when nothing was available. */
export async function runOneJob(ctx: AppContext, specificId?: number): Promise<boolean> {
  const job = await claimJob(ctx, specificId);
  if (!job) return false;
  try {
    await runHandler(ctx, job);
    await ctx.db.update(jobs).set({ status: "succeeded", lockedAt: null, lastError: null, updatedAt: ctx.now() }).where(eq(jobs.id, job.id));
  } catch (error) {
    const message = (error as Error).message?.slice(0, 1000) ?? String(error);
    const scheduled = error instanceof RetryLater && error.at;
    // Scheduled waits (e.g. "expire at T") don't consume the retry budget.
    const attempts = scheduled ? job.attempts - 1 : job.attempts;
    const dead = !scheduled && attempts >= job.maxAttempts;
    const runAt = scheduled ? error.at! : new Date(ctx.now().getTime() + backoffMs(job.attempts));
    await ctx.db.update(jobs).set({
      status: dead ? "dead" : "failed", attempts, lockedAt: null, lastError: message, runAt, updatedAt: ctx.now(),
    }).where(eq(jobs.id, job.id));
    if (!scheduled) ctx.log.warn("job attempt failed", { jobId: job.id, type: job.type, attempt: job.attempts, dead, error: message });
    if (dead) {
      const bookingId = (job.payload as any)?.bookingId as string | undefined;
      const b = bookingId ? await getBooking(ctx.db, bookingId) : undefined;
      await enqueueStaffAlert(ctx, ctx.db, `job-dead:${job.id}`, `${job.type} failed${b ? ` for ${b.reference}` : ""}`,
        `A background task stopped retrying after ${job.attempts} attempts: ${message}. Customer-facing state was not changed. Review it in the dashboard (Operations → Jobs) and retry once the cause is fixed.`);
    }
  }
  return true;
}

async function claimMail(ctx: AppContext): Promise<OutboxRow | null> {
  const now = ctx.now();
  const result = await ctx.db.execute(sql`
    UPDATE outbox SET status = 'sending', locked_at = ${now}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM outbox WHERE status IN ('queued', 'failed') AND next_attempt_at <= ${now}
      ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id`);
  const id = result.rows[0]?.id;
  if (id === undefined) return null;
  const [row] = await ctx.db.select().from(outbox).where(eq(outbox.id, Number(id)));
  return row ?? null;
}

/** Sends one outbox message. Reminders and warnings are suppressed if the booking moved on. */
export async function runOneMail(ctx: AppContext): Promise<boolean> {
  const mail = await claimMail(ctx);
  if (!mail) return false;
  if (mail.sendCondition) {
    const [b] = await ctx.db.select({ status: bookings.status, version: bookings.version }).from(bookings).where(eq(bookings.id, mail.sendCondition.bookingId));
    if (!b || b.status !== mail.sendCondition.status || b.version !== mail.sendCondition.version) {
      await ctx.db.update(outbox).set({ status: "suppressed", lockedAt: null, lastError: "booking changed since queued" }).where(eq(outbox.id, mail.id));
      return true;
    }
  }
  try {
    await ctx.mailer.send({ to: mail.recipient, subject: mail.subject, html: mail.html, text: mail.textBody, attachments: mail.attachments, messageKey: mail.messageKey });
    await ctx.db.update(outbox).set({ status: "sent", sentAt: ctx.now(), lockedAt: null, lastError: null }).where(eq(outbox.id, mail.id));
  } catch (error) {
    const message = (error as Error).message?.slice(0, 500) ?? String(error);
    const dead = mail.attempts >= mail.maxAttempts;
    await ctx.db.update(outbox).set({
      status: dead ? "dead" : "failed", lockedAt: null, lastError: message,
      nextAttemptAt: new Date(ctx.now().getTime() + backoffMs(mail.attempts)),
    }).where(eq(outbox.id, mail.id));
    ctx.log.warn("mail delivery failed", { outboxId: mail.id, type: mail.type, attempt: mail.attempts, dead });
    // Avoid alert loops: failures of alert mail itself are visible only in the dashboard.
    if (dead && mail.type !== "staff.alert") {
      await enqueueStaffAlert(ctx, ctx.db, `mail-dead:${mail.id}`, `Email could not be delivered (${mail.type})`,
        `An email stopped retrying after ${mail.attempts} attempts (${message}). Review and retry it in the dashboard (Operations → Email).`);
    }
  }
  return true;
}

/** Returns rows stuck in running/sending after a crash to the retry pool. */
export async function recoverStaleLocks(ctx: AppContext) {
  const cutoff = new Date(ctx.now().getTime() - STALE_LOCK_MS);
  await ctx.db.execute(sql`UPDATE jobs SET status = 'failed', locked_at = NULL, last_error = 'worker lock expired' WHERE status = 'running' AND locked_at < ${cutoff}`);
  // A "sending" row may or may not have reached SMTP; retrying risks a duplicate, which is observable via the message key.
  await ctx.db.execute(sql`UPDATE outbox SET status = 'failed', locked_at = NULL, last_error = 'worker lock expired (delivery outcome unknown)' WHERE status = 'sending' AND locked_at < ${cutoff}`);
}

/** Drains available work. Used by the loop and by tests. */
export async function drain(ctx: AppContext, limit = 200) {
  let processed = 0;
  while (processed < limit) {
    const didJob = await runOneJob(ctx);
    const didMail = await runOneMail(ctx);
    if (!didJob && !didMail) break;
    processed++;
  }
  return processed;
}

export async function schedulePeriodic(ctx: AppContext) {
  const now = ctx.now();
  await enqueueJob(ctx.db, { type: "calendar.reconcile", uniqueKey: "periodic:reconcile", requeueIfDone: true, runAt: now });
  await enqueueJob(ctx.db, { type: "calendar.watch_renew", uniqueKey: "periodic:watch", requeueIfDone: true, runAt: now });
  await enqueueJob(ctx.db, { type: "maintenance.cleanup", uniqueKey: "periodic:cleanup", requeueIfDone: true, runAt: now });
}

export interface WorkerHandle {
  stop(): Promise<void>;
  kick(): void;
}

export function startWorker(ctx: AppContext, { pollMs = 5_000, periodicMs = 15 * 60_000 } = {}): WorkerHandle {
  let stopped = false;
  let running: Promise<void> | null = null;
  let wake: (() => void) | null = null;

  const loop = async () => {
    let lastPeriodic = 0;
    while (!stopped) {
      try {
        if (Date.now() - lastPeriodic > periodicMs) {
          await recoverStaleLocks(ctx);
          await schedulePeriodic(ctx);
          lastPeriodic = Date.now();
        }
        await drain(ctx, 50);
      } catch (error) {
        ctx.log.error("worker loop error", { error });
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = null;
    }
  };
  running = loop();
  ctx.log.info("background worker started");
  return {
    kick: () => wake?.(),
    stop: async () => {
      stopped = true;
      wake?.();
      await running;
    },
  };
}
