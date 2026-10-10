// Owner review screen opened from email links. Loading this page never changes anything; only the
// explicit Approve/Decline (or Publish/Decline) buttons send a POST that uses the single-use link.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActionPreview } from "@shared/api";
import { getService } from "@shared/domain";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, LiveRegion } from "@/components/forms/field";
import { api, ApiError, tokenFromHash } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { formatDateLong, formatDuration, formatMoney, formatTime, propertyLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const OUTCOME_TEXT: Record<string, { tone: "success" | "info" | "error"; text: string }> = {
  confirmed: { tone: "success", text: "Approved. The appointment is on your Google Calendar and the customer has been sent a confirmation." },
  processing: { tone: "info", text: "Approval recorded. The calendar event is still being created; the customer will be confirmed as soon as it succeeds. Check the dashboard for status." },
  conflict: { tone: "error", text: "Not confirmed: Google Calendar now shows another commitment at this time. Decline it with a note, or clear the conflict and approve again from the dashboard." },
  calendar_disconnected: { tone: "error", text: "Not confirmed: Google Calendar is not connected. Reconnect it in the dashboard, then approve again." },
  rejected: { tone: "success", text: "Declined. The time was released and the customer has been notified." },
  approved: { tone: "success", text: "Review published on the website." },
  declined: { tone: "success", text: "Review declined. It will not be published." },
};

const ERROR_TEXT: Record<string, string> = {
  token_used: "This link was already used. Open the dashboard to see the current status.",
  expired_link: "This link has expired. Open the dashboard to review the request.",
  invalid_link: "This link isn't valid.",
  stale_version: "This request changed after the email was sent (for example, the customer picked a new time). Use the newest email or the dashboard.",
  not_pending: "This request has already been decided.",
  start_passed: "The requested start time has already passed, so this request can no longer be approved. Decline it or contact the customer.",
  calendar_disconnected: "Google Calendar is not connected, so nothing was changed. Reconnect it in the dashboard and try again — this link still works.",
  calendar_operation_in_progress: "A calendar operation is still being resolved. Try again in a minute.",
  already_moderated: "This review was already moderated.",
};

export default function ActionPage() {
  usePageMeta({ title: "Review request", description: "Owner review screen", path: "/action", noindex: true });
  const [token, setToken] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(tokenFromHash()), []);

  const query = useQuery({
    queryKey: ["action-preview", token],
    queryFn: () => api<ActionPreview>("/api/actions", { token: token! }),
    enabled: !!token,
    retry: false,
  });
  const preview = query.data;

  const act = async (action: "approve" | "reject" | "publish" | "decline") => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ outcome: string }>("/api/actions", {
        token,
        body: { action, version: preview?.booking?.version, reason: action === "reject" && reason.trim() ? reason.trim() : undefined },
      });
      setOutcome(res.outcome);
    } catch (e) {
      if (e instanceof ApiError) setError(ERROR_TEXT[e.code] ?? (e.isNetwork ? "Network error — nothing may have been sent. Try again." : "Something went wrong. Try again or use the dashboard."));
      else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  let content: React.ReactNode;
  if (token === null || (token && query.isPending)) {
    content = <LiveRegion className="text-muted-foreground">Loading…</LiveRegion>;
  } else if (!token) {
    content = <Message tone="error">Open this page from the link in your notification email.</Message>;
  } else if (query.isError) {
    const code = query.error instanceof ApiError ? query.error.code : "";
    content = <Message tone="error">{ERROR_TEXT[code] ?? "We couldn't load this request."}</Message>;
  } else if (preview) {
    const done = outcome ? OUTCOME_TEXT[outcome] ?? { tone: "info" as const, text: `Status: ${outcome}` } : null;
    const stateNote =
      preview.state === "used" ? "This link was already used."
      : preview.state === "expired" ? "This link has expired."
      : preview.state === "stale" ? "This request has changed or was already decided since this email was sent."
      : null;
    const actionable = preview.state === "ready" && !outcome;

    content = (
      <div className="space-y-6">
        {preview.booking && (
          <section aria-labelledby="req-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 id="req-heading" className="font-sans text-xl font-semibold">Booking request {preview.booking.reference}</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Requested time" wide>
                {formatDateLong(preview.booking.start, preview.booking.timezone, "en")}, {formatTime(preview.booking.start, preview.booking.timezone, "en")}–{formatTime(preview.booking.end, preview.booking.timezone, "en", true)}
              </Row>
              <Row label="Service">{getService(preview.booking.serviceId)?.name.en} — {propertyLabel(preview.booking.property, "en")}</Row>
              <Row label="Estimate">{formatMoney(preview.booking.estimateCents, "en")} · {formatDuration(Math.round((Date.parse(preview.booking.end) - Date.parse(preview.booking.start)) / 60000), "en")}</Row>
              <Row label="Customer">{preview.booking.customerName}</Row>
              <Row label="Contact">
                <a className="text-primary underline" href={`tel:${preview.booking.phone}`}>{preview.booking.phone}</a>
                {" · "}
                <a className="break-all text-primary underline" href={`mailto:${preview.booking.email}`}>{preview.booking.email}</a>
              </Row>
              <Row label="Address" wide>{preview.booking.address}</Row>
              {preview.booking.notes && <Row label="Notes" wide>{preview.booking.notes}</Row>}
              <Row label="Status">{preview.booking.status.replace("_", " ")} · calendar {preview.booking.calendarStatus.replace("_", " ")}</Row>
            </dl>
          </section>
        )}
        {preview.review && (
          <section aria-labelledby="rev-heading" className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
            <h2 id="rev-heading" className="font-sans text-xl font-semibold">Review from {preview.review.name}</h2>
            <p className="mt-2 font-semibold">{preview.review.rating} out of 5</p>
            <blockquote className="mt-3 whitespace-pre-wrap border-l-4 border-accent pl-4">{preview.review.body}</blockquote>
          </section>
        )}

        {stateNote && !outcome && <Message tone="info">{stateNote} <a className="underline" href="/admin">Open the dashboard</a>.</Message>}
        {done && <Message tone={done.tone}>{done.text}</Message>}
        {error && <Message tone="error">{error}</Message>}

        {actionable && preview.scope === "booking.decide" && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm text-muted-foreground">
              Approving re-checks your Google Calendar, creates the calendar event, and only then confirms the customer.
            </p>
            <Field label="Note to the customer if declining" optionalLabel="optional">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => act("approve")} disabled={busy}>{busy ? "Working…" : "Approve appointment"}</Button>
              <Button size="lg" variant="outline" onClick={() => act("reject")} disabled={busy}>Decline</Button>
            </div>
          </div>
        )}
        {actionable && preview.scope === "review.moderate" && (
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => act("publish")} disabled={busy}>Publish review</Button>
            <Button size="lg" variant="outline" onClick={() => act("decline")} disabled={busy}>Decline</Button>
          </div>
        )}
        <p className="text-sm"><a className="text-primary underline" href="/admin">Open the dashboard</a></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="container-page flex h-16 items-center"><Logo /></div>
      </header>
      <main id="main" className="container-page max-w-3xl py-10">
        <h1 className="mb-6 text-display-md">Review request</h1>
        {content}
      </main>
    </div>
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function Message({ tone, children }: { tone: "success" | "info" | "error"; children: React.ReactNode }) {
  const cls = tone === "success" ? "bg-success-soft text-success border-success/30" : tone === "error" ? "bg-destructive-soft text-destructive border-destructive/30" : "bg-primary-soft border-primary/20";
  return <LiveRegion assertive={tone === "error"} className={cn("rounded-lg border p-4 font-medium", cls)}>{children}</LiveRegion>;
}
