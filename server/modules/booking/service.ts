// Booking lifecycle commands. Routes call these; they own scheduling rules and state transitions.
// Database transactions never wait on external APIs: calendar work is handed to durable jobs.
import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import type { BookingReceipt, ManagedBooking, bookingRequestSchema } from "@shared/api";
import { getService, isPostalCodeCovered, type ServiceId } from "@shared/domain";
import type { AppContext } from "../../context";
import { bookings, bookingAudit, reservations, type BookingRow, type BookingStatus } from "../../db/schema";
import { pgErrorCode, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, type Executor } from "../../db";
import { AppError, badRequest, conflict, notFound, unavailable } from "../../lib/errors";
import { bookingReference, canonicalHash } from "../../lib/crypto";
import { enqueueJob } from "../../jobs/queue";
import { consumeToken, lookupToken, revokeTokens } from "../tokens";
import { getActivePricing, getSettings } from "../settings/repository";
import { calculateEstimate } from "./estimate";
import { eligibleResourcesForStart, reservationInterval } from "./availability";
import { bookingMail, issueManageToken, urls } from "./notify";

type ParsedBookingRequest = z.output<typeof bookingRequestSchema>;

const HOUR = 3_600_000;
const IN_FLIGHT_CALENDAR = new Set(["creating", "retrying", "delete_pending"]);

export interface Actor {
  kind: "customer" | "staff" | "email_link" | "system";
  id?: string | number;
}
const actorLabel = (a: Actor) => (a.id !== undefined ? `${a.kind}:${a.id}` : a.kind);

export async function audit(
  db: Executor,
  bookingId: string,
  actor: Actor,
  action: string,
  from: BookingStatus | null,
  to: BookingStatus | null,
  details?: Record<string, unknown>,
) {
  await db.insert(bookingAudit).values({
    bookingId, actor: actorLabel(actor), action, fromStatus: from, toStatus: to, details: details ?? null,
  });
}

async function lockBooking(db: Executor, id: string): Promise<BookingRow> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).for("update");
  if (!row) throw notFound("booking_not_found");
  return row;
}

export async function getBooking(db: Executor, id: string): Promise<BookingRow | undefined> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  return row;
}

async function releaseReservations(db: Executor, bookingId: string, reason: string, now: Date, kind?: "booking" | "reschedule_target") {
  const conditions = [eq(reservations.bookingId, bookingId), isNull(reservations.releasedAt)];
  if (kind) conditions.push(eq(reservations.kind, kind));
  await db.update(reservations).set({ releasedAt: now, releaseReason: reason }).where(and(...conditions));
}

// ---------------------------------------------------------------------------------------------
// Customer request
// ---------------------------------------------------------------------------------------------

function idempotencyPayload(input: ParsedBookingRequest) {
  const { idempotencyKey: _ignored, ...rest } = input;
  return rest;
}

async function receiptFor(ctx: AppContext, db: Executor, b: BookingRow, manageToken: string): Promise<BookingReceipt> {
  const { settings } = await getSettings(db);
  const pricing = await getActivePricing(db);
  const approved = pricing.id === b.pricingVersionId ? pricing.approved : false;
  return {
    reference: b.reference,
    status: b.status,
    serviceId: b.serviceId as ServiceId,
    start: b.startAt.toISOString(),
    end: b.endAt.toISOString(),
    timezone: b.timezone,
    durationMinutes: b.durationMinutes,
    estimateCents: approved ? b.estimateCents : null,
    currency: "USD",
    manageUrl: urls(ctx).manage(manageToken),
    responsePromise: settings.responsePromise,
  };
}

async function replayExisting(ctx: AppContext, existing: BookingRow, requestHash: string) {
  if (existing.requestHash !== requestHash) {
    throw conflict("idempotency_conflict", "This request key was already used with different details.");
  }
  // Same payload: return the original result. Only token hashes are stored, so issue a fresh link.
  const manage = await issueManageToken(ctx.db, existing);
  return { receipt: await receiptFor(ctx, ctx.db, existing, manage.token), replayed: true };
}

