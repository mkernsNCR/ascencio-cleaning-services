// Calendar side of the booking lifecycle, executed by durable jobs with bounded retries.
// Pattern: write intent (job) → recheck → external call with deterministic ID → recover unknown
// outcomes by lookup → commit the lifecycle change and mail in one transaction.
import { and, eq, isNull } from "drizzle-orm";
import { getService } from "@shared/domain";
import type { AppContext } from "../../context";
import { bookings, reservations, type BookingRow } from "../../db/schema";
import type { Executor } from "../../db";
import { CalendarError, eventIdForBooking, type CalendarEvent, type EventInput } from "../../integrations/google-calendar/types";
import { getResource, getSettings } from "../settings/repository";
import { checkResourceInterval, reservationInterval } from "./availability";
import { audit, getBooking, lockBooking, releaseReservations } from "./service";
import { bookingMail, enqueueStaffAlert } from "./notify";
import { revokeTokens } from "../tokens";
import { flagDiscrepancy } from "./discrepancies";

export { flagDiscrepancy };
import { enqueueJob } from "../../jobs/queue";

/** Thrown to ask the worker to retry later (with backoff unless `at` is given). */
export class RetryLater extends Error {
  constructor(message: string, public readonly at?: Date) {
    super(message);
  }
}

async function setCalendarStatus(db: Executor, bookingId: string, status: BookingRow["calendarStatus"]) {
  await db.update(bookings).set({ calendarStatus: status }).where(eq(bookings.id, bookingId));
}

function ownReservationIds(db: Executor, bookingId: string) {
  return db.select({ id: reservations.id }).from(reservations)
    .where(and(eq(reservations.bookingId, bookingId), isNull(reservations.releasedAt)))
    .then((rows) => rows.map((r) => r.id));
}

/**
 * Owner calendar event. Opaque busy block over the full reserved interval (service + buffer) with
 * service time labelled. Minimal details: no customer contact data, access codes, or notes.
 */
export function eventInputFor(b: BookingRow, bufferMinutes: number, startOverride?: Date, endOverride?: Date): EventInput {
  const start = startOverride ?? b.startAt;
  const end = endOverride ?? b.endAt;
  const blocked = reservationInterval(start, end, bufferMinutes);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: b.timezone, hour: "numeric", minute: "2-digit" }).format(d);
  const service = getService(b.serviceId)?.name.en ?? b.serviceId;
  return {
    id: eventIdForBooking(b.id),
    summary: `${service} — ${b.reference}`,
    description: [
      `Service time: ${fmt(start)}–${fmt(end)} (${b.timezone})`,
      bufferMinutes ? `Includes ${bufferMinutes} min travel/setup buffer after service.` : "",
      `Customer: ${b.firstName} ${b.lastName.charAt(0)}.`,
      `Reference: ${b.reference}`,
      "Managed by the booking system. Change this appointment from the dashboard, not here.",
    ].filter(Boolean).join("\n"),
    location: b.postalCode,
    start: blocked.start,
    end: blocked.end,
    timeZone: b.timezone,
    privateProps: {
      bookingId: b.id,
      serviceStart: start.toISOString(),
      serviceEnd: end.toISOString(),
      app: "ascencio-booking",
    },
  };
}

