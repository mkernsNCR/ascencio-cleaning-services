import { and, gt, inArray, isNull, lt } from "drizzle-orm";
import type {
  AvailabilityDay, AvailabilityQuery, AvailabilityResponse, AvailabilitySlot, DayStatus,
} from "@shared/api";
import { getService, isPostalCodeCovered, type BusinessSettings, type ServiceId } from "@shared/domain";
import {
  addDays, compareDates, dayOfWeek, localDateOf, minutesOfWallTime, wallTimeFromMinutes, wallTimeToInstants,
  zoneAbbreviation, daysBetween, type LocalDate,
} from "@shared/time";
import { reservations, type ResourceRow } from "../../db/schema";
import type { Executor } from "../../db";
import type { AppContext } from "../../context";
import type { Interval } from "../../integrations/google-calendar/types";
import { getActivePricing, getActiveResources, getSettings, resourceCalendars } from "../settings/repository";
import { calculateEstimate } from "./estimate";

export const MAX_QUERY_DAYS = 42;

export interface Candidate {
  start: Date;
  end: Date;
  localTime: string;
  zoneLabel: string;
}

const MINUTE = 60_000;

/** First and last local dates customers may book, given lead time and horizon. */
export function bookingWindow(settings: BusinessSettings, now: Date): { earliestStart: Date; earliestDate: LocalDate; latestDate: LocalDate } {
  const earliestStart = new Date(now.getTime() + settings.leadTimeHours * 60 * MINUTE);
  const today = localDateOf(now, settings.timezone);
  return {
    earliestStart,
    earliestDate: localDateOf(earliestStart, settings.timezone),
    latestDate: addDays(today, settings.horizonDays),
  };
}

/**
 * Service start candidates for one local date: inside opening hours (service must finish by
 * closing), after the lead time, and within the horizon. Nonexistent DST wall times are skipped;
 * repeated ones yield both instants with distinguishing zone labels.
 */
export function generateCandidates(
  date: LocalDate,
  settings: BusinessSettings,
  durationMinutes: number,
  now: Date,
): { status: DayStatus; candidates: Candidate[] } {
  const { earliestStart, latestDate } = bookingWindow(settings, now);
  if (compareDates(date, latestDate) > 0 || compareDates(date, localDateOf(now, settings.timezone)) < 0) {
    return { status: "outside_window", candidates: [] };
  }
  const windows = settings.weeklyHours[String(dayOfWeek(date)) as keyof BusinessSettings["weeklyHours"]] ?? [];
  if (windows.length === 0 || settings.closedDates.includes(date)) return { status: "closed", candidates: [] };

  const step = Math.max(5, settings.slotIncrementMinutes);
  const raw: Candidate[] = [];
  for (const window of windows) {
    const openMin = minutesOfWallTime(window.open);
    const closeMin = minutesOfWallTime(window.close);
    const closeInstants = wallTimeToInstants(date, window.close, settings.timezone);
    // A nonexistent closing time (inside a DST gap) falls back to the next valid minute.
    const closeAt = closeInstants.length
      ? closeInstants[closeInstants.length - 1]
      : wallTimeToInstants(date, wallTimeFromMinutes(Math.min(closeMin + 60, 23 * 60 + 59)), settings.timezone)[0];
    if (!closeAt) continue;
    for (let t = openMin; t < closeMin; t += step) {
      const wall = wallTimeFromMinutes(t);
      for (const start of wallTimeToInstants(date, wall, settings.timezone)) {
        const end = new Date(start.getTime() + durationMinutes * MINUTE);
        if (end.getTime() > closeAt.getTime()) continue;
        raw.push({ start, end, localTime: wall, zoneLabel: zoneAbbreviation(start, settings.timezone) });
      }
    }
  }
  if (raw.length === 0) return { status: "closed", candidates: [] };
  const eligible = raw.filter((c) => c.start.getTime() >= earliestStart.getTime());
  if (eligible.length === 0) return { status: "outside_window", candidates: [] };
  eligible.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { status: "open", candidates: eligible };
}

const overlaps = (a: Interval, b: Interval) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/** The interval a booking reserves locally: service time plus the trailing travel/setup buffer. */
export function reservationInterval(start: Date, end: Date, bufferMinutes: number): Interval {
  return { start, end: new Date(end.getTime() + bufferMinutes * MINUTE) };
}

