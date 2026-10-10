import { getService } from "@shared/domain";
import { localDateOf, zoneAbbreviation } from "@shared/time";
import { formatDuration, formatMoney, propertyLabel } from "@/lib/format";
import type { BookingStatus, CalendarStatus, DiscrepancyKind, MailStatus } from "./types";

export const money = (cents: number) => formatMoney(cents, "en");
export const duration = (minutes: number) => formatDuration(minutes, "en");
export const property = (p: { bedrooms: number; bathrooms: number }) => propertyLabel(p, "en");
export const serviceName = (id: string | null | undefined) => (id ? getService(id)?.name.en ?? id : "—");

/** "Fri, Oct 9, 2026" in the given zone. */
export function fmtDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

/** "9:00 AM EDT" in the given zone. */
export function fmtTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
}

/** "Fri, Oct 9, 2026, 9:00 AM EDT" in the given zone. */
export function fmtDateTime(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

/** "Friday, October 9" heading for a local YYYY-MM-DD date. */
export function fmtDayHeading(localDate: string) {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const localDay = (iso: string, timeZone: string) => localDateOf(new Date(iso), timeZone);

export function zoneLabel(timeZone: string) {
  return `${timeZone} (${zoneAbbreviation(new Date(), timeZone)})`;
}

/** Rough relative phrase such as "in 3 h" or "2 d ago". */
export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const text = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const bookingStatusInfo: Record<BookingStatus, { label: string; tone: Tone }> = {
  pending_approval: { label: "Pending approval", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  rejected: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  completed: { label: "Completed", tone: "info" },
};

export const calendarStatusInfo: Record<CalendarStatus, { label: string; tone: Tone; help: string }> = {
  not_created: { label: "No calendar event", tone: "neutral", help: "No Google Calendar event exists yet." },
  creating: { label: "Creating event", tone: "info", help: "The calendar event is being created; the outcome will update shortly." },
  synced: { label: "Calendar synced", tone: "success", help: "The Google Calendar event matches this booking." },
  retrying: { label: "Calendar retrying", tone: "warning", help: "A calendar operation failed and is being retried automatically." },
  conflict: { label: "Calendar conflict", tone: "danger", help: "Google Calendar shows another commitment at this time." },
  disconnected: { label: "Calendar disconnected", tone: "danger", help: "Google Calendar is not connected, so the event could not be written." },
  delete_pending: { label: "Event removal pending", tone: "warning", help: "The calendar event is being removed. The slot stays blocked until removal is verified." },
};

export const mailStatusInfo: Record<MailStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Accepted by mail server", tone: "success" },
  failed: { label: "Failed (will retry)", tone: "warning" },
  dead: { label: "Gave up", tone: "danger" },
  suppressed: { label: "Suppressed", tone: "neutral" },
};

export const discrepancyInfo: Record<DiscrepancyKind, { title: string; explain: string }> = {
  event_moved: {
    title: "Calendar event was moved",
    explain: "Someone moved this booking's event in Google Calendar. The customer's booking time was not changed. Move the event back, or reschedule with the customer and then resolve.",
  },
  event_deleted: {
    title: "Calendar event was deleted",
    explain: "This booking's event was deleted in Google Calendar, but the booking is still active for the customer. Recreate the event or cancel the booking with the customer, then resolve.",
  },
  event_collision: {
    title: "Another calendar commitment overlaps",
    explain: "Google Calendar shows another event overlapping a confirmed booking. The booking was not changed. Decide which commitment to keep and contact the customer if needed.",
  },
  approval_conflict: {
    title: "Approval blocked by a calendar conflict",
    explain: "When this request was approved, Google Calendar already had something at that time, so it was not confirmed. Decline the request or free the time and retry the approval.",
  },
  reschedule_conflict: {
    title: "Reschedule blocked by a calendar conflict",
    explain: "A customer's reschedule could not be completed because the new time was busy in Google Calendar. The original appointment was kept.",
  },
  unmapped_event: {
    title: "Unrecognised event on a booking calendar",
    explain: "An event that looks like it was created by the booking system has no matching booking. Nothing was changed; check whether it should be deleted.",
  },
};

export const contactKindLabel = {
  contact: "Contact message",
  commercial_quote: "Commercial quote",
  booking_fallback: "Booking fallback (could not book online)",
} as const;
