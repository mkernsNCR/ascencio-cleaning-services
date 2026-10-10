import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { adminKeys, useAdmin } from "./admin-api";
import { duration, fmtDate, fmtDateTime, fmtTime, money, property, relative, serviceName } from "./admin-format";
import { BookingActions, ResultBanner, type ActionResult } from "./booking-actions";
import { BookingLink, BookingStatusPill, CalendarStatusPill, hasInFlight, PendingChangeNotice } from "./booking-bits";
import type { Booking } from "./types";
import { Card, Empty, PageHeader, Pill, QueryState } from "./ui";

const PARAMS = { status: "pending_approval" };

export default function RequestsPage() {
  const { get } = useAdmin();
  const [result, setResult] = useState<ActionResult | null>(null);
  const q = useQuery({
    queryKey: adminKeys.bookings(PARAMS),
    queryFn: () => get<Booking[]>("/api/admin/bookings?status=pending_approval"),
    refetchInterval: (query) => (hasInFlight(query.state.data) ? 4000 : 60_000),
  });

  return (
    <>
      <PageHeader
        title="Booking requests"
        description="Requests waiting for approval, soonest appointment first. Each request holds its time slot until you decide or it expires."
        actions={<Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh"}</Button>}
      />
      <ResultBanner result={result} onDismiss={() => setResult(null)} />
      <QueryState query={q} loadingLabel="Loading requests…">
        {(rows) =>
          rows.length === 0 ? (
            <Empty>No pending requests. New requests appear here and are also emailed to the owner.</Empty>
          ) : (
            <ul className="flex flex-col gap-4" aria-label={`${rows.length} pending requests`}>
              {rows.map((b) => <RequestCard key={b.id} booking={b} onResult={setResult} />)}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}

function RequestCard({ booking: b, onResult }: { booking: Booking; onResult: (r: ActionResult) => void }) {
  const expiresSoon = b.expiresAt && new Date(b.expiresAt).getTime() - Date.now() < 6 * 3600_000;
  return (
    <Card as="li" className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-sans text-lg font-semibold">
            <BookingLink booking={b} /> <span className="font-normal text-muted-foreground">· {b.firstName} {b.lastName}</span>
          </h2>
          <p className="mt-0.5 text-base">
            <span className="font-semibold">{fmtDate(b.startAt, b.timezone)}</span>, {fmtTime(b.startAt, b.timezone)} – {fmtTime(b.endAt, b.timezone)}
            <span className="text-muted-foreground"> ({b.timezone})</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BookingStatusPill booking={b} />
          <CalendarStatusPill booking={b} />
          {expiresSoon && <Pill tone="warning">Expires soon</Pill>}
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold text-muted-foreground">Service</p>
          <p>{serviceName(b.serviceId)}</p>
          <p className="text-muted-foreground">{property(b.property)}</p>
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">Customer</p>
          <p><a className="text-primary underline" href={`tel:${b.phone}`}>{b.phone}</a></p>
          <p className="break-all"><a className="text-primary underline" href={`mailto:${b.email}`}>{b.email}</a></p>
          <p className="text-muted-foreground">ZIP {b.postalCode} · {b.locale === "es" ? "Spanish" : "English"}</p>
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">Estimate</p>
          <p>{money(b.estimateCents)}</p>
          <p className="text-muted-foreground">{duration(b.durationMinutes)} service</p>
        </div>
        <div>
          <p className="font-semibold text-muted-foreground">Received / expires</p>
          <p>Received {fmtDateTime(b.createdAt, b.timezone)}</p>
          <p>{b.expiresAt ? <>Expires {fmtDateTime(b.expiresAt, b.timezone)} <span className="text-muted-foreground">({relative(b.expiresAt)})</span></> : "No expiry"}</p>
        </div>
      </div>
      {(b.notes || b.pendingChange || b.calendarStatus === "conflict") && (
        <div className="px-5 pb-2 text-sm">
          {b.notes && <p><span className="font-semibold">Customer notes:</span> {b.notes}</p>}
          {b.calendarStatus === "conflict" && (
            <p className="mt-1 text-destructive">An earlier approval found a Google Calendar conflict. Decline, or free the time in Google Calendar and retry.</p>
          )}
          <PendingChangeNotice booking={b} />
        </div>
      )}
      <div className="border-t bg-surface-sunken/40 px-5 py-3">
        <BookingActions booking={b} onResult={onResult} />
      </div>
    </Card>
  );
}