export async function createBookingRequest(ctx: AppContext, input: ParsedBookingRequest): Promise<{ receipt: BookingReceipt; replayed: boolean }> {
  const requestHash = canonicalHash(idempotencyPayload(input));
  const [existing] = await ctx.db.select().from(bookings).where(eq(bookings.idempotencyKey, input.idempotencyKey));
  if (existing) return replayExisting(ctx, existing, requestHash);

  if (!ctx.config.bookingEnabled) throw unavailable("booking_disabled");
  const service = getService(input.serviceId);
  if (!service || service.mode !== "bookable") throw badRequest("quote_required");

  const { settings } = await getSettings(ctx.db);
  if (!isPostalCodeCovered(input.postalCode, settings.coverage)) throw badRequest("not_covered");

  // Authoritative estimate. Any client-side price/duration is ignored (and stripped by the schema).
  const pricing = await getActivePricing(ctx.db);
  const estimate = calculateEstimate(input.serviceId, input.property, pricing.rules);
  if (estimate.quoteRequired || !estimate.durationMinutes || estimate.estimateCents === null) throw badRequest("quote_required");

  const start = new Date(input.start);
  const eligibility = await eligibleResourcesForStart(ctx, {
    serviceId: input.serviceId, durationMinutes: estimate.durationMinutes, start,
  });
  if (!eligibility.ok) {
    if (eligibility.reason === "calendar_unavailable") throw unavailable("calendar_unavailable");
    throw conflict("slot_unavailable", "That time is no longer available.");
  }

  const now = ctx.now();
  const expiresAt = new Date(Math.min(now.getTime() + settings.pendingExpiryHours * HOUR, start.getTime()));
  const blocked = reservationInterval(start, eligibility.end, settings.bufferMinutes);

  // Try each eligible crew; the exclusion constraint is the final arbiter across processes.
  for (const resource of eligibility.resources) {
    const id = crypto.randomUUID();
    try {
      const result = await ctx.db.transaction(async (tx) => {
        const [row] = await tx.insert(bookings).values({
          id,
          reference: bookingReference(),
          locale: input.locale,
          serviceId: input.serviceId,
          property: input.property,
          postalCode: input.postalCode,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          address: input.address,
          notes: input.notes ?? null,
          policyAckAt: now,
          marketingOptIn: input.marketingOptIn ?? false,
          startAt: start,
          endAt: eligibility.end,
          timezone: settings.timezone,
          durationMinutes: estimate.durationMinutes!,
          estimateCents: estimate.estimateCents!,
          pricingVersionId: pricing.id,
          resourceId: resource.id,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          expiresAt,
        }).returning();
        await tx.insert(reservations).values({
          bookingId: id, resourceId: resource.id, kind: "booking", startsAt: blocked.start, endsAt: blocked.end,
        });
        const manage = await issueManageToken(tx, row);
        await bookingMail.requested(ctx, tx, row, manage.token);
        await enqueueJob(tx, { type: "booking.expire", payload: { bookingId: id }, uniqueKey: `expire:${id}`, runAt: expiresAt });
        await audit(tx, id, { kind: "customer" }, "requested", null, "pending_approval", { resourceId: resource.id, pricingVersionId: pricing.id });
        return { row, manageToken: manage.token };
      });
      ctx.kick();
      return { receipt: await receiptFor(ctx, ctx.db, result.row, result.manageToken), replayed: false };
    } catch (error) {
      const code = pgErrorCode(error);
      if (code === PG_EXCLUSION_VIOLATION) continue; // this crew was just taken; try the next
      if (code === PG_UNIQUE_VIOLATION) {
        // A concurrent submission with the same idempotency key won the race.
        const [winner] = await ctx.db.select().from(bookings).where(eq(bookings.idempotencyKey, input.idempotencyKey));
        if (winner) return replayExisting(ctx, winner, requestHash);
      }
      throw error;
    }
  }
  throw conflict("slot_unavailable", "That time is no longer available.");
}

// ---------------------------------------------------------------------------------------------
// Owner decisions
// ---------------------------------------------------------------------------------------------

export type DecisionOutcome = { state: "confirmed" | "processing" | "conflict" | "calendar_disconnected" | "rejected"; booking: BookingRow };

/**
 * Starts approval. Records durable intent and queues Calendar event creation; confirmation happens
 * only after the event is verified (see jobs/handlers.ts). Repeated approvals are idempotent.
 */