/**
 * Whether a candidate fits one resource. Local reservations already include their trailing buffer.
 * External calendar events carry no buffer, so the candidate is padded on both sides against them.
 */
export function isCandidateFree(candidate: Interval, bufferMinutes: number, localBusy: Interval[], externalBusy: Interval[]) {
  const reserved = reservationInterval(candidate.start, candidate.end, bufferMinutes);
  if (localBusy.some((b) => overlaps(reserved, b))) return false;
  const padded = { start: new Date(candidate.start.getTime() - bufferMinutes * MINUTE), end: reserved.end };
  return !externalBusy.some((b) => overlaps(padded, b));
}

export async function loadLocalBusy(
  db: Executor,
  resourceIds: number[],
  from: Date,
  to: Date,
  excludeReservationIds: number[] = [],
): Promise<Map<number, Interval[]>> {
  const map = new Map<number, Interval[]>(resourceIds.map((id) => [id, []]));
  if (resourceIds.length === 0) return map;
  const rows = await db
    .select()
    .from(reservations)
    .where(and(inArray(reservations.resourceId, resourceIds), isNull(reservations.releasedAt), lt(reservations.startsAt, to), gt(reservations.endsAt, from)));
  for (const row of rows) {
    if (excludeReservationIds.includes(row.id)) continue;
    map.get(row.resourceId)?.push({ start: row.startsAt, end: row.endsAt });
  }
  return map;
}

// Short-lived FreeBusy cache for display only. Submissions and approvals always query fresh.
const freeBusyCache = new Map<string, { expires: number; value: Map<string, Interval[] | "error"> }>();
const FREEBUSY_CACHE_MS = 60_000;

export function clearFreeBusyCache() {
  freeBusyCache.clear();
}

/**
 * Busy intervals per calendar. A calendar with an error maps to "error" so the affected resource
 * fails closed. Event names are never requested or exposed.
 */
export async function loadExternalBusy(
  ctx: AppContext,
  calendarIds: string[],
  from: Date,
  to: Date,
  { useCache }: { useCache: boolean },
): Promise<Map<string, Interval[] | "error">> {
  const result = new Map<string, Interval[] | "error">();
  if (calendarIds.length === 0) return result;
  const key = `${[...calendarIds].sort().join(",")}|${from.toISOString()}|${to.toISOString()}`;
  if (useCache) {
    const hit = freeBusyCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
  }
  try {
    const fb = await ctx.calendar.freeBusy(calendarIds, from, to);
    for (const id of calendarIds) {
      const entry = fb.calendars[id];
      result.set(id, !entry || entry.error ? "error" : entry.busy);
    }
  } catch (error) {
    ctx.log.warn("freebusy query failed", { error });
    for (const id of calendarIds) result.set(id, "error");
  }
  if (useCache) freeBusyCache.set(key, { expires: Date.now() + FREEBUSY_CACHE_MS, value: result });
  return result;
}

export type ResourceBusy = { resource: ResourceRow; local: Interval[]; external: Interval[] };

/** Resources that can be evaluated (calendar mapped and readable), with their busy data. */
export async function loadSchedulableResources(
  ctx: AppContext,
  from: Date,
  to: Date,
  opts: { useCache: boolean; excludeReservationIds?: number[]; excludeEventId?: string | null },
): Promise<{ resources: ResourceBusy[]; calendarProblem: boolean }> {
  const all = await getActiveResources(ctx.db);
  const mapped = all.filter((r) => r.destinationCalendar);
  if (mapped.length === 0) return { resources: [], calendarProblem: true };
  const health = await ctx.calendar.health();
  if (health.status !== "connected") return { resources: [], calendarProblem: true };

  const calendarIds = Array.from(new Set(mapped.flatMap(resourceCalendars)));
  const external = await loadExternalBusy(ctx, calendarIds, from, to, { useCache: opts.useCache });
  const local = await loadLocalBusy(ctx.db, mapped.map((r) => r.id), from, to, opts.excludeReservationIds);

  // When re-checking an already-mapped booking, its own event must not count as a conflict.
  let ownEvent: Interval | null = null;
  if (opts.excludeEventId) {
    for (const r of mapped) {
      const ev = await ctx.calendar.getEvent(r.destinationCalendar!, opts.excludeEventId).catch(() => null);
      if (ev && ev.status !== "cancelled") ownEvent = { start: ev.start, end: ev.end };
    }
  }

  let calendarProblem = false;
  const out: ResourceBusy[] = [];
  for (const resource of mapped) {
    const busy: Interval[] = [];
    let failed = false;
    for (const cal of resourceCalendars(resource)) {
      const entry = external.get(cal);
      if (!entry || entry === "error") failed = true;
      else busy.push(...entry);
    }
    if (failed) {
      calendarProblem = true;
      continue; // fail closed for this resource only
    }
    // Our own confirmed bookings appear in Google too (as events spanning service + buffer). They are
    // already enforced by local reservations, so remove them from the external list; otherwise the
    // external padding would apply the buffer twice.
    const localIntervals = local.get(resource.id) ?? [];
    let filtered = ownEvent ? subtractInterval(busy, ownEvent) : busy;
    for (const own of localIntervals) filtered = subtractInterval(filtered, own);
    out.push({ resource, local: localIntervals, external: filtered });
  }
  return { resources: out, calendarProblem };
}

