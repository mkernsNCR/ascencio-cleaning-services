import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { adminKeys, useAdmin } from "./admin-api";
import { fmtDateTime, fmtDayHeading, fmtTime, localDay, money, property, serviceName } from "./admin-format";
import { BookingActions, ResultBanner, type ActionResult } from "./booking-actions";
import { BookingLink, BookingStatusPill, CalendarStatusPill, hasInFlight, PendingChangeNotice } from "./booking-bits";
import type { Booking, BookingStatus } from "./types";
import { Empty, NativeSelect, PageHeader, QueryState, tableCls } from "./ui";

type View = "upcoming" | "past_confirmed" | Exclude<BookingStatus, "pending_approval" | "confirmed">;

const VIEWS: { value: View; label: string }[] = [
  { value: "upcoming", label: "Upcoming confirmed" },
  { value: "past_confirmed", label: "Started, not yet marked completed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Declined" },
  { value: "expired", label: "Expired" },
];

function minuteIso() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

export default function SchedulePage() {
  const { get } = useAdmin();
  const [view, setView] = useState<View>("upcoming");
  const [now] = useState(minuteIso);
  const [result, setResult] = useState<ActionResult | null>(null);

  const params: Record<string, string> =
    view === "upcoming" ? { status: "confirmed", from: now } : view === "past_confirmed" ? { status: "confirmed", to: now } : { status: view };

  const q = useQuery({
    queryKey: adminKeys.bookings(params),
    queryFn: () => get<Booking[]>(`/api/admin/bookings?${new URLSearchParams(params).toString()}`),
    refetchInterval: (query) => (hasInFlight(query.state.data) ? 5000 : false),
  });

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Confirmed appointments grouped by day in the business time zone, plus booking history."
        actions={<Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh"}</Button>}
      />
      <div className="mb-6 max-w-sm">
        <Field label="Show">
          <NativeSelect value={view} onChange={(e) => setView(e.target.value as View)}>
            {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <QueryState query={q} loadingLabel="Loading bookings…">
        {(rows) =>
          rows.length === 0 ? (
            <Empty>{view === "upcoming" ? "No upcoming confirmed appointments." : "Nothing to show for this filter."}</Empty>
          ) : view === "upcoming" ? (
            <UpcomingByDay rows={rows} onResult={setResult} />
          ) : (
            <HistoryTable rows={rows} onResult={setResult} showActions={view === "past_confirmed"} />
          )
        }
      </QueryState>
      {q.data && q.data.length >= 200 && <p className="mt-3 text-sm text-muted-foreground">Showing the first 200 results.</p>}
    </>
  );
}

function UpcomingByDay({ rows, onResult }: { rows: Booking[]; onResult: (r: ActionResult) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of rows) {
      const day = localDay(b.startAt, b.timezone);
      map.set(day, [...(map.get(day) ?? []), b]);
    }
    return Array.from(map.entries());
  }, [rows]);
  const zone = rows[0]?.timezone;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">All times in {zone}.</p>
      {groups.map(([day, items]) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`} className="mb-3 font-sans text-lg font-semibold">
            {fmtDayHeading(day)} <span className="text-sm font-normal text-muted-foreground">· {items.length} {items.length === 1 ? "appointment" : "appointments"}</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {items.map((b) => (
              <li key={b.id} className="rounded-xl border bg-surface p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-4">
                    <div className="w-28 shrink-0">
                      <p className="font-semibold">{fmtTime(b.startAt, b.timezone)}</p>
                      <p className="text-sm text-muted-foreground">to {fmtTime(b.endAt, b.timezone)}</p>
                    </div>
                    <div className="text-sm">
                      <p className="text-base"><BookingLink booking={b} /> · {b.firstName} {b.lastName}</p>
                      <p>{serviceName(b.serviceId)} · {property(b.property)} · {money(b.estimateCents)}</p>
                      <p className="text-muted-foreground">{b.address}</p>
                      <p><a className="text-primary underline" href={`tel:${b.phone}`}>{b.phone}</a></p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2"><CalendarStatusPill booking={b} /></div>
                </div>
                <PendingChangeNotice booking={b} />
                <div className="mt-3"><BookingActions booking={b} onResult={onResult} compact /></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HistoryTable({ rows, onResult, showActions }: { rows: Booking[]; onResult: (r: ActionResult) => void; showActions: boolean }) {
  return (
    <div className={tableCls.wrap}>
      <table className={tableCls.table}>
        <caption className="sr-only">Bookings</caption>
        <thead>
          <tr>
            <th scope="col" className={tableCls.th}>Reference</th>
            <th scope="col" className={tableCls.th}>Appointment</th>
            <th scope="col" className={tableCls.th}>Customer</th>
            <th scope="col" className={tableCls.th}>Service</th>
            <th scope="col" className={tableCls.th}>Status</th>
            <th scope="col" className={tableCls.th}>{showActions ? "Actions" : "Decided / reason"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <th scope="row" className={`${tableCls.td} font-normal`}><BookingLink booking={b} /></th>
              <td className={tableCls.td}>{fmtDateTime(b.startAt, b.timezone)}</td>
              <td className={tableCls.td}>{b.firstName} {b.lastName}<br /><span className="text-muted-foreground">{b.email}</span></td>
              <td className={tableCls.td}>{serviceName(b.serviceId)}<br /><span className="text-muted-foreground">{money(b.estimateCents)}</span></td>
              <td className={tableCls.td}><div className="flex flex-col items-start gap-1"><BookingStatusPill booking={b} /><CalendarStatusPill booking={b} /></div></td>
              <td className={tableCls.td}>
                {showActions ? (
                  <BookingActions booking={b} onResult={onResult} compact />
                ) : (
                  <>
                    {b.decidedAt ? fmtDateTime(b.decidedAt, b.timezone) : "—"}
                    {b.decisionReason && <p className="text-muted-foreground">“{b.decisionReason}”</p>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