function eventMatches(ev: CalendarEvent, input: EventInput) {
  return ev.status !== "cancelled" && ev.start.getTime() === input.start.getTime() && ev.end.getTime() === input.end.getTime();
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------------------------

export async function processConfirm(ctx: AppContext, bookingId: string): Promise<"confirmed" | "conflict" | "disconnected" | "noop"> {
  const b = await getBooking(ctx.db, bookingId);
  if (!b || b.status !== "pending_approval" || (b.calendarStatus !== "creating" && b.calendarStatus !== "retrying")) return "noop";
  const resource = await getResource(ctx.db, b.resourceId);
  const { settings } = await getSettings(ctx.db);
  const calendarId = resource?.destinationCalendar;
  const health = await ctx.calendar.health();
  if (!calendarId || health.status !== "connected") {
    await ctx.db.transaction(async (tx) => {
      await setCalendarStatus(tx, b.id, "disconnected");
      await audit(tx, b.id, { kind: "system" }, "approval_blocked_calendar_disconnected", b.status, b.status);
      await enqueueStaffAlert(ctx, tx, `confirm-disconnected:${b.id}:${b.version}`, `Approval for ${b.reference} is waiting on Google Calendar`,
        "The appointment was not confirmed because Google Calendar is not connected or the crew has no destination calendar. Reconnect, then approve again from the dashboard.");
    });
    return "disconnected";
  }

  const input = eventInputFor(b, settings.bufferMinutes);
  try {
    // Recover an uncertain earlier attempt: the deterministic ID tells us whether it already exists.
    let event = await ctx.calendar.getEvent(calendarId, input.id);
    if (!event || event.status === "cancelled") {
      const verdict = await checkResourceInterval(ctx, {
        resourceId: b.resourceId, start: b.startAt, end: b.endAt,
        excludeReservationIds: await ownReservationIds(ctx.db, b.id), excludeEventId: input.id,
      });
      if (verdict === "calendar_unavailable") throw new RetryLater("Calendar availability could not be verified");
      if (verdict === "busy") {
        await ctx.db.transaction(async (tx) => {
          await setCalendarStatus(tx, b.id, "conflict");
          await flagDiscrepancy(tx, { bookingId: b.id, kind: "approval_conflict", details: { start: b.startAt.toISOString() }, dedupeKey: `approval_conflict:${b.id}:${b.version}` });
          await audit(tx, b.id, { kind: "system" }, "approval_conflict", b.status, b.status);
          await enqueueStaffAlert(ctx, tx, `approval-conflict:${b.id}:${b.version}`, `Calendar conflict for ${b.reference}`,
            "Google Calendar now shows another commitment during this requested time, so it was not confirmed. Reject it with a note, or clear the conflict and approve again.");
        });
        return "conflict";
      }
      event = event
        ? await ctx.calendar.patchEvent(calendarId, input.id, { ...input, status: "confirmed" })
        : await insertOrAdopt(ctx, calendarId, input);
    } else if (!eventMatches(event, input)) {
      event = await ctx.calendar.patchEvent(calendarId, input.id, input);
    }
    return await finalizeConfirm(ctx, b.id, b.version, calendarId, event.id);
  } catch (error) {
    if (error instanceof CalendarError && error.kind === "auth_revoked") {
      await setCalendarStatus(ctx.db, b.id, "disconnected");
      throw new RetryLater("Google authorization revoked", new Date(ctx.now().getTime() + 30 * 60_000));
    }
    await setCalendarStatus(ctx.db, b.id, "retrying");
    if (error instanceof RetryLater) throw error;
    throw new RetryLater(`Calendar event creation unresolved: ${describe(error)}`);
  }
}

async function insertOrAdopt(ctx: AppContext, calendarId: string, input: EventInput): Promise<CalendarEvent> {
  try {
    return await ctx.calendar.insertEvent(calendarId, input);
  } catch (error) {
    if (error instanceof CalendarError && error.kind === "duplicate") {
      const existing = await ctx.calendar.getEvent(calendarId, input.id);
      if (existing && existing.status !== "cancelled") return existing;
      return ctx.calendar.patchEvent(calendarId, input.id, { ...input, status: "confirmed" });
    }
    throw error;
  }
}

async function finalizeConfirm(ctx: AppContext, bookingId: string, version: number, calendarId: string, eventId: string) {
  return ctx.db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "pending_approval" || b.version !== version) {
      // The request moved on (e.g. cancelled) while the event was being created: remove the event.
      await tx.update(bookings).set({ calendarId, calendarEventId: eventId, calendarStatus: "delete_pending" }).where(eq(bookings.id, b.id));
      await enqueueJob(tx, { type: "calendar.delete", payload: { bookingId: b.id }, uniqueKey: `delete:${b.id}`, requeueIfDone: true });
      return "noop" as const;
    }
    const now = ctx.now();
    const [updated] = await tx.update(bookings).set({
      status: "confirmed", version: b.version + 1, calendarStatus: "synced", calendarId, calendarEventId: eventId, decidedAt: now,
    }).where(eq(bookings.id, b.id)).returning();
    await revokeTokens(tx, "booking.decide", b.id, now);
    await bookingMail.confirmed(ctx, tx, updated);
    await audit(tx, b.id, { kind: "system" }, "confirmed", "pending_approval", "confirmed", { eventId });
    return "confirmed" as const;
  });
}

// ---------------------------------------------------------------------------------------------

