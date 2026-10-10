import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminKeys, useAdmin, useBusinessTimezone } from "./admin-api";
import { fmtDateTime, relative } from "./admin-format";
import type { OverviewResponse } from "./types";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader, Pill, QueryState } from "./ui";
import { cn } from "@/lib/utils";


export default function OverviewPage() {
  const { get } = useAdmin();
  const q = useQuery({ queryKey: adminKeys.overview, queryFn: () => get<OverviewResponse>("/api/admin/overview"), refetchInterval: 60_000 });

  return (
    <>
      <PageHeader
        title="Overview"
        description="What needs attention right now, calendar health, and launch readiness."
        actions={<Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh"}</Button>}
      />
      <QueryState query={q}>
        {(data) => <OverviewContent data={data} />}
      </QueryState>
    </>
  );
}

function OverviewContent({ data }: { data: OverviewResponse }) {
  const localZone = useBusinessTimezone();
  const { counts, calendar, launchChecklist: lc } = data;
  const calendarOk = calendar.status === "connected" && calendar.mode === "google";
  const tiles: { label: string; value: number; href: string; hint: string; alert: boolean }[] = [
    { label: "Pending requests", value: counts.pending, href: "/requests", hint: "Awaiting your approval", alert: counts.pending > 0 },
    { label: "Upcoming confirmed", value: counts.upcoming, href: "/schedule", hint: "Confirmed and not yet started", alert: false },
    { label: "Calendar discrepancies", value: counts.discrepancies, href: "/attention#discrepancies", hint: "Calendar changes needing review", alert: counts.discrepancies > 0 },
    { label: "Failed emails", value: counts.mailFailed, href: "/attention#email", hint: "Failed or given up", alert: counts.mailFailed > 0 },
    { label: "Dead jobs", value: counts.jobsDead, href: "/attention#jobs", hint: "Background work that stopped retrying", alert: counts.jobsDead > 0 },
    { label: "Jobs retrying", value: counts.jobsRetrying, href: "/attention#jobs", hint: "Failed once, retrying automatically", alert: counts.jobsRetrying > 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {calendar.mode === "fake" && (
        <Notice tone="danger" role="alert" title="Calendar is in FAKE mode">
          Bookings are being "confirmed" against a simulated calendar. No real Google Calendar events are created and real busy times are not checked. Set GOOGLE_CALENDAR_MODE=google before launch.
        </Notice>
      )}
      {calendar.mode === "google" && calendar.status !== "connected" && (
        <Notice tone="danger" role="alert" title={`Google Calendar is ${calendar.status}`}>
          New approvals cannot be confirmed and availability may be blocked until Calendar is reconnected.{" "}
          <Link href="/integrations" className="font-semibold text-primary underline">Go to Integrations</Link>
        </Notice>
      )}

      <section aria-labelledby="counts-heading">
        <h2 id="counts-heading" className="sr-only">Counts</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.label}>
              <Link
                href={t.href}
                className={cn(
                  "flex h-full flex-col rounded-xl border bg-surface p-5 shadow-soft transition-colors hover:border-primary",
                  t.alert && "border-warning/50 bg-warning-soft/40",
                )}
              >
                <span className="text-sm font-semibold text-muted-foreground">{t.label}</span>
                <span className="mt-1 font-display text-4xl font-semibold">{t.value}</span>
                <span className="mt-1 text-sm text-muted-foreground">{t.hint}{t.alert ? " — needs attention" : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Calendar health"
          actions={<Link href="/integrations" className="text-sm font-semibold text-primary underline">Manage</Link>}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold text-muted-foreground">Mode</dt>
            <dd>{calendar.mode === "fake" ? <Pill tone="danger">Fake (development)</Pill> : <Pill tone="success">Google</Pill>}</dd>
            <dt className="font-semibold text-muted-foreground">Connection</dt>
            <dd><Pill tone={calendar.status === "connected" ? "success" : "danger"}>{calendar.status}</Pill></dd>
            <dt className="font-semibold text-muted-foreground">Account</dt>
            <dd>{calendar.accountEmail ?? "—"}</dd>
            {calendar.lastError && (
              <>
                <dt className="font-semibold text-muted-foreground">Last error</dt>
                <dd className="text-destructive">{calendar.lastError}</dd>
              </>
            )}
          </dl>
          <h3 className="mt-5 font-sans text-sm font-semibold">Sync state per calendar</h3>
          {calendar.sync.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No calendars have synced yet. Assign crew calendars on the Integrations page.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {calendar.sync.map((s) => {
                const expiringSoon = s.channelExpiresAt && new Date(s.channelExpiresAt).getTime() - Date.now() < 24 * 3600_000;
                return (
                  <li key={s.calendarId} className="rounded-lg border p-3 text-sm">
                    <p className="break-all font-semibold">{s.calendarId}</p>
                    <p>Last sync: {s.lastSyncAt ? `${fmtDateTime(s.lastSyncAt, localZone)} (${relative(s.lastSyncAt)})` : "never"}</p>
                    <p>
                      Push channel expires: {s.channelExpiresAt ? `${fmtDateTime(s.channelExpiresAt, localZone)} (${relative(s.channelExpiresAt)})` : "no channel"}
                      {expiringSoon && <Pill tone="warning" className="ml-2">Renewal due</Pill>}
                    </p>
                    {s.lastError && <p className="text-destructive">Error: {s.lastError}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Sync times shown in {localZone}.</p>
        </Card>

        <Card title="Launch checklist" description="Everything here should be complete before taking real bookings.">
          <ul className="flex flex-col gap-3">
            <ChecklistItem ok={lc.settingsApproved} label="Business settings approved" detail={lc.settingsApproved ? "Hours, lead time, coverage and policies are approved." : "Settings are still proposed defaults or were changed since approval."} href="/settings" />
            <ChecklistItem ok={lc.pricesApproved} label="Prices approved for publication" detail={lc.pricesApproved ? "The active price version is approved." : "Customers will not see estimates until a price version is approved."} href="/settings#pricing" />
            <ChecklistItem ok={lc.mail === "smtp"} label="Real email sending" detail={lc.mail === "smtp" ? "Mail transport is SMTP." : "Mail transport is \"log\": emails are written to the server log, NOT sent to anyone (set MAIL_TRANSPORT=smtp)."} />
            <ChecklistItem ok={calendarOk} label="Google Calendar connected" detail={calendarOk ? "Live Google Calendar is connected." : "Calendar is in fake mode or not connected."} href="/integrations" />
            <ChecklistItem ok={lc.bookingEnabled} label="Online booking enabled" detail={lc.bookingEnabled ? "Customers can submit booking requests." : "Online booking is turned off (BOOKING_ENABLED); customers are routed to the contact form."} />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ChecklistItem({ ok, label, detail, href }: { ok: boolean; label: string; detail: string; href?: string }) {
  return (
    <li className="flex items-start gap-3">
      <Pill tone={ok ? "success" : "warning"} className="mt-0.5">{ok ? "Done" : "To do"}</Pill>
      <div className="text-sm">
        <p className="font-semibold">{label}</p>
        <p className="text-muted-foreground">
          {detail}{" "}
          {!ok && href && <Link href={href} className="font-semibold text-primary underline">Fix</Link>}
        </p>
      </div>
    </li>
  );
}
