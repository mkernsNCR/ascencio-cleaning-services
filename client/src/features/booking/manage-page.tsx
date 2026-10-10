import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { AvailabilityResponse, ManagedBooking } from "@shared/api";
import { BUSINESS } from "@shared/business";
import { getService } from "@shared/domain";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LiveRegion } from "@/components/forms/field";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { api, ApiError, tokenFromHash } from "@/lib/api";
import { track } from "@/lib/analytics";
import { usePageMeta } from "@/lib/seo";
import { formatDateLong, formatDuration, formatMoney, formatTime, propertyLabel, timeZoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bookingMessages } from "./messages";
import { TimePicker, type SelectedSlot } from "./time-picker";

const STATUS_STYLE: Record<string, { cls: string; Icon: typeof Clock }> = {
  pending_approval: { cls: "bg-warning-soft text-warning", Icon: Clock },
  confirmed: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  completed: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  rejected: { cls: "bg-destructive-soft text-destructive", Icon: XCircle },
  cancelled: { cls: "bg-surface-sunken text-muted-foreground", Icon: XCircle },
  expired: { cls: "bg-surface-sunken text-muted-foreground", Icon: XCircle },
};

export default function ManageBookingPage() {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const m = t.manage;
  const common = useMessages(commonMessages);
  usePageMeta({ title: t.meta.manageTitle, description: t.meta.manageDescription, path: "/booking/manage", noindex: true });
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [selection, setSelection] = useState<SelectedSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const trackedConfirmed = useRef(false);

  // The credential lives in the URL fragment, which is never sent to the server or in referrers.
  useEffect(() => {
    setToken(tokenFromHash());
  }, []);

  const query = useQuery({
    queryKey: ["managed-booking", token],
    queryFn: () => api<ManagedBooking>("/api/booking-management", { token: token! }),
    enabled: !!token,
    retry: false,
    // Poll while a calendar operation is resolving so the customer sees the outcome.
    refetchInterval: (q) => (q.state.data?.processing ? 5000 : false),
  });
  const booking = query.data;

  useEffect(() => {
    if (booking?.status === "confirmed" && !trackedConfirmed.current) {
      trackedConfirmed.current = true;
      track("request_confirmed", { locale, serviceId: booking.serviceId });
    }
  }, [booking?.status, booking?.serviceId, locale]);

  const fetchAvailability = useCallback(
    (from: string, to: string) => api<AvailabilityResponse>(`/api/booking-management/availability?${new URLSearchParams({ from, to })}`, { token: token! }),
    [token],
  );

  const describeError = (error: unknown) => {
    if (!(error instanceof ApiError)) return common.errors.generic;
    switch (error.code) {
      case "slot_unavailable": return m.rescheduleFailed;
      case "inside_cutoff": return m.insideCutoff(booking?.policy.cancellationCutoffHours ?? 24, BUSINESS.phoneDisplay);
      case "operation_in_progress": return m.inProgress;
      case "expired_link": return m.expired;
      case "rate_limited": return common.errors.rateLimited;
      case "calendar_unavailable": return t.time.calendarUnavailable;
      default: return error.isNetwork ? common.errors.network : common.errors.generic;
    }
  };

  const doReschedule = async () => {
    if (!selection || !token) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api<ManagedBooking>("/api/booking-management/reschedule", { token, body: { start: selection.slot.start } });
      queryClient.setQueryData(["managed-booking", token], updated);
      setRescheduling(false);
      setSelection(null);
      if (updated.status === "pending_approval") setMessage({ tone: "success", text: m.rescheduledPending });
      else if (updated.pendingChange) setMessage({ tone: "info", text: m.rescheduleProcessing });
      else if (updated.start === selection.slot.start) setMessage({ tone: "success", text: m.rescheduled });
      else setMessage({ tone: "error", text: m.rescheduleFailed });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
      if (error instanceof ApiError && error.code === "slot_unavailable") {
        setSelection(null);
        queryClient.invalidateQueries({ queryKey: ["manage-availability"] });
      }
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api<ManagedBooking>("/api/booking-management/cancel", { token, body: {} });
      queryClient.setQueryData(["managed-booking", token], updated);
      setMessage({ tone: "success", text: m.cancelled });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  // Track "processing → resolved" transitions after a reschedule.
  const wasProcessing = useRef(false);
  useEffect(() => {
    if (!booking) return;
    if (wasProcessing.current && !booking.processing) {
      setMessage(booking.pendingChange ? null : { tone: "info", text: m.statusHelp[booking.status] });
    }
    wasProcessing.current = booking.processing;
  }, [booking, m.statusHelp]);

  let body: React.ReactNode;
  if (token === null) {
    body = <p className="text-muted-foreground">{m.loading}</p>;
  } else if (!token) {
    body = <Notice tone="info">{m.missing}</Notice>;
  } else if (query.isPending) {
    body = <LiveRegion className="text-muted-foreground">{m.loading}</LiveRegion>;
  } else if (query.isError) {
    const err = query.error;
    const text = err instanceof ApiError && err.status === 410 ? m.expired : err instanceof ApiError && err.status === 404 ? m.invalid : describeError(err);
    body = (
      <div className="space-y-4">
        <Notice tone="error">{text}</Notice>
        <p>
          <a href={`tel:${BUSINESS.phoneE164}`} className="font-semibold text-primary underline">{BUSINESS.phoneDisplay}</a>
          {" · "}
          <a href={`mailto:${BUSINESS.email}`} className="font-semibold text-primary underline">{BUSINESS.email}</a>
        </p>
        {err instanceof ApiError && err.isNetwork && <Button variant="outline" onClick={() => query.refetch()}>{common.errors.retry}</Button>}
      </div>
    );
  } else if (booking) {
    const style = STATUS_STYLE[booking.status] ?? STATUS_STYLE.cancelled;
    const service = getService(booking.serviceId);
    const ended = booking.status === "rejected" || booking.status === "expired" || booking.status === "cancelled";
    body = (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8">
          <p className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", style.cls)}>
            <style.Icon aria-hidden="true" className="h-4 w-4" />
            {m.status[booking.status]}
          </p>
          <p className="mt-3">{m.statusHelp[booking.status]}</p>
          {booking.decisionReason && <p className="mt-2 text-muted-foreground">{m.reason}: {booking.decisionReason}</p>}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">{m.when}</dt>
              <dd className={cn("text-lg font-semibold", ended && "line-through decoration-1")}>
                {formatDateLong(booking.start, booking.timezone, locale)}, {formatTime(booking.start, booking.timezone, locale)}–{formatTime(booking.end, booking.timezone, locale)}
                <span className="block text-sm font-normal text-muted-foreground">{timeZoneLabel(booking.timezone, locale)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{m.service}</dt>
              <dd className="font-semibold">{service?.name[locale]}</dd>
              <dd className="text-sm text-muted-foreground">{propertyLabel(booking.property, locale)} · {formatDuration(booking.durationMinutes, locale)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{m.address}</dt>
              <dd className="font-semibold">{booking.addressSummary}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t.summary.estimate}</dt>
              <dd className="font-semibold">{booking.estimateCents != null ? formatMoney(booking.estimateCents, locale) : t.service.pricePending}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t.receipt.reference}</dt>
              <dd className="font-mono font-semibold">{booking.reference}</dd>
            </div>
          </dl>

          {booking.processing && (
            <LiveRegion className="mt-6 flex items-start gap-3 rounded-lg bg-primary-soft p-4">
              <CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span>
                {m.processing}
                {booking.pendingChange && (
                  <span className="mt-1 block font-semibold">
                    {m.pendingMove(`${formatDateLong(booking.pendingChange.start, booking.timezone, locale)}, ${formatTime(booking.pendingChange.start, booking.timezone, locale)}`)}
                  </span>
                )}
              </span>
            </LiveRegion>
          )}

          {message && <Notice tone={message.tone} className="mt-6">{message.text}</Notice>}

          {(booking.canReschedule || booking.canCancel) && !rescheduling && (
            <div className="mt-6 flex flex-wrap gap-3">
              {booking.canReschedule && <Button onClick={() => { setRescheduling(true); setMessage(null); }}>{m.reschedule}</Button>}
              {booking.canCancel && <Button variant="outline" onClick={() => setConfirmCancel(true)}>{m.cancel}</Button>}
            </div>
          )}
          {!booking.canCancel && !booking.processing && (booking.status === "confirmed") && (
            <p className="mt-6 text-sm text-muted-foreground">{m.insideCutoff(booking.policy.cancellationCutoffHours, BUSINESS.phoneDisplay)}</p>
          )}
          {ended && (
            <Button asChild className="mt-6"><Link href="/booking">{m.bookAgain}</Link></Button>
          )}
        </div>

        {rescheduling && (
          <section aria-labelledby="reschedule-heading" className="space-y-4">
            <h2 id="reschedule-heading" className="text-display-md">{m.rescheduleHeading}</h2>
            <TimePicker
              queryKey={["manage-availability", token]}
              fetchAvailability={fetchAvailability}
              selected={selection}
              onSelect={setSelection}
              onStatus={() => setMessage({ tone: "error", text: t.time.calendarUnavailable })}
              onStale={() => setMessage({ tone: "error", text: t.time.stale })}
            />
            <div className="flex flex-wrap justify-between gap-3">
              <Button variant="outline" onClick={() => { setRescheduling(false); setSelection(null); }}>{m.closeReschedule}</Button>
              <Button size="lg" disabled={!selection || busy} onClick={doReschedule}>{busy ? m.rescheduling : m.rescheduleConfirm}</Button>
            </div>
          </section>
        )}

        <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.cancelConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{m.cancelConfirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.keep}</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); doCancel(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {m.cancelConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <h1 className="mb-8 text-display-lg">{m.heading}</h1>
      {body}
    </div>
  );
}

function Notice({ tone, children, className }: { tone: "success" | "error" | "info"; children: React.ReactNode; className?: string }) {
  const cls = tone === "success" ? "bg-success-soft text-success border-success/30" : tone === "error" ? "bg-destructive-soft text-destructive border-destructive/30" : "bg-primary-soft text-foreground border-primary/20";
  return (
    <LiveRegion assertive={tone === "error"} className={cn("rounded-lg border p-4 font-medium", cls, className)}>
      {children}
    </LiveRegion>
  );
}
