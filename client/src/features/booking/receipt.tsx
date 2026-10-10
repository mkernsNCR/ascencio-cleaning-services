import { useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import type { BookingReceipt } from "@shared/api";
import { getService } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/i18n";
import { formatDateLong, formatDuration, formatMoney, formatTime, timeZoneLabel } from "@/lib/format";
import { bookingMessages } from "./messages";

export function Receipt({ receipt, onAnother }: { receipt: BookingReceipt; onAnother: () => void }) {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const r = t.receipt;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const promise = receipt.responsePromise?.[locale];

  return (
    <section aria-labelledby="receipt-heading" className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-10">
      <p className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
        <Clock aria-hidden="true" className="h-4 w-4" />
        {r.pending}
      </p>
      <h2 id="receipt-heading" ref={headingRef} tabIndex={-1} className="mt-4 text-display-md focus:outline-none">{r.heading}</h2>
      <p className="mt-3 text-lg">{r.lead}</p>
      {promise && <p className="mt-2 text-muted-foreground">{promise}</p>}

      <dl className="mt-6 grid gap-4 rounded-xl bg-surface-sunken p-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">{r.reference}</dt>
          <dd className="font-mono text-lg font-semibold">{receipt.reference}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t.summary.service}</dt>
          <dd className="font-semibold">{getService(receipt.serviceId)?.name[locale]}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-muted-foreground">{r.requested}</dt>
          <dd className="font-semibold">
            {formatDateLong(receipt.start, receipt.timezone, locale)}, {formatTime(receipt.start, receipt.timezone, locale)} ({timeZoneLabel(receipt.timezone, locale)})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t.summary.duration}</dt>
          <dd className="font-semibold">{formatDuration(receipt.durationMinutes, locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t.summary.estimate}</dt>
          <dd className="font-semibold">{receipt.estimateCents != null ? formatMoney(receipt.estimateCents, locale) : t.service.pricePending}</dd>
        </div>
      </dl>

      <h3 className="mt-8 font-sans text-lg font-semibold">{r.next}</h3>
      <ol className="mt-3 space-y-2">
        {r.nextSteps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <a href={receipt.manageUrl}>{r.manage}</a>
        </Button>
        <Button variant="outline" size="lg" onClick={onAnother}>{r.another}</Button>
      </div>
    </section>
  );
}
