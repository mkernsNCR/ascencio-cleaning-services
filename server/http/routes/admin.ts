import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { staffLoginSchema } from "@shared/api";
import type { AppContext } from "../../context";
import {
  bookingAudit, bookings, businessSettings, calendarDiscrepancies, calendarSyncState, contactRequests, jobs, outbox,
  pricingVersions, resources, reviews, staffUsers,
} from "../../db/schema";
import { verifyPassword } from "../../lib/crypto";
import { missingCriticalSafeguards } from "../../db/safeguards";
import { conflict, notFound, unauthorized } from "../../lib/errors";
import { completeBooking, getBooking, rejectBooking, requestApproval } from "../../modules/booking/service";
import { moderateReview } from "../../modules/inquiries";
import { getActivePricing, getSettings, listPricingVersions } from "../../modules/settings/repository";
import { businessSettingsSchema, pricingRulesSchema, resourceSchema } from "../../modules/settings/validation";
import { runJobNowOrWait } from "../../jobs/worker";
import { enqueueJob } from "../../jobs/queue";
import { asyncHandler, ensureCsrfToken, limiter, requireCsrf, requireStaff } from "../middleware";
import { decisionOutcome } from "./actions";

const versionBody = z.object({ version: z.number().int().positive() });

export function adminRoutes(ctx: AppContext) {
  const r = Router();
  const loginLimit = limiter(15, 10, ctx.config.env !== "test");

  r.post("/login", loginLimit, asyncHandler(async (req, res) => {
    const { email, password } = staffLoginSchema.parse(req.body);
    const [staff] = await ctx.db.select().from(staffUsers).where(eq(staffUsers.email, email));
    // Verify even when the account doesn't exist to keep timing similar.
    const ok = await verifyPassword(password, staff?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    if (!staff || !ok || staff.disabledAt) throw unauthorized("invalid_credentials");
    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.staffId = staff.id;
    const csrfToken = ensureCsrfToken(req);
    res.json({ staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }, csrfToken });
  }));

  r.get("/session", asyncHandler(async (req, res) => {
    if (!req.session.staffId) return res.status(401).json({ error: "unauthorized" });
    const [staff] = await ctx.db.select().from(staffUsers).where(eq(staffUsers.id, req.session.staffId));
    if (!staff || staff.disabledAt) return res.status(401).json({ error: "unauthorized" });
    res.json({ staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }, csrfToken: ensureCsrfToken(req) });
  }));

  // Everything below requires an authenticated staff session; mutations also require CSRF.
  r.use(requireStaff(ctx));
  r.use((req, res, next) => (req.method === "GET" ? next() : requireCsrf(req, res, next)));
  r.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  r.post("/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  r.get("/overview", asyncHandler(async (_req, res) => {
    const now = ctx.now();
    const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
    const [pending, upcoming, discrepancies, mailFailed, jobsDead, jobsRetrying] = await Promise.all([
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(bookings).where(eq(bookings.status, "pending_approval"))),
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(bookings).where(and(eq(bookings.status, "confirmed"), gte(bookings.startAt, now)))),
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(calendarDiscrepancies).where(isNull(calendarDiscrepancies.resolvedAt))),
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(outbox).where(inArray(outbox.status, ["failed", "dead"]))),
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, "dead"))),
      count(ctx.db.select({ n: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.status, "failed"), sql`${jobs.type} <> 'booking.expire'`))),
    ]);
    const health = await ctx.calendar.health();
    const sync = await ctx.db.select().from(calendarSyncState);
    const { approvedAt } = await getSettings(ctx.db);
    const pricing = await getActivePricing(ctx.db);
    res.json({
      counts: { pending, upcoming, discrepancies, mailFailed, jobsDead, jobsRetrying },
      calendar: { ...health, mode: ctx.config.google.mode, sync: sync.map((s) => ({ calendarId: s.calendarId, lastSyncAt: s.lastSyncAt, lastError: s.lastError, channelExpiresAt: s.channelExpiresAt })) },
      launchChecklist: {
        settingsApproved: !!approvedAt, pricesApproved: pricing.approved, mail: ctx.mailer.kind, bookingEnabled: ctx.config.bookingEnabled,
        databaseSafeguardsMissing: await missingCriticalSafeguards(ctx.db),
      },
    });
  }));

  r.get("/bookings", asyncHandler(async (req, res) => {
    const q = z.object({
      status: z.enum(["pending_approval", "confirmed", "rejected", "cancelled", "expired", "completed"]).optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }).parse(req.query);
    const conditions = [];
    if (q.status) conditions.push(eq(bookings.status, q.status));
    if (q.from) conditions.push(gte(bookings.startAt, new Date(q.from)));
    if (q.to) conditions.push(lte(bookings.startAt, new Date(q.to)));
    const rows = await ctx.db.select().from(bookings).where(conditions.length ? and(...conditions) : undefined)
      .orderBy(q.status === "pending_approval" || q.status === "confirmed" ? asc(bookings.startAt) : desc(bookings.createdAt)).limit(200);
    res.json(rows.map(({ idempotencyKey: _k, requestHash: _h, ...b }) => b));
  }));

  r.get("/bookings/:id", asyncHandler(async (req, res) => {
    const b = await getBooking(ctx.db, z.string().uuid().parse(req.params.id));
    if (!b) throw notFound();
    const history = await ctx.db.select().from(bookingAudit).where(eq(bookingAudit.bookingId, b.id)).orderBy(asc(bookingAudit.createdAt));
    const mail = await ctx.db.select({ id: outbox.id, type: outbox.type, status: outbox.status, recipient: outbox.recipient, attempts: outbox.attempts, lastError: outbox.lastError, sentAt: outbox.sentAt, nextAttemptAt: outbox.nextAttemptAt })
      .from(outbox).where(eq(outbox.bookingId, b.id)).orderBy(asc(outbox.id));
    const { idempotencyKey: _k, requestHash: _h, ...booking } = b;
    res.json({ booking, history, mail });
  }));

  r.post("/bookings/:id/approve", asyncHandler(async (req, res) => {
    const { version } = versionBody.parse(req.body);
    const id = z.string().uuid().parse(req.params.id);
    const { jobId } = await requestApproval(ctx, { bookingId: id, version, actor: { kind: "staff", id: req.staff!.id } });
    if (jobId) await runJobNowOrWait(ctx, jobId);
    const b = await getBooking(ctx.db, id);
    res.json({ outcome: decisionOutcome(b!), booking: b });
  }));

  r.post("/bookings/:id/reject", asyncHandler(async (req, res) => {
    const { version, reason } = versionBody.extend({ reason: z.string().trim().max(500).optional() }).parse(req.body);
    const b = await rejectBooking(ctx, { bookingId: z.string().uuid().parse(req.params.id), version, reason: reason || undefined, actor: { kind: "staff", id: req.staff!.id } });
    res.json({ outcome: decisionOutcome(b), booking: b });
  }));

  r.post("/bookings/:id/complete", asyncHandler(async (req, res) => {
    const { version } = versionBody.parse(req.body);
    const b = await completeBooking(ctx, { bookingId: z.string().uuid().parse(req.params.id), version, actor: { kind: "staff", id: req.staff!.id } });
    res.json({ booking: b });
  }));

  r.get("/discrepancies", asyncHandler(async (_req, res) => {
    const rows = await ctx.db.select({ d: calendarDiscrepancies, reference: bookings.reference, startAt: bookings.startAt })
      .from(calendarDiscrepancies).leftJoin(bookings, eq(bookings.id, calendarDiscrepancies.bookingId))
      .where(isNull(calendarDiscrepancies.resolvedAt)).orderBy(desc(calendarDiscrepancies.createdAt)).limit(100);
    res.json(rows.map((r) => ({ ...r.d, reference: r.reference, startAt: r.startAt })));
  }));

  r.post("/discrepancies/:id/resolve", asyncHandler(async (req, res) => {
    const rows = await ctx.db.update(calendarDiscrepancies).set({ resolvedAt: ctx.now(), resolvedBy: req.staff!.id })
      .where(eq(calendarDiscrepancies.id, z.coerce.number().int().parse(req.params.id))).returning({ id: calendarDiscrepancies.id });
    if (!rows.length) throw notFound();
    res.json({ ok: true });
  }));

  r.get("/outbox", asyncHandler(async (req, res) => {
    const status = z.enum(["queued", "failed", "dead", "sent", "suppressed"]).optional().parse(req.query.status);
    const rows = await ctx.db.select({
      id: outbox.id, type: outbox.type, recipient: outbox.recipient, subject: outbox.subject, status: outbox.status, attempts: outbox.attempts,
      lastError: outbox.lastError, nextAttemptAt: outbox.nextAttemptAt, sentAt: outbox.sentAt, createdAt: outbox.createdAt, bookingId: outbox.bookingId,
    }).from(outbox).where(status ? eq(outbox.status, status) : inArray(outbox.status, ["failed", "dead"])).orderBy(desc(outbox.id)).limit(100);
    res.json(rows);
  }));

  r.post("/outbox/:id/retry", asyncHandler(async (req, res) => {
    const rows = await ctx.db.update(outbox).set({ status: "queued", attempts: 0, nextAttemptAt: ctx.now(), lastError: null })
      .where(and(eq(outbox.id, z.coerce.number().int().parse(req.params.id)), inArray(outbox.status, ["failed", "dead"]))).returning({ id: outbox.id });
    if (!rows.length) throw conflict("not_retryable");
    ctx.kick();
    res.json({ ok: true });
  }));

  r.get("/jobs", asyncHandler(async (_req, res) => {
    const rows = await ctx.db.select().from(jobs).where(and(inArray(jobs.status, ["failed", "dead", "running"]), sql`${jobs.type} NOT IN ('booking.expire')`))
      .orderBy(desc(jobs.updatedAt)).limit(100);
    res.json(rows);
  }));

  r.post("/jobs/:id/retry", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const [job] = await ctx.db.select().from(jobs).where(eq(jobs.id, id));
    if (!job || (job.status !== "dead" && job.status !== "failed")) throw conflict("not_retryable");
    await ctx.db.update(jobs).set({ status: "queued", attempts: 0, runAt: ctx.now(), lastError: null }).where(eq(jobs.id, id));
    // A confirmation retry needs the booking back in an approval state.
    const bookingId = (job.payload as any)?.bookingId;
    if (job.type === "calendar.confirm" && bookingId) {
      await ctx.db.update(bookings).set({ calendarStatus: "retrying" })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending_approval")));
    }
    ctx.kick();
    res.json({ ok: true });
  }));

  r.get("/reviews", asyncHandler(async (_req, res) => {
    res.json(await ctx.db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(200));
  }));

  r.post("/reviews/:id/moderate", asyncHandler(async (req, res) => {
    const { decision } = z.object({ decision: z.enum(["approved", "declined"]) }).parse(req.body);
    res.json(await moderateReview(ctx, z.coerce.number().int().parse(req.params.id), decision));
  }));

  r.get("/contacts", asyncHandler(async (_req, res) => {
    res.json(await ctx.db.select().from(contactRequests).orderBy(desc(contactRequests.createdAt)).limit(200));
  }));

  r.post("/contacts/:id/handled", asyncHandler(async (req, res) => {
    await ctx.db.update(contactRequests).set({ status: "handled" }).where(eq(contactRequests.id, z.coerce.number().int().parse(req.params.id)));
    res.json({ ok: true });
  }));

  // --- Settings, pricing, crews ------------------------------------------------------------------

  r.get("/settings", asyncHandler(async (_req, res) => {
    const loaded = await getSettings(ctx.db);
    res.json({
      ...loaded,
      pricing: await listPricingVersions(ctx.db),
      resources: await ctx.db.select().from(resources).orderBy(asc(resources.sortOrder), asc(resources.id)),
    });
  }));

  r.post("/settings", asyncHandler(async (req, res) => {
    const { settings, version } = z.object({ settings: businessSettingsSchema, version: z.number().int() }).parse(req.body);
    // Saving changes clears approval so the owner re-confirms the new values.
    const rows = await ctx.db.update(businessSettings).set({ settings, version: version + 1, approvedAt: null, updatedAt: ctx.now(), updatedBy: req.staff!.id })
      .where(and(eq(businessSettings.id, 1), eq(businessSettings.version, version))).returning();
    if (!rows.length) throw conflict("stale_version", "Settings changed in another session. Reload and try again.");
    res.json(await getSettings(ctx.db));
  }));

  r.post("/settings/approve", asyncHandler(async (req, res) => {
    const { version } = versionBody.parse(req.body);
    const rows = await ctx.db.update(businessSettings).set({ approvedAt: ctx.now(), updatedBy: req.staff!.id })
      .where(and(eq(businessSettings.id, 1), eq(businessSettings.version, version))).returning();
    if (!rows.length) throw conflict("stale_version");
    res.json(await getSettings(ctx.db));
  }));

  r.post("/pricing", asyncHandler(async (req, res) => {
    const { label, rules } = z.object({ label: z.string().trim().min(1).max(120), rules: pricingRulesSchema }).parse(req.body);
    const [row] = await ctx.db.insert(pricingVersions).values({ label, rules, createdBy: req.staff!.id }).returning();
    res.status(201).json(row);
  }));

  r.post("/pricing/:id/activate", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    await ctx.db.transaction(async (tx) => {
      const [target] = await tx.select().from(pricingVersions).where(eq(pricingVersions.id, id));
      if (!target) throw notFound();
      await tx.update(pricingVersions).set({ active: false }).where(eq(pricingVersions.active, true));
      await tx.update(pricingVersions).set({ active: true, approvedAt: approve ? ctx.now() : target.approvedAt }).where(eq(pricingVersions.id, id));
    });
    res.json(await listPricingVersions(ctx.db));
  }));

  r.post("/resources", asyncHandler(async (req, res) => {
    const input = resourceSchema.parse(req.body);
    const [row] = await ctx.db.insert(resources).values(input).returning();
    res.status(201).json(row);
  }));

  r.post("/resources/:id", asyncHandler(async (req, res) => {
    const input = resourceSchema.parse(req.body);
    const [row] = await ctx.db.update(resources).set(input).where(eq(resources.id, z.coerce.number().int().parse(req.params.id))).returning();
    if (!row) throw notFound();
    await enqueueJob(ctx.db, { type: "calendar.watch_renew", uniqueKey: "periodic:watch", requeueIfDone: true });
    ctx.kick();
    res.json(row);
  }));

  return r;
}
