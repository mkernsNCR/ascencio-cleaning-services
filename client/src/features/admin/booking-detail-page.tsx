import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { adminKeys, useAdmin } from "./admin-api";
import { calendarStatusInfo, duration, fmtDateTime, fmtTime, mailStatusInfo, money, property, relative, serviceName } from "./admin-format";
import { BookingActions, ResultBanner, type ActionResult } from "./booking-actions";
import { BookingStatusPill, CalendarStatusPill, PendingChangeNotice } from "./booking-bits";
import type { BookingDetailResponse } from "./types";
import { Card, DataList, Empty, ErrorState, Loading, Notice, PageHeader, Pill, tableCls } from "./ui";

const ACTION_LABELS: Record<string, string> = {
  created: "Request submitted",
  approval_requested: "Approval requested by staff",
  approval_conflict: "Approval blocked: Google Calendar conflict",
  approval_blocked_calendar_disconnected: "Approval blocked: calendar disconnected",
  confirmed: "Confirmed (calendar event created)",
  rejected: "Declined",
  expired: "Expired without a decision",
  cancelled: "Cancelled",
  completed: "Marked completed",
  rescheduled: "Rescheduled",
  reschedule_requested: "Reschedule requested",
  reschedule_abandoned: "Reschedule abandoned",
  calendar_event_deleted: "Calendar event deleted",
};

function humanize(s: string) {
  return ACTION_LABELS[s] ?? s.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function BookingDetailPage({ id }: { id: string }) {
  const { get } = useAdmin();
  const [result, setResult] = useState<ActionResult | null>(null);
  const q = useQuery({
    queryKey: adminKeys.booking(id),
    queryFn: () => get<BookingDetailResponse>(`/api/admin/bookings/${encodeURIComponent(id)}`),
    refetchInterval: (query) => {
      const b = query.state.data?.booking;
      return b && (["creating", "retrying", "delete_pending"].includes(b.calendarStatus) || b.pendingChange) ? 4000 : false;
    },
  });

  if (q.isPending) return <Loading label="Loading booking…" />;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 400);
    return notFound ? (
      <Notice tone="warning" title="Booking not found">
        <Link href="/requests" className="font-semibold text-primary underline">Back to requests</Link>
      </Notice>
    ) : (
      <ErrorState error={q.error} onRetry={() => q.refetch()} />
    );
  }

  const { booking: b, history, mail } = q.data;
  const tz = b.timezone;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href={b.status === "pending_approval" ? "/requests" : "/schedule"} className="text-primary underline">
          ← {b.status === "pending_approval" ? "Requests" : "Schedule"}
        </Link>
      </nav>
      <PageHeader
        title={`Booking ${b.reference}`}
        description={<div className="flex flex-wrap items-center gap-2"><BookingStatusPill booking={b} /><CalendarStatusPill booking={b} /><span>Version {b.version}</span></div>}
      />
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      {(b.status === "pending_approval" || b.status === "confirmed") && (
        <div className="mb-6"><BookingActions booking={b} onResult={setResult} /></div>
      )}
      <PendingChangeNotice booking={b} />

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card title="Appointment">
          <DataList items={[
            ["When", <>{fmtDateTime(b.startAt, tz)} – {fmtTime(b.endAt, tz)}</>],
            ["Time zone", tz],
            ["Service", serviceName(b.serviceId)],
            ["Property", property(b.property)],
            ["Duration", duration(b.durationMinutes)],
            ["Estimate", `${money(b.estimateCents)} ${b.currency}`],
            ["Price version", `#${b.pricingVersionId}`],
            ["Crew", `#${b.resourceId}`],
            ["Expires", b.status === "pending_approval" && b.expiresAt ? `${fmtDateTime(b.expiresAt, tz)} (${relative(b.expiresAt)})` : "—"],
            ["Decided", b.decidedAt ? fmtDateTime(b.decidedAt, tz) : "—"],
            ["Decision reason", b.decisionReason ?? "—"],
            ["Received", fmtDateTime(b.createdAt, tz)],
            ["Last updated", fmtDateTime(b.updatedAt, tz)],
            ...(b.legacyId ? [["Legacy ID", String(b.legacyId)] as [string, string]] : []),
          ]} />
        </Card>
        <Card title="Customer">
          <DataList items={[
            ["Name", `${b.firstName} ${b.lastName}`],
            ["Phone", <a className="text-primary underline" href={`tel:${b.phone}`}>{b.phone}</a>],
            ["Email", <a className="break-all text-primary underline" href={`mailto:${b.email}`}>{b.email}</a>],
            ["Address", b.address],
            ["ZIP", b.postalCode],
            ["Language", b.locale === "es" ? "Spanish" : "English"],
            ["Notes", b.notes ?? "—"],
            ["Policy acknowledged", fmtDateTime(b.policyAckAt, tz)],
            ["Marketing opt-in", b.marketingOptIn ? "Yes" : "No"],
          ]} />
        </Card>
        <Card title="Calendar event">
          <DataList items={[
            ["Status", <><CalendarStatusPill booking={b} /><p className="mt-1 text-sm text-muted-foreground">{calendarStatusInfo[b.calendarStatus]?.help}</p></>],
            ["Calendar", b.calendarId ? <span className="break-all">{b.calendarId}</span> : "—"],
            ["Event ID", b.calendarEventId ? <code className="break-all text-sm">{b.calendarEventId}</code> : "—"],
          ]} />
        </Card>
        <Card title="Emails" description="“Accepted by mail server” means SMTP accepted the message; it does not prove it reached the inbox.">
          {mail.length === 0 ? (
            <Empty>No emails recorded for this booking.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {mail.map((m) => {
                const info = mailStatusInfo[m.status] ?? { label: m.status, tone: "neutral" as const };
                return (
                  <li key={m.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{humanize(m.type)}</span>
                      <Pill tone={info.tone}>{info.label}</Pill>
                    </div>
                    <p className="break-all text-muted-foreground">To {m.recipient}</p>
                    <p>Attempts: {m.attempts}{m.sentAt ? ` · Sent ${fmtDateTime(m.sentAt, tz)}` : ""}{(m.status === "queued" || m.status === "failed") ? ` · Next attempt ${fmtDateTime(m.nextAttemptAt, tz)}` : ""}</p>
                    {m.lastError && <p className="text-destructive">Last error: {m.lastError}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {mail.some((m) => m.status === "failed" || m.status === "dead") && (
            <p className="mt-3 text-sm"><Link href="/attention#email" className="font-semibold text-primary underline">Retry failed emails on the Attention page</Link></p>
          )}
        </Card>
      </div>

      <Card title="History" className="mt-6" description={`Audit trail, oldest first. Times in ${tz}.`}>
        {history.length === 0 ? (
          <Empty>No history entries.</Empty>
        ) : (
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <caption className="sr-only">Booking history</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableCls.th}>When</th>
                  <th scope="col" className={tableCls.th}>Event</th>
                  <th scope="col" className={tableCls.th}>By</th>
                  <th scope="col" className={tableCls.th}>Status change</th>
                  <th scope="col" className={tableCls.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className={tableCls.td}>{fmtDateTime(h.createdAt, tz)}</td>
                    <th scope="row" className={`${tableCls.td} font-semibold`}>{humanize(h.action)}</th>
                    <td className={tableCls.td}>{h.actor}</td>
                    <td className={tableCls.td}>{h.fromStatus && h.toStatus && h.fromStatus !== h.toStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus ?? "—"}</td>
                    <td className={`${tableCls.td} max-w-xs break-words font-mono text-xs`}>{h.details ? JSON.stringify(h.details) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