export async function requestApproval(
  ctx: AppContext,
  params: { bookingId: string; version: number; actor: Actor; tokenId?: number },
): Promise<{ jobId: number | null; booking: BookingRow }> {
  const health = await ctx.calendar.health();
  if (health.status !== "connected") throw unavailable("calendar_disconnected", "Google Calendar is not connected.");

  const result = await ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, params.bookingId);
    if (b.status === "confirmed") return { jobId: null, booking: b };
    if (b.status !== "pending_approval") throw conflict("not_pending", `Booking is ${b.status}.`);
    if (b.version !== params.version) throw conflict("stale_version", "This request changed since the link was sent.");
    if (b.calendarStatus === "creating" || b.calendarStatus === "retrying") return { jobId: null, booking: b };
    if (params.tokenId !== undefined && !(await consumeToken(tx, params.tokenId, ctx.now()))) {
      throw conflict("token_used", "This link was already used.");
    }
    const [updated] = await tx.update(bookings).set({ calendarStatus: "creating" }).where(eq(bookings.id, b.id)).returning();
    const jobId = await enqueueJob(tx, {
      type: "calendar.confirm", payload: { bookingId: b.id }, uniqueKey: `confirm:${b.id}:${b.version}`, requeueIfDone: true,
    });
    await audit(tx, b.id, params.actor, "approval_requested", b.status, b.status, { version: b.version });
    return { jobId, booking: updated };
  });
  ctx.kick();
  return result;
}

export async function rejectBooking(
  ctx: AppContext,
  params: { bookingId: string; version: number; reason?: string; actor: Actor; tokenId?: number },
): Promise<BookingRow> {
  return ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, params.bookingId);
    if (b.status === "rejected") return b;
    if (b.status !== "pending_approval") throw conflict("not_pending", `Booking is ${b.status}.`);
    if (b.version !== params.version) throw conflict("stale_version");
    if (IN_FLIGHT_CALENDAR.has(b.calendarStatus)) {
      throw conflict("calendar_operation_in_progress", "A calendar operation is still being resolved. Try again shortly.");
    }
    if (params.tokenId !== undefined && !(await consumeToken(tx, params.tokenId, ctx.now()))) throw conflict("token_used");
    const now = ctx.now();
    const [updated] = await tx.update(bookings).set({
      status: "rejected", version: b.version + 1, decisionReason: params.reason ?? null, decidedAt: now,
    }).where(eq(bookings.id, b.id)).returning();
    await releaseReservations(tx, b.id, "rejected", now);
    await revokeTokens(tx, "booking.decide", b.id, now);
    await bookingMail.rejected(ctx, tx, updated);
    await audit(tx, b.id, params.actor, "rejected", b.status, "rejected", params.reason ? { reason: params.reason } : undefined);
    return updated;
  });
}

export async function completeBooking(ctx: AppContext, params: { bookingId: string; version: number; actor: Actor }) {
  return ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, params.bookingId);
    if (b.status === "completed") return b;
    if (b.status !== "confirmed") throw conflict("not_confirmed");
    if (b.version !== params.version) throw conflict("stale_version");
    if (b.startAt > ctx.now()) throw conflict("not_started", "An appointment can be completed only after it starts.");
    const [updated] = await tx.update(bookings).set({ status: "completed", version: b.version + 1 }).where(eq(bookings.id, b.id)).returning();
    await audit(tx, b.id, params.actor, "completed", "confirmed", "completed");
    return updated;
  });
}

// ---------------------------------------------------------------------------------------------
// Customer self-service (scoped management credential)
// ---------------------------------------------------------------------------------------------

export async function resolveManageToken(ctx: AppContext, token: string): Promise<BookingRow> {
  const lookup = await lookupToken(ctx.db, token, ["booking.manage"], ctx.now());
  if (lookup.state === "invalid") throw new AppError(404, "invalid_link");
  if (lookup.state !== "valid") throw new AppError(410, "expired_link");
  const b = await getBooking(ctx.db, lookup.subjectId);
  if (!b) throw new AppError(404, "invalid_link");
  return b;
}

function policyAllows(b: BookingRow, cutoffHours: number, now: Date) {
  return b.startAt.getTime() - now.getTime() >= cutoffHours * HOUR;
}