/** Removes one interval (a booking's own event) from a busy list. */
export function subtractInterval(busy: Interval[], remove: Interval): Interval[] {
  const out: Interval[] = [];
  for (const b of busy) {
    if (!overlaps(b, remove)) {
      out.push(b);
      continue;
    }
    if (b.start < remove.start) out.push({ start: b.start, end: remove.start });
    if (b.end > remove.end) out.push({ start: remove.end, end: b.end });
  }
  return out;
}

function dayBounds(date: LocalDate, timezone: string): Interval {
  const start = wallTimeToInstants(date, "00:00", timezone)[0] ?? wallTimeToInstants(date, "01:00", timezone)[0];
  const next = addDays(date, 1);
  const end = wallTimeToInstants(next, "00:00", timezone)[0] ?? wallTimeToInstants(next, "01:00", timezone)[0];
  return { start, end };
}

export interface AvailabilityOptions {
  /** Reschedule view: ignore the booking's own reservations and calendar event. */
  excludeReservationIds?: number[];
  excludeEventId?: string | null;
  onlyResourceId?: number;
}

export async function getAvailability(ctx: AppContext, query: AvailabilityQuery, opts: AvailabilityOptions = {}): Promise<AvailabilityResponse> {
  const { settings } = await getSettings(ctx.db);
  const now = ctx.now();
  const { earliestDate, latestDate } = bookingWindow(settings, now);
  const base = { timezone: settings.timezone, earliestDate, latestDate, days: [] as AvailabilityDay[] };

  const pricing = await getActivePricing(ctx.db);
  const estimate = calculateEstimate(query.serviceId, { bedrooms: query.bedrooms, bathrooms: query.bathrooms }, pricing.rules);
  if (estimate.quoteRequired || !estimate.durationMinutes) return { ...base, status: "quote_required", durationMinutes: null };
  if (!isPostalCodeCovered(query.postalCode, settings.coverage)) {
    return { ...base, status: "not_covered", durationMinutes: estimate.durationMinutes };
  }
  if (!ctx.config.bookingEnabled) return { ...base, status: "booking_disabled", durationMinutes: estimate.durationMinutes };

  let from = compareDates(query.from, localDateOf(now, settings.timezone)) < 0 ? localDateOf(now, settings.timezone) : query.from;
  let to = compareDates(query.to, latestDate) > 0 ? latestDate : query.to;
  if (compareDates(to, from) < 0) return { ...base, status: "ok", durationMinutes: estimate.durationMinutes };
  if (daysBetween(from, to) >= MAX_QUERY_DAYS) to = addDays(from, MAX_QUERY_DAYS - 1);

  const rangeStart = dayBounds(from, settings.timezone).start;
  const rangeEnd = dayBounds(to, settings.timezone).end;
  const pad = settings.bufferMinutes * MINUTE;
  const loaded = await loadSchedulableResources(
    ctx, new Date(rangeStart.getTime() - pad), new Date(rangeEnd.getTime() + pad),
    { useCache: !opts.excludeEventId, excludeReservationIds: opts.excludeReservationIds, excludeEventId: opts.excludeEventId },
  );
  const calendarProblem = loaded.calendarProblem;
  const schedulable = opts.onlyResourceId ? loaded.resources.filter((r) => r.resource.id === opts.onlyResourceId) : loaded.resources;
  if (schedulable.length === 0) {
    return { ...base, status: "calendar_unavailable", durationMinutes: estimate.durationMinutes };
  }

  const days: AvailabilityDay[] = [];
  for (let date = from; compareDates(date, to) <= 0; date = addDays(date, 1)) {
    const { status, candidates } = generateCandidates(date, settings, estimate.durationMinutes, now);
    if (status !== "open") {
      days.push({ date, status, slots: [] });
      continue;
    }
    // Each crew is evaluated independently; a slot is offered if any crew can take it.
    const slots: AvailabilitySlot[] = candidates
      .filter((c) => schedulable.some((r) => isCandidateFree(c, settings.bufferMinutes, r.local, r.external)))
      .map((c) => ({ start: c.start.toISOString(), end: c.end.toISOString(), localTime: c.localTime, zoneLabel: c.zoneLabel }));
    days.push({ date, status: slots.length ? "open" : "full", slots });
  }
  // Partial calendar failure still offers slots from healthy crews; total failure is reported above.
  void calendarProblem;
  return { ...base, status: "ok", durationMinutes: estimate.durationMinutes, days };
}

