// Mirror Google changes into staff-review discrepancies. The database owns the customer lifecycle:
// external moves, deletions, and collisions never silently change a customer's commitment.
import crypto from "crypto";
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { bookings, calendarSyncState, resources } from "../../db/schema";
import { randomToken, sha256, timingSafeEqualStr } from "../../lib/crypto";
import { flagDiscrepancy, eventInputFor, RetryLater } from "../../modules/booking/calendar-ops";
import { getActiveResources, getSettings, resourceCalendars } from "../../modules/settings/repository";
import { enqueueJob } from "../../jobs/queue";
import { CalendarError, type CalendarEvent } from "./types";

const DAY = 86_400_000;
const WATCH_TTL_SECONDS = 7 * 24 * 3600;
const RENEW_BEFORE_MS = 24 * 3600 * 1000;

async function syncStateFor(ctx: AppContext, calendarId: string) {
  const [row] = await ctx.db.select().from(calendarSyncState).where(eq(calendarSyncState.calendarId, calendarId));
  if (row) return row;
  await ctx.db.insert(calendarSyncState).values({ calendarId }).onConflictDoNothing();
  const [created] = await ctx.db.select().from(calendarSyncState).where(eq(calendarSyncState.calendarId, calendarId));
  return created;
}

/**
 * Incremental sync of one destination calendar. A 410 (invalid sync token) rebuilds the mirror from
 * a bounded full listing; bookings are never deleted as a result.
 */
export async function syncCalendar(ctx: AppContext, calendarId: string): Promise<{ changed: number; rebuilt: boolean }> {
  const state = await syncStateFor(ctx, calendarId);
  const now = ctx.now();
  let rebuilt = false;
  let listing: { events: CalendarEvent[]; nextSyncToken: string | null };
  try {
    listing = state.syncToken
      ? await ctx.calendar.listEvents(calendarId, { syncToken: state.syncToken })
      : await ctx.calendar.listEvents(calendarId, { timeMin: new Date(now.getTime() - DAY), timeMax: new Date(now.getTime() + 120 * DAY) });
    if (!state.syncToken) rebuilt = true;
  } catch (error) {
    if (error instanceof CalendarError && error.kind === "sync_token_invalid") {
      rebuilt = true;
      listing = await ctx.calendar.listEvents(calendarId, { timeMin: new Date(now.getTime() - DAY), timeMax: new Date(now.getTime() + 120 * DAY) });
    } else {
      await ctx.db.update(calendarSyncState).set({ lastError: (error as Error).message, updatedAt: now }).where(eq(calendarSyncState.calendarId, calendarId));
      throw new RetryLater(`Calendar sync failed: ${(error as Error).message}`);
    }
  }
  await reviewEvents(ctx, calendarId, listing.events, rebuilt);
  await ctx.db.update(calendarSyncState).set({
    syncToken: listing.nextSyncToken, lastSyncAt: now, lastError: null, updatedAt: now,
  }).where(eq(calendarSyncState.calendarId, calendarId));
  return { changed: listing.events.length, rebuilt };
}

async function reviewEvents(ctx: AppContext, calendarId: string, events: CalendarEvent[], fullListing: boolean) {
  const { settings } = await getSettings(ctx.db);
  const now = ctx.now();
  const mapped = await ctx.db.select().from(bookings).where(and(eq(bookings.calendarId, calendarId), isNotNull(bookings.calendarEventId)));
  const byEventId = new Map(mapped.map((b) => [b.calendarEventId!, b]));

  for (const ev of events) {
    const booking = byEventId.get(ev.id);
    if (booking) {
      if (booking.status !== "confirmed" || booking.calendarStatus !== "synced" || booking.pendingChange) continue;
      const expected = eventInputFor(booking, settings.bufferMinutes);
      if (ev.status === "cancelled") {
        await flagDiscrepancy(ctx.db, { bookingId: booking.id, kind: "event_deleted", details: { eventId: ev.id }, dedupeKey: `event_deleted:${booking.id}:${ev.id}` });
      } else if (ev.start.getTime() !== expected.start.getTime() || ev.end.getTime() !== expected.end.getTime()) {
        await flagDiscrepancy(ctx.db, {
          bookingId: booking.id, kind: "event_moved",
          details: { eventId: ev.id, googleStart: ev.start.toISOString(), googleEnd: ev.end.toISOString(), expectedStart: expected.start.toISOString() },
          dedupeKey: `event_moved:${booking.id}:${ev.start.toISOString()}`,
        });
      }
      continue;
    }
    if (ev.privateProps?.app === "ascencio-booking" && ev.status !== "cancelled") {
      await flagDiscrepancy(ctx.db, { bookingId: null, kind: "unmapped_event", details: { eventId: ev.id, calendarId }, dedupeKey: `unmapped:${ev.id}` });
      continue;
    }
    if (ev.status === "cancelled" || ev.transparency === "transparent") continue;
    // A foreign event overlapping a confirmed booking on this calendar is a collision for staff.
    for (const b of mapped) {
      if (b.status !== "confirmed" || b.endAt < now) continue;
      const blocked = eventInputFor(b, settings.bufferMinutes);
      if (ev.start < blocked.end && ev.end > blocked.start) {
        await flagDiscrepancy(ctx.db, {
          bookingId: b.id, kind: "event_collision", details: { eventId: ev.id, calendarId },
          dedupeKey: `collision:${b.id}:${ev.id}`,
        });
      }
    }
  }
  void fullListing;
}