export async function presentManagedBooking(ctx: AppContext, b: BookingRow): Promise<ManagedBooking> {
  const { settings } = await getSettings(ctx.db);
  const pricing = await getActivePricing(ctx.db);
  const now = ctx.now();
  const processing = IN_FLIGHT_CALENDAR.has(b.calendarStatus) || !!b.pendingChange;
  const active = b.status === "pending_approval" || b.status === "confirmed";
  const pendingOk = b.status === "pending_approval";
  return {
    reference: b.reference,
    status: b.status,
    serviceId: b.serviceId as ServiceId,
    property: b.property,
    postalCode: b.postalCode,
    start: b.startAt.toISOString(),
    end: b.endAt.toISOString(),
    timezone: b.timezone,
    durationMinutes: b.durationMinutes,
    estimateCents: pricing.id === b.pricingVersionId && pricing.approved ? b.estimateCents : null,
    currency: "USD",
    firstName: b.firstName,
    addressSummary: b.address.split(",")[0].slice(0, 60),
    pendingChange: b.pendingChange ? { kind: "reschedule", start: b.pendingChange.startAt, end: b.pendingChange.endAt } : null,
    processing,
    canCancel: active && !processing && (pendingOk || policyAllows(b, settings.cancellationCutoffHours, now)),
    canReschedule: active && !processing && (pendingOk || policyAllows(b, settings.rescheduleCutoffHours, now)),
    policy: { cancellationCutoffHours: settings.cancellationCutoffHours, rescheduleCutoffHours: settings.rescheduleCutoffHours },
    decisionReason: b.status === "rejected" ? b.decisionReason : null,
  };
}

export async function cancelByCustomer(ctx: AppContext, bookingId: string): Promise<BookingRow> {
  const { settings } = await getSettings(ctx.db);
  const result = await ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status === "cancelled") return b; // duplicate cancellation is a safe no-op
    if (b.status !== "pending_approval" && b.status !== "confirmed") throw conflict("not_cancellable", `Booking is ${b.status}.`);
    if (IN_FLIGHT_CALENDAR.has(b.calendarStatus) || b.pendingChange) {
      throw conflict("operation_in_progress", "A change to this appointment is still processing. Try again shortly.");
    }
    const now = ctx.now();
    if (b.status === "confirmed" && !policyAllows(b, settings.cancellationCutoffHours, now)) {
      throw conflict("inside_cutoff", "Online cancellation is closed for this appointment. Please call us.");
    }
    const wasConfirmed = b.status === "confirmed";
    const hasEvent = wasConfirmed && !!b.calendarEventId;
    const [updated] = await tx.update(bookings).set({
      status: "cancelled", version: b.version + 1, decidedAt: now,
      calendarStatus: hasEvent ? "delete_pending" : b.calendarStatus,
    }).where(eq(bookings.id, b.id)).returning();
    if (hasEvent) {
      // Keep conflict protection until the remote event deletion is verified.
      await enqueueJob(tx, { type: "calendar.delete", payload: { bookingId: b.id }, uniqueKey: `delete:${b.id}`, requeueIfDone: true });
    } else {
      await releaseReservations(tx, b.id, "cancelled", now);
    }
    await revokeTokens(tx, "booking.decide", b.id, now);
    await bookingMail.cancelled(ctx, tx, updated, wasConfirmed);
    await audit(tx, b.id, { kind: "customer" }, "cancelled", b.status, "cancelled");
    return updated;
  });
  ctx.kick();
  return result;
}

