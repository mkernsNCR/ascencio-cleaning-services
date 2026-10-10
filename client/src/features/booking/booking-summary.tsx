import type { EstimateResponse } from "@shared/api";
import { getService } from "@shared/domain";
import { useLocale, useMessages } from "@/i18n";
import { formatDuration, formatLocalDate, formatMoney, formatTime, propertyLabel, timeZoneLabel } from "@/lib/format";
import { bookingMessages } from "./messages";
import type { BookingDraft } from "./draft";

const BUSINESS_TZ_FALLBACK = "America/New_York";

function SummaryList({ draft, estimate, timezone }: { draft: BookingDraft; estimate?: EstimateResponse; timezone: string }) {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const s = t.summary;
  const service = draft.serviceId ? getService(draft.serviceId) : undefined;
  const rows: [string, string][] = [
    [s.service, service ? service.name[locale] : s.notSelected],
    [s.home, propertyLabel(draft, locale)],
    [s.duration, estimate?.durationMinutes ? formatDuration(estimate.durationMinutes, locale) : "—"],
    [s.estimate, estimate?.estimateCents != null ? formatMoney(estimate.estimateCents, locale) : estimate ? t.service.pricePending : "—"],
    [s.date, draft.selection ? formatLocalDate(draft.selection.date, locale) : s.notSelected],
    [s.time, draft.selection ? formatTime(draft.selection.slot.start, timezone, locale, true) : s.notSelected],
    [s.timezone, timeZoneLabel(timezone, locale)],
    [s.status, s.statusValue],
  ];
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Persistent summary: sticky sidebar on desktop, collapsible panel on mobile. */
export function BookingSummary({ draft, estimate, timezone = BUSINESS_TZ_FALLBACK, variant }: { draft: BookingDraft; estimate?: EstimateResponse; timezone?: string; variant: "mobile" | "desktop" }) {
  const t = useMessages(bookingMessages);
  if (variant === "mobile") {
    return (
      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">{t.summary.toggle}</summary>
        <div className="px-4 pb-4">
          <SummaryList draft={draft} estimate={estimate} timezone={timezone} />
          {estimate && estimate.estimateCents != null && <p className="mt-2 text-xs text-muted-foreground">{t.service.estimateNote}</p>}
        </div>
      </details>
    );
  }
  return (
      <aside aria-labelledby="summary-heading" className="sticky top-28 rounded-xl border border-border bg-surface p-6 shadow-soft">
        <h2 id="summary-heading" className="mb-2 font-sans text-lg font-semibold">{t.summary.heading}</h2>
        <SummaryList draft={draft} estimate={estimate} timezone={timezone} />
        {estimate && estimate.estimateCents != null && <p className="mt-3 text-xs text-muted-foreground">{t.service.estimateNote}</p>}
      </aside>
  );
}
