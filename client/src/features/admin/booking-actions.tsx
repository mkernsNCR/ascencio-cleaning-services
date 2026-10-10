// Approve / decline / complete actions for a booking, with outcome reporting. The UI never claims a
// booking is confirmed unless the server returns status "confirmed".
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, LiveRegion } from "@/components/forms/field";
import { adminKeys, useAdmin } from "./admin-api";
import { fmtDateTime, serviceName, type Tone } from "./admin-format";
import type { Booking, DecisionResponse } from "./types";
import { ConfirmDialog, Notice } from "./ui";

export interface ActionResult {
  tone: Tone;
  title: string;
  body: ReactNode;
}

const DECISION_ERRORS: Record<string, string> = {
  stale_version: "This request changed since you loaded it (for example, the customer rescheduled). The list has been refreshed — review the new details and decide again.",
  not_pending: "This request is no longer pending: it was already approved, declined, cancelled, or it expired. The list has been refreshed.",
  calendar_operation_in_progress: "Google Calendar is still resolving an earlier action on this request. Wait a few seconds and try again.",
  calendar_disconnected: "Google Calendar is not connected, so this booking cannot be confirmed. Reconnect it on the Integrations page, then approve again.",
};

export function outcomeResult(res: DecisionResponse): ActionResult {
  const b = res.booking;
  const ref = b.reference;
  switch (res.outcome) {
    case "confirmed":
      if (b.status === "confirmed") {
        return { tone: "success", title: `${ref} confirmed`, body: "The Google Calendar event was created and the customer's confirmation email was queued." };
      }
      break;
    case "rejected":
      return { tone: "neutral", title: `${ref} declined`, body: "The time slot was released and the customer will be emailed." };
    case "processing":
      return {
        tone: "info",
        title: `${ref}: approval recorded, calendar still resolving`,
        body: "Google Calendar has not finished creating the event yet. This booking is NOT confirmed until it does; the status will update here automatically.",
      };
    case "conflict":
      return {
        tone: "danger",
        title: `${ref} was not confirmed: calendar conflict`,
        body: "Google Calendar shows another commitment at this time. Decline the request, or free the time in Google Calendar and approve again later.",
      };
    case "calendar_disconnected":
      return {
        tone: "danger",
        title: `${ref} was not confirmed: calendar disconnected`,
        body: <>Google Calendar is not connected. <Link href="/integrations" className="font-semibold text-primary underline">Reconnect on the Integrations page</Link>, then approve again.</>,
      };
  }
  return { tone: "warning", title: `${ref} is now ${b.status.replace("_", " ")}`, body: "The request could not be approved in its current state." };
}

export function ResultBanner({ result, onDismiss }: { result: ActionResult | null; onDismiss: () => void }) {
  return (
    <LiveRegion className="empty:hidden">
      {result && (
        <div className="mb-6 flex items-start gap-2">
          <Notice tone={result.tone} title={result.title} className="flex-1">{result.body}</Notice>
          <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
        </div>
      )}
    </LiveRegion>
  );
}

function useRefreshBookings() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: adminKeys.bookingsAll }),
    qc.invalidateQueries({ queryKey: adminKeys.bookingAll }),
    qc.invalidateQueries({ queryKey: adminKeys.overview }),
    qc.invalidateQueries({ queryKey: adminKeys.discrepancies }),
  ]);
}

function Summary({ booking }: { booking: Booking }) {
  return (
    <p className="rounded-lg bg-surface-sunken p-3 text-sm">
      <span className="font-semibold">{booking.reference}</span> · {booking.firstName} {booking.lastName}
      <br />
      {serviceName(booking.serviceId)} · {fmtDateTime(booking.startAt, booking.timezone)}
    </p>
  );
}

export function BookingActions({ booking, onResult, compact }: { booking: Booking; onResult: (r: ActionResult) => void; compact?: boolean }) {
  const { post } = useAdmin();
  const refresh = useRefreshBookings();
  const [dialog, setDialog] = useState<"approve" | "reject" | "complete" | null>(null);
  const [reason, setReason] = useState("");
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const run = async (fn: () => Promise<ActionResult>) => {
    try {
      const r = await fn();
      onResult(r);
    } finally {
      void refresh();
    }
  };

  const isPending = booking.status === "pending_approval";
  const inFlight = booking.calendarStatus === "creating" || booking.calendarStatus === "retrying";
  const started = new Date(booking.startAt).getTime() <= Date.now();
  const size = compact ? "sm" : "default";

  return (
    <div className="flex flex-wrap gap-2">
      {isPending && (
        <>
          <Button size={size} onClick={() => setDialog("approve")} disabled={inFlight} aria-label={`Approve ${booking.reference}`}>
            {booking.calendarStatus === "conflict" ? "Retry approval" : "Approve"}
          </Button>
          <Button size={size} variant="outline" onClick={() => { setReason(""); setDialog("reject"); }} disabled={inFlight} aria-label={`Decline ${booking.reference}`}>
            Decline
          </Button>
          {inFlight && <span className="self-center text-sm text-muted-foreground">Calendar operation in progress…</span>}
        </>
      )}
      {booking.status === "confirmed" && (
        <>
          <Button
            size={size}
            variant="outline"
            onClick={() => setDialog("complete")}
            disabled={!started}
            aria-label={`Mark ${booking.reference} completed`}
            aria-describedby={!started ? `complete-hint-${booking.id}` : undefined}
          >
            Mark completed
          </Button>
          {!started && <span id={`complete-hint-${booking.id}`} className="self-center text-xs text-muted-foreground">Available after the start time</span>}
        </>
      )}

      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={close}
        title={`Approve ${booking.reference}?`}
        description="The server rechecks availability and creates the Google Calendar event. The booking is confirmed only if that succeeds; the customer is then emailed."
        confirmLabel="Approve and create event"
        errorOverrides={DECISION_ERRORS}
        onConfirm={() => run(async () => outcomeResult(await post<DecisionResponse>(`/api/admin/bookings/${booking.id}/approve`, { version: booking.version })))}
      >
        <Summary booking={booking} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reject"}
        onOpenChange={close}
        title={`Decline ${booking.reference}?`}
        description="The held time slot is released and the customer receives a decline email with a link to choose another time."
        confirmLabel="Decline request"
        destructive
        errorOverrides={DECISION_ERRORS}
        onConfirm={() => run(async () => outcomeResult(await post<DecisionResponse>(`/api/admin/bookings/${booking.id}/reject`, { version: booking.version, reason: reason.trim() || undefined })))}
      >
        <Summary booking={booking} />
        <Field label="Reason for the customer" optionalLabel="optional" hint="Included in the decline email. Up to 500 characters.">
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "complete"}
        onOpenChange={close}
        title={`Mark ${booking.reference} completed?`}
        description="Use this once the cleaning has been done. This cannot be undone from the dashboard."
        confirmLabel="Mark completed"
        errorOverrides={{ stale_version: DECISION_ERRORS.stale_version }}
        onConfirm={() => run(async () => {
          const res = await post<{ booking: Booking }>(`/api/admin/bookings/${booking.id}/complete`, { version: booking.version });
          return res.booking.status === "completed"
            ? { tone: "success", title: `${booking.reference} marked completed`, body: "The appointment is now in the history." }
            : { tone: "warning", title: `${booking.reference} is ${res.booking.status}`, body: "The booking was not marked completed." };
        })}
      >
        <Summary booking={booking} />
      </ConfirmDialog>
    </div>
  );
}
