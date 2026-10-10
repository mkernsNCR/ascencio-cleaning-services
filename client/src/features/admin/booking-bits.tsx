import { Link } from "wouter";
import { bookingStatusInfo, calendarStatusInfo, fmtDateTime, fmtTime } from "./admin-format";
import type { Booking } from "./types";
import { Notice, Pill } from "./ui";

export function BookingStatusPill({ booking }: { booking: Pick<Booking, "status"> }) {
  const info = bookingStatusInfo[booking.status] ?? { label: booking.status, tone: "neutral" as const };
  return <Pill tone={info.tone}>{info.label}</Pill>;
}

export function CalendarStatusPill({ booking }: { booking: Pick<Booking, "calendarStatus"> }) {
  const info = calendarStatusInfo[booking.calendarStatus] ?? { label: booking.calendarStatus, tone: "neutral" as const, help: "" };
  return <Pill tone={info.tone} title={info.help}>{info.label}</Pill>;
}

export function PendingChangeNotice({ booking }: { booking: Booking }) {
  if (!booking.pendingChange) return null;
  const c = booking.pendingChange;
  return (
    <Notice tone="warning" title="Reschedule in progress" className="mt-2">
      Customer asked to move to {fmtDateTime(c.startAt, booking.timezone)} – {fmtTime(c.endAt, booking.timezone)}. The original time stays reserved until the calendar update succeeds.
    </Notice>
  );
}

export function BookingLink({ booking }: { booking: Pick<Booking, "id" | "reference"> }) {
  return (
    <Link href={`/bookings/${booking.id}`} className="font-semibold text-primary underline underline-offset-2">
      {booking.reference}
    </Link>
  );
}

export const hasInFlight = (rows: Booking[] | undefined) =>
  !!rows?.some((b) => b.calendarStatus === "creating" || b.calendarStatus === "retrying" || b.calendarStatus === "delete_pending" || b.pendingChange);