/**
 * Periodic recovery for missed notifications: syncs destination calendars and checks confirmed
 * future bookings against busy-source calendars (FreeBusy) for collisions.
 */
export async function reconcile(ctx: AppContext) {
  const health = await ctx.calendar.health();
  if (health.status !== "connected") return { skipped: true };
  const active = await getActiveResources(ctx.db);
  for (const r of active) {
    if (!r.destinationCalendar) continue;
    await enqueueJob(ctx.db, { type: "calendar.sync", payload: { calendarId: r.destinationCalendar }, uniqueKey: `sync:${r.destinationCalendar}`, requeueIfDone: true });
  }
  const now = ctx.now();
  const { settings } = await getSettings(ctx.db);
  const upcoming = await ctx.db.select().from(bookings).where(and(
    eq(bookings.status, "confirmed"), gt(bookings.endAt, now), inArray(bookings.resourceId, active.map((r) => r.id).concat(-1)),
  ));
  for (const b of upcoming) {
    if (b.pendingChange || !b.calendarEventId) continue;
    const resource = active.find((r) => r.id === b.resourceId);
    if (!resource) continue;
    const busySources = resourceCalendars(resource).filter((c) => c !== resource.destinationCalendar);
    if (busySources.length === 0) continue;
    const blocked = eventInputFor(b, settings.bufferMinutes);
    const fb = await ctx.calendar.freeBusy(busySources, blocked.start, blocked.end).catch(() => null);
    if (!fb) continue;
    for (const cal of busySources) {
      const entry = fb.calendars[cal];
      if (!entry || entry.error) continue;
      // Busy sources exclude the destination calendar, so the booking's own event is not included.
      const overlapping = entry.busy.filter((iv) => iv.start < blocked.end && iv.end > blocked.start);
      if (overlapping.length) {
        await flagDiscrepancy(ctx.db, {
          bookingId: b.id, kind: "event_collision", details: { calendarId: cal, busyStart: overlapping[0].start.toISOString() },
          dedupeKey: `collision:${b.id}:${cal}:${overlapping[0].start.toISOString()}`,
        });
      }
    }
  }
  return { skipped: false };
}

/** Creates or renews push channels for destination calendars when webhooks are enabled. */
export async function ensureWatchChannels(ctx: AppContext) {
  if (!ctx.config.google.webhookEnabled) return;
  const health = await ctx.calendar.health();
  if (health.status !== "connected") return;
  const destinations = (await ctx.db.select().from(resources).where(and(eq(resources.active, true), isNotNull(resources.destinationCalendar))))
    .map((r) => r.destinationCalendar!);
  for (const calendarId of Array.from(new Set(destinations))) {
    const state = await syncStateFor(ctx, calendarId);
    const now = ctx.now();
    if (state.channelId && state.channelExpiresAt && state.channelExpiresAt.getTime() - now.getTime() > RENEW_BEFORE_MS) continue;
    const id = crypto.randomUUID();
    const token = randomToken();
    const created = await ctx.calendar.watch(calendarId, { id, token, address: ctx.config.google.webhookUrl, ttlSeconds: WATCH_TTL_SECONDS });
    const previous = { channelId: state.channelId, resource: state.channelResource };
    await ctx.db.update(calendarSyncState).set({
      channelId: id, channelResource: created.resourceId, channelTokenHash: sha256(token), channelExpiresAt: created.expiration, updatedAt: now,
    }).where(eq(calendarSyncState.calendarId, calendarId));
    if (previous.channelId && previous.resource) {
      await ctx.calendar.stopChannel(previous.channelId, previous.resource).catch(() => undefined);
    }
  }
}

/**
 * Validates a push notification against the registered channel and queues a sync. Notifications
 * carry no event data; they only signal that something changed.
 */
export async function handleWebhook(ctx: AppContext, headers: { channelId?: string; token?: string; resourceId?: string; state?: string }) {
  if (!headers.channelId || !headers.token) return { accepted: false };
  const [state] = await ctx.db.select().from(calendarSyncState).where(eq(calendarSyncState.channelId, headers.channelId));
  if (!state || !state.channelTokenHash || !timingSafeEqualStr(state.channelTokenHash, sha256(headers.token))) return { accepted: false };
  if (headers.resourceId && state.channelResource && headers.resourceId !== state.channelResource) return { accepted: false };
  if (headers.state === "sync") return { accepted: true }; // initial handshake
  await enqueueJob(ctx.db, { type: "calendar.sync", payload: { calendarId: state.calendarId }, uniqueKey: `sync:${state.calendarId}`, requeueIfDone: true });
  ctx.kick();
  return { accepted: true };
}
