import { Link } from "wouter";
import type { EstimateResponse } from "@shared/api";
import { PROPERTY_LIMITS, SERVICE_CATALOG, type ServiceId } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { formatDuration, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bookingMessages } from "./messages";
import type { BookingDraft } from "./draft";

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

export function ServiceStep({
  draft, update, estimate, estimateLoading, onContinue, postalError,
}: {
  draft: BookingDraft;
  update: (p: Partial<BookingDraft>) => void;
  estimate?: EstimateResponse;
  estimateLoading: boolean;
  onContinue: () => void;
  postalError: string | null;
}) {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const s = t.service;
  const common = useMessages(commonMessages);
  const bookable = SERVICE_CATALOG.filter((x) => x.mode === "bookable");
  const quoteOnly = SERVICE_CATALOG.filter((x) => x.mode === "quote_required");
  const canContinue = !!draft.serviceId && !!estimate && !estimate.quoteRequired && /^\d{5}$/.test(draft.postalCode.trim());

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold">{s.serviceLegend}</legend>
        <div className="grid gap-3">
          {bookable.map((svc) => {
            const checked = draft.serviceId === svc.id;
            return (
              <label
                key={svc.id}
                className={cn(
                  "flex cursor-pointer gap-4 rounded-xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  checked ? "border-primary shadow-soft" : "border-border hover:border-primary/60",
                )}
              >
                <input
                  type="radio"
                  name="service"
                  value={svc.id}
                  checked={checked}
                  onChange={() => update({ serviceId: svc.id as ServiceId })}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-semibold">{svc.name[locale]}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{svc.summary[locale]}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-input p-4">
          <p className="text-sm font-semibold">{s.quoteOnly}</p>
          <ul className="mt-2 space-y-2">
            {quoteOnly.map((svc) => (
              <li key={svc.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{svc.name[locale]}</span>
                <Link
                  href={svc.audience === "commercial" ? "/commercial" : `/contact?service=${svc.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                >
                  {svc.audience === "commercial" ? s.quoteLinkCommercial : s.quoteLinkContact}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-semibold">{s.propertyLegend}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={s.bedrooms}>
            <select
              value={draft.bedrooms}
              onChange={(e) => update({ bedrooms: Number(e.target.value) })}
              className="min-h-11 w-full rounded-md border-2 border-input bg-surface px-3 text-base"
            >
              {range(PROPERTY_LIMITS.minBedrooms, PROPERTY_LIMITS.maxBedrooms).map((n) => (
                <option key={n} value={n}>{n === 0 ? s.studio : n === PROPERTY_LIMITS.maxBedrooms ? `${n}+` : n}</option>
              ))}
            </select>
          </Field>
          <Field label={s.bathrooms}>
            <select
              value={draft.bathrooms}
              onChange={(e) => update({ bathrooms: Number(e.target.value) })}
              className="min-h-11 w-full rounded-md border-2 border-input bg-surface px-3 text-base"
            >
              {range(PROPERTY_LIMITS.minBathrooms, PROPERTY_LIMITS.maxBathrooms).map((n) => (
                <option key={n} value={n}>{n === PROPERTY_LIMITS.maxBathrooms ? `${n}+` : n}</option>
              ))}
            </select>
          </Field>
          <Field label={s.postalCode} error={postalError}>
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={10}
              value={draft.postalCode}
              onChange={(e) => update({ postalCode: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">{s.postalHint}</p>
      </fieldset>

      <section aria-labelledby="estimate-heading" aria-live="polite" className="rounded-xl bg-primary-soft p-5">
        <h3 id="estimate-heading" className="font-sans text-base font-semibold">{s.estimateHeading}</h3>
        {!draft.serviceId ? (
          <p className="mt-1 text-sm">{s.chooseService}</p>
        ) : estimateLoading && !estimate ? (
          <p className="mt-1 text-sm">{s.estimateLoading}</p>
        ) : estimate?.quoteRequired ? (
          <p className="mt-1 text-sm">
            {s.tooLarge}{" "}
            <Link href={`/contact?service=${draft.serviceId}`} className="font-semibold text-primary underline">{s.quoteLinkContact}</Link>
          </p>
        ) : estimate ? (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{s.duration}</dt>
              <dd className="text-lg font-semibold">{formatDuration(estimate.durationMinutes!, locale)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{s.price}</dt>
              <dd className={estimate.estimateCents != null ? "text-lg font-semibold" : "text-sm"}>
                {estimate.estimateCents != null ? formatMoney(estimate.estimateCents, locale) : s.pricePending}
              </dd>
            </div>
            {estimate.estimateCents != null && <p className="text-xs text-muted-foreground sm:col-span-2">{s.estimateNote}</p>}
          </dl>
        ) : null}
      </section>

      <div className="flex justify-end">
        <Button size="lg" onClick={onContinue} disabled={!canContinue}>{t.continue}</Button>
      </div>
      {!canContinue && draft.serviceId && draft.postalCode && !/^\d{5}$/.test(draft.postalCode.trim()) && (
        <p className="text-right text-sm text-destructive">{common.errors.invalid_postal_code}</p>
      )}
    </div>
  );
}