export async function rescheduleByCustomer(ctx: AppContext, bookingId: string, newStartIso: string): Promise<BookingRow> {
  const { settings } = await getSettings(ctx.db);
  const current = await getBooking(ctx.db, bookingId);
  if (!current) throw notFound("booking_not_found");
  if (current.status !== "pending_approval" && current.status !== "confirmed") throw conflict("not_reschedulable");
  if (IN_FLIGHT_CALENDAR.has(current.calendarStatus) || current.pendingChange) throw conflict("operation_in_progress");
  const now = ctx.now();
  if (current.status === "confirmed" && !policyAllows(current, settings.rescheduleCutoffHours, now)) throw conflict("inside_cutoff");

  const newStart = new Date(newStartIso);
  if (newStart.getTime() === current.startAt.getTime()) return current;
  const ownReservations = (await ctx.db.select({ id: reservations.id }).from(reservations)
    .where(and(eq(reservations.bookingId, bookingId), isNull(reservations.releasedAt)))).map((r) => r.id);

  const eligibility = await eligibleResourcesForStart(ctx, {
    serviceId: current.serviceId as ServiceId,
    durationMinutes: current.durationMinutes,
    start: newStart,
    excludeReservationIds: ownReservations,
    excludeEventId: current.calendarEventId,
    // A confirmed appointment keeps its crew so the mapped calendar event can be moved in place.
    onlyResourceId: current.status === "confirmed" ? current.resourceId : undefined,
  });
  if (!eligibility.ok) {
    if (eligibility.reason === "calendar_unavailable") throw unavailable("calendar_unavailable");
    throw conflict("slot_unavailable", "That time is no longer available.");
  }
  const resource = eligibility.resources.find((r) => r.id === current.resourceId) ?? eligibility.resources[0];
  const blocked = reservationInterval(newStart, eligibility.end, settings.bufferMinutes);

  try {
    const result = await ctx.db.transaction(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (b.version !== current.version || b.pendingChange || IN_FLIGHT_CALENDAR.has(b.calendarStatus)) {
        throw conflict("operation_in_progress");
      }
      if (b.status === "pending_approval") {
        // No calendar event exists yet: swap the reservation atomically. If the new interval is
        // taken the whole transaction rolls back and the original reservation is untouched.
        await releaseReservations(tx, b.id, "rescheduled", now);
        await tx.insert(reservations).values({ bookingId: b.id, resourceId: resource.id, kind: "booking", startsAt: blocked.start, endsAt: blocked.end });
        const [updated] = await tx.update(bookings).set({
          startAt: newStart, endAt: eligibility.end, resourceId: resource.id, version: b.version + 1,
          calendarStatus: "not_created",
        }).where(eq(bookings.id, b.id)).returning();
        await revokeTokens(tx, "booking.decide", b.id, now);
        await bookingMail.pendingUpdated(ctx, tx, updated);
        await audit(tx, b.id, { kind: "customer" }, "pending_rescheduled", b.status, b.status, { from: b.startAt.toISOString(), to: newStart.toISOString() });
        return updated;
      }
      // Confirmed: reserve the target while preserving the original until the event move succeeds.
      const [target] = await tx.insert(reservations).values({
        bookingId: b.id, resourceId: b.resourceId, kind: "reschedule_target", startsAt: blocked.start, endsAt: blocked.end,
      }).returning();
      const [updated] = await tx.update(bookings).set({
        pendingChange: { kind: "reschedule", startAt: newStart.toISOString(), endAt: eligibility.end.toISOString(), reservationId: target.id, requestedAt: now.toISOString() },
      }).where(eq(bookings.id, b.id)).returning();
      await enqueueJob(tx, {
        type: "calendar.reschedule", payload: { bookingId: b.id }, uniqueKey: `reschedule:${b.id}:${b.version}:${target.id}`,
      });
      await audit(tx, b.id, { kind: "customer" }, "reschedule_requested", b.status, b.status, { to: newStart.toISOString() });
      return updated;
    });
    ctx.kick();
    return result;
  } catch (error) {
    if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) throw conflict("slot_unavailable", "That time is no longer available.");
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------------------------

/** Expires an undecided request. Returns "retry_at" when it is not yet safe or not yet due. */
export async function expireBooking(ctx: AppContext, bookingId: string): Promise<{ result: "expired" | "skipped" } | { result: "retry_at"; at: Date }> {
  return ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "pending_approval" || !b.expiresAt) return { result: "skipped" as const };
    const now = ctx.now();
    if (b.expiresAt > now) return { result: "retry_at" as const, at: b.expiresAt };
    // An unresolved calendar outcome must not release the reservation automatically.
    if (IN_FLIGHT_CALENDAR.has(b.calendarStatus)) return { result: "retry_at" as const, at: new Date(now.getTime() + 10 * 60_000) };
    const [updated] = await tx.update(bookings).set({ status: "expired", version: b.version + 1, decidedAt: now })
      .where(eq(bookings.id, b.id)).returning();
    await releaseReservations(tx, b.id, "expired", now);
    await revokeTokens(tx, "booking.decide", b.id, now);
    await bookingMail.expired(ctx, tx, updated);
    await audit(tx, b.id, { kind: "system" }, "expired", "pending_approval", "expired");
    return { result: "expired" as const };
  });
}

export { lockBooking, releaseReservations, IN_FLIGHT_CALENDAR };