/**
 * Validates that a requested start is a currently offered slot and returns the resources that can
 * take it, using fresh (uncached) calendar data. Used on submission, approval, and reschedule.
 */
export async function eligibleResourcesForStart(
  ctx: AppContext,
  params: {
    serviceId: ServiceId;
    durationMinutes: number;
    start: Date;
    excludeReservationIds?: number[];
    excludeEventId?: string | null;
    onlyResourceId?: number;
  },
): Promise<{ ok: true; resources: ResourceRow[]; end: Date; settings: BusinessSettings } | { ok: false; reason: "invalid_slot" | "calendar_unavailable" | "slot_taken" }> {
  const { settings } = await getSettings(ctx.db);
  if (!getService(params.serviceId)) return { ok: false, reason: "invalid_slot" };
  const date = localDateOf(params.start, settings.timezone);
  const { candidates } = generateCandidates(date, settings, params.durationMinutes, ctx.now());
  const match = candidates.find((c) => c.start.getTime() === params.start.getTime());
  if (!match) return { ok: false, reason: "invalid_slot" };

  const pad = settings.bufferMinutes * MINUTE;
  const { resources: schedulable } = await loadSchedulableResources(
    ctx, new Date(match.start.getTime() - pad), new Date(match.end.getTime() + pad),
    { useCache: false, excludeReservationIds: params.excludeReservationIds, excludeEventId: params.excludeEventId },
  );
  const scoped = params.onlyResourceId ? schedulable.filter((r) => r.resource.id === params.onlyResourceId) : schedulable;
  if (scoped.length === 0) return { ok: false, reason: "calendar_unavailable" };
  const free = scoped.filter((r) => isCandidateFree(match, settings.bufferMinutes, r.local, r.external)).map((r) => r.resource);
  if (free.length === 0) return { ok: false, reason: "slot_taken" };
  return { ok: true, resources: free, end: match.end, settings };
}

/**
 * Fresh conflict check of a specific interval on one resource (approval recheck). Does not apply
 * customer-facing hours/lead-time rules: the request was validated when submitted.
 */
export async function checkResourceInterval(
  ctx: AppContext,
  params: { resourceId: number; start: Date; end: Date; excludeReservationIds?: number[]; excludeEventId?: string | null },
): Promise<"free" | "busy" | "calendar_unavailable"> {
  const { settings } = await getSettings(ctx.db);
  const pad = settings.bufferMinutes * MINUTE;
  const { resources: schedulable } = await loadSchedulableResources(
    ctx, new Date(params.start.getTime() - pad), new Date(params.end.getTime() + pad),
    { useCache: false, excludeReservationIds: params.excludeReservationIds, excludeEventId: params.excludeEventId },
  );
  const entry = schedulable.find((r) => r.resource.id === params.resourceId);
  if (!entry) return "calendar_unavailable";
  return isCandidateFree({ start: params.start, end: params.end }, settings.bufferMinutes, entry.local, entry.external) ? "free" : "busy";
}
