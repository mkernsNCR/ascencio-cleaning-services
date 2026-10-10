import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/forms/field";
import { adminKeys, errorMessage, useAdmin, useBusinessTimezone } from "./admin-api";
import { discrepancyInfo, fmtDateTime, mailStatusInfo, relative } from "./admin-format";
import type { Discrepancy, Job, OutboxItem } from "./types";
import { Card, ConfirmDialog, Empty, Notice, Pill, PageHeader, QueryState, tableCls } from "./ui";

export default function AttentionPage() {
  const tz = useBusinessTimezone();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 300);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <PageHeader
        title="Needs attention"
        description={<>Calendar discrepancies, failed emails, and stuck background jobs. Times shown in {tz}.</>}
      />
      <LiveRegion className="empty:hidden">
        {status && <Notice tone={status.tone} className="mb-6">{status.text}</Notice>}
      </LiveRegion>
      <div className="flex flex-col gap-8">
        <Discrepancies onStatus={setStatus} />
        <FailedEmail onStatus={setStatus} />
        <Jobs onStatus={setStatus} />
      </div>
    </>
  );
}

type OnStatus = (s: { tone: "success" | "danger"; text: string }) => void;

function useRetryAction(onStatus: OnStatus, invalidate: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  const { post } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, path: string, success: string) => {
    setBusy(key);
    try {
      await post(path);
      onStatus({ tone: "success", text: success });
    } catch (e) {
      onStatus({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
      await Promise.all([...invalidate, adminKeys.overview].map((k) => qc.invalidateQueries({ queryKey: k })));
    }
  };
  return { busy, run };
}

function Discrepancies({ onStatus }: { onStatus: OnStatus }) {
  const tz = useBusinessTimezone();
  const { get, post } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: adminKeys.discrepancies, queryFn: () => get<Discrepancy[]>("/api/admin/discrepancies") });
  const [resolving, setResolving] = useState<Discrepancy | null>(null);

  return (
    <section id="discrepancies" aria-labelledby="disc-h" className="scroll-mt-6">
      <Card
        title={<span id="disc-h">Calendar discrepancies</span>}
        description="Differences between Google Calendar and the booking system. Customer bookings were NOT changed automatically — review each one, take any action with the customer or in Google Calendar, then mark it resolved."
      >
        <QueryState query={q}>
          {(rows) => rows.length === 0 ? <Empty>No unresolved discrepancies.</Empty> : (
            <ul className="flex flex-col gap-3">
              {rows.map((d) => {
                const info = discrepancyInfo[d.kind] ?? { title: d.kind, explain: "" };
                return (
                  <li key={d.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-3xl">
                        <h3 className="font-sans font-semibold">{info.title}</h3>
                        <p className="text-sm">{info.explain}</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {d.bookingId && d.reference ? <>Booking <Link href={`/bookings/${d.bookingId}`} className="font-semibold text-primary underline">{d.reference}</Link>{d.startAt ? ` (appointment ${fmtDateTime(d.startAt, tz)})` : ""} · </> : "No linked booking · "}
                          Flagged {fmtDateTime(d.createdAt, tz)}
                        </p>
                        {Object.keys(d.details ?? {}).length > 0 && (
                          <details className="mt-2 text-sm">
                            <summary className="cursor-pointer font-semibold text-primary">Technical details</summary>
                            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 font-mono text-xs">
                              {Object.entries(d.details).map(([k, v]) => (
                                <div key={k} className="contents"><dt>{k}</dt><dd className="break-all">{typeof v === "string" ? v : JSON.stringify(v)}</dd></div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </div>
                      <Button variant="outline" onClick={() => setResolving(d)} aria-label={`Mark resolved: ${info.title}${d.reference ? ` for ${d.reference}` : ""}`}>Mark resolved</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </Card>
      <ConfirmDialog
        open={!!resolving}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Mark this discrepancy resolved?"
        description="Only do this after you've dealt with it. Resolving does not change the booking or the calendar."
        confirmLabel="Mark resolved"
        onConfirm={async () => {
          if (!resolving) return;
          try {
            await post(`/api/admin/discrepancies/${resolving.id}/resolve`);
            onStatus({ tone: "success", text: "Discrepancy marked resolved." });
          } finally {
            await qc.invalidateQueries({ queryKey: adminKeys.discrepancies });
            await qc.invalidateQueries({ queryKey: adminKeys.overview });
          }
        }}
      />
    </section>
  );
}

function FailedEmail({ onStatus }: { onStatus: OnStatus }) {
  const localZone = useBusinessTimezone();
  const { get } = useAdmin();
  const q = useQuery({ queryKey: adminKeys.outbox, queryFn: () => get<OutboxItem[]>("/api/admin/outbox") });
  const { busy, run } = useRetryAction(onStatus, [adminKeys.outbox, adminKeys.bookingAll]);

  return (
    <section id="email" aria-labelledby="email-h" className="scroll-mt-6">
      <Card
        title={<span id="email-h">Failed email</span>}
        description="“Failed” messages retry automatically; “gave up” (dead) messages stopped after too many attempts. Retrying re-queues the same message; a message the server already accepted could be delivered twice after an ambiguous timeout."
      >
        <QueryState query={q}>
          {(rows) => rows.length === 0 ? <Empty>No failed email.</Empty> : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table}>
                <caption className="sr-only">Failed and dead email messages</caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableCls.th}>Message</th>
                    <th scope="col" className={tableCls.th}>Recipient</th>
                    <th scope="col" className={tableCls.th}>Status</th>
                    <th scope="col" className={tableCls.th}>Last error</th>
                    <th scope="col" className={tableCls.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const info = mailStatusInfo[m.status] ?? { label: m.status, tone: "neutral" as const };
                    return (
                      <tr key={m.id}>
                        <th scope="row" className={`${tableCls.td} font-normal`}>
                          <span className="font-semibold">{m.subject}</span>
                          <br /><span className="text-muted-foreground">{m.type} · created {fmtDateTime(m.createdAt, localZone)}</span>
                          {m.bookingId && <><br /><Link href={`/bookings/${m.bookingId}`} className="text-primary underline">View booking</Link></>}
                        </th>
                        <td className={`${tableCls.td} break-all`}>{m.recipient}</td>
                        <td className={tableCls.td}>
                          <Pill tone={info.tone}>{info.label}</Pill>
                          <p className="mt-1 text-xs text-muted-foreground">{m.attempts} attempts{m.status === "failed" ? ` · next ${relative(m.nextAttemptAt)}` : ""}</p>
                        </td>
                        <td className={`${tableCls.td} max-w-xs break-words text-destructive`}>{m.lastError ?? "—"}</td>
                        <td className={tableCls.td}>
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(`m${m.id}`, `/api/admin/outbox/${m.id}/retry`, `Email to ${m.recipient} re-queued.`)} aria-label={`Retry email "${m.subject}" to ${m.recipient}`}>
                            {busy === `m${m.id}` && <Loader2 aria-hidden="true" className="animate-spin" />} Retry
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>
    </section>
  );
}

const jobTone = { running: "info", failed: "warning", dead: "danger", queued: "info", succeeded: "success" } as const;
const jobLabel = { running: "Running", failed: "Failed (will retry)", dead: "Gave up", queued: "Queued", succeeded: "Succeeded" } as const;

function Jobs({ onStatus }: { onStatus: OnStatus }) {
  const localZone = useBusinessTimezone();
  const { get } = useAdmin();
  const q = useQuery({ queryKey: adminKeys.jobs, queryFn: () => get<Job[]>("/api/admin/jobs") });
  const { busy, run } = useRetryAction(onStatus, [adminKeys.jobs, adminKeys.bookingsAll, adminKeys.bookingAll]);

  return (
    <section id="jobs" aria-labelledby="jobs-h" className="scroll-mt-6">
      <Card
        title={<span id="jobs-h">Background jobs</span>}
        description="Calendar and maintenance work that failed, gave up, or is running now. Retrying resets the attempt count and runs the job again."
      >
        <QueryState query={q}>
          {(rows) => rows.length === 0 ? <Empty>No failed, dead, or running jobs.</Empty> : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table}>
                <caption className="sr-only">Background jobs needing attention</caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableCls.th}>Job</th>
                    <th scope="col" className={tableCls.th}>Status</th>
                    <th scope="col" className={tableCls.th}>Last error</th>
                    <th scope="col" className={tableCls.th}>Updated</th>
                    <th scope="col" className={tableCls.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const bookingId = typeof j.payload?.bookingId === "string" ? j.payload.bookingId : null;
                    return (
                      <tr key={j.id}>
                        <th scope="row" className={`${tableCls.td} font-normal`}>
                          <span className="font-semibold">{j.type}</span> <span className="text-muted-foreground">#{j.id}</span>
                          {bookingId && <><br /><Link href={`/bookings/${bookingId}`} className="text-primary underline">View booking</Link></>}
                        </th>
                        <td className={tableCls.td}>
                          <Pill tone={jobTone[j.status]}>{jobLabel[j.status]}</Pill>
                          <p className="mt-1 text-xs text-muted-foreground">{j.attempts}/{j.maxAttempts} attempts{j.status === "failed" ? ` · next ${relative(j.runAt)}` : ""}</p>
                        </td>
                        <td className={`${tableCls.td} max-w-xs break-words text-destructive`}>{j.lastError ?? "—"}</td>
                        <td className={tableCls.td}>{fmtDateTime(j.updatedAt, localZone)}</td>
                        <td className={tableCls.td}>
                          {(j.status === "failed" || j.status === "dead") && (
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(`j${j.id}`, `/api/admin/jobs/${j.id}/retry`, `Job ${j.type} #${j.id} re-queued.`)} aria-label={`Retry job ${j.type} number ${j.id}`}>
                              {busy === `j${j.id}` && <Loader2 aria-hidden="true" className="animate-spin" />} Retry
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Card>
    </section>
  );
}