export async function processReschedule(ctx: AppContext, bookingId: string): Promise<"rescheduled" | "conflict" | "noop"> {
  const b = await getBooking(ctx.db, bookingId);
  if (!b || !b.pendingChange) return "noop";
  const change = b.pendingChange;
  if (b.status !== "confirmed") {
    await abandonReschedule(ctx, b, "booking_no_longer_confirmed", false);
    return "noop";
  }
  const { settings } = await getSettings(ctx.db);
  const calendarId = b.calendarId;
  const eventId = b.calendarEventId;
  const health = await ctx.calendar.health();
  if (!calendarId || !eventId || health.status !== "connected") {
    throw new RetryLater("Calendar not connected for reschedule", new Date(ctx.now().getTime() + 15 * 60_000));
  }
  const newStart = new Date(change.startAt);
  const newEnd = new Date(change.endAt);
  const input = eventInputFor(b, settings.bufferMinutes, newStart, newEnd);
  try {
    const current = await ctx.calendar.getEvent(calendarId, eventId);
    if (!current || !eventMatches(current, input)) {
      const own = await ownReservationIds(ctx.db, b.id);
      const verdict = await checkResourceInterval(ctx, {
        resourceId: b.resourceId, start: newStart, end: newEnd, excludeReservationIds: own, excludeEventId: eventId,
      });
      if (verdict === "calendar_unavailable") throw new RetryLater("Calendar availability could not be verified");
      if (verdict === "busy") {
        await abandonReschedule(ctx, b, "conflict", true);
        return "conflict";
      }
      if (!current) {
        // The mapped event vanished outside the system: do not silently recreate; flag for staff.
        await abandonReschedule(ctx, b, "event_missing", true);
        await flagDiscrepancy(ctx.db, { bookingId: b.id, kind: "event_deleted", details: { eventId }, dedupeKey: `event_deleted:${b.id}:${eventId}` });
        return "conflict";
      }
      await ctx.calendar.patchEvent(calendarId, eventId, { ...input, status: "confirmed" });
    }
  } catch (error) {
    if (error instanceof RetryLater) throw error;
    await setCalendarStatus(ctx.db, b.id, "retrying");
    throw new RetryLater(`Calendar reschedule unresolved: ${describe(error)}`);
  }

  await ctx.db.transaction(async (tx) => {
    const locked = await lockBooking(tx, b.id);
    if (!locked.pendingChange || locked.pendingChange.reservationId !== change.reservationId) return;
    const now = ctx.now();
    await releaseReservations(tx, b.id, "rescheduled", now, "booking");
    await tx.update(reservations).set({ kind: "booking" }).where(eq(reservations.id, change.reservationId));
    const [updated] = await tx.update(bookings).set({
      startAt: newStart, endAt: newEnd, version: locked.version + 1, pendingChange: null, calendarStatus: "synced",
    }).where(eq(bookings.id, b.id)).returning();
    await bookingMail.rescheduled(ctx, tx, updated);
    await audit(tx, b.id, { kind: "system" }, "rescheduled", "confirmed", "confirmed", { from: locked.startAt.toISOString(), to: change.startAt });
  });
  return "rescheduled";
}

/** Releases the reschedule target and keeps the original appointment. */
export async function abandonReschedule(ctx: AppContext, b: BookingRow, reason: string, notifyCustomer: boolean) {
  const change = b.pendingChange;
  if (!change) return;
  await ctx.db.transaction(async (tx) => {
    const locked = await lockBooking(tx, b.id);
    if (!locked.pendingChange || locked.pendingChange.reservationId !== change.reservationId) return;
    const now = ctx.now();
    await tx.update(reservations).set({ releasedAt: now, releaseReason: `reschedule_${reason}` })
      .where(and(eq(reservations.id, change.reservationId), isNull(reservations.releasedAt)));
    const [updated] = await tx.update(bookings).set({
      pendingChange: null, calendarStatus: locked.status === "confirmed" && locked.calendarEventId ? "synced" : locked.calendarStatus,
    }).where(eq(bookings.id, b.id)).returning();
    if (reason === "conflict") {
      await flagDiscrepancy(tx, { bookingId: b.id, kind: "reschedule_conflict", details: { requested: change.startAt }, dedupeKey: `reschedule_conflict:${b.id}:${change.reservationId}` });
    }
    if (notifyCustomer && updated.status === "confirmed") {
      await bookingMail.rescheduleFailed(ctx, tx, updated, String(change.reservationId));
    }
    await audit(tx, b.id, { kind: "system" }, "reschedule_abandoned", locked.status, locked.status, { reason });
  });
}

// ---------------------------------------------------------------------------------------------

export async function processDelete(ctx: AppContext, bookingId: string): Promise<"deleted" | "noop"> {
  const b = await getBooking(ctx.db, bookingId);
  if (!b || b.calendarStatus !== "delete_pending") return "noop";
  if (b.calendarId && b.calendarEventId) {
    const health = await ctx.calendar.health();
    if (health.status !== "connected") throw new RetryLater("Calendar not connected for deletion", new Date(ctx.now().getTime() + 15 * 60_000));
    try {
      await ctx.calendar.deleteEvent(b.calendarId, b.calendarEventId); // "not_found" also counts as deleted
    } catch (error) {
      throw new RetryLater(`Calendar deletion unresolved: ${describe(error)}`);
    }
  }
  await ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    await releaseReservations(tx, b.id, "event_deleted", now);
    await tx.update(bookings).set({ calendarStatus: "not_created" }).where(eq(bookings.id, b.id));
    await audit(tx, b.id, { kind: "system" }, "calendar_event_deleted", b.status, b.status, { eventId: b.calendarEventId });
  });
  return "deleted";
}
