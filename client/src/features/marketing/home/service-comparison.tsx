import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { getService, type ServiceDefinition } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { marketingMessages } from "../shared/messages";
import { SectionHeading } from "../shared/page-intro";
import { PriceLine, ServiceList, serviceActionHref, serviceDetailHref } from "../shared/service-helpers";

const en = {
  eyebrow: "Services",
  title: "Choose the clean that fits",
  intro: "Three home services, each building on the last. Your estimate is based on bedrooms and bathrooms and confirmed before service.",
  bestFor: {
    standard: "Best for regular upkeep",
    deep: "Best for a thorough reset",
    move: "Best for empty homes",
  } as Record<string, string>,
  specialtyEyebrow: "Specialty",
  specialtyBody: "Renovation cleanups vary widely, so we scope each one before giving a price.",
};
const es: typeof en = {
  eyebrow: "Servicios",
  title: "Elija la limpieza que le conviene",
  intro: "Tres servicios para el hogar, cada uno más completo que el anterior. Su estimado se basa en dormitorios y baños, y se confirma antes del servicio.",
  bestFor: {
    standard: "Ideal para el mantenimiento regular",
    deep: "Ideal para una limpieza a fondo",
    move: "Ideal para viviendas vacías",
  },
  specialtyEyebrow: "Especializado",
  specialtyBody: "Las limpiezas después de una remodelación varían mucho, por eso evaluamos cada una antes de dar un precio.",
};
export const serviceComparisonMessages = { en, es };

const RESIDENTIAL = ["standard", "deep", "move"].map((id) => getService(id)!) as ServiceDefinition[];
const SPECIALTY = getService("post_construction")!;

export function ServiceComparison() {
  const t = useMessages(serviceComparisonMessages);
  const m = useMessages(marketingMessages);
  const { locale } = useLocale();

  return (
    <section id="services" aria-labelledby="services-title" className="scroll-mt-24 bg-background py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading id="services-title" eyebrow={t.eyebrow} title={t.title} intro={t.intro} />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {RESIDENTIAL.map((s, i) => (
            <article
              key={s.id}
              aria-labelledby={`svc-${s.id}`}
              className={cn(
                "flex flex-col rounded-xl border bg-surface p-6 sm:p-8",
                i === 1 ? "border-primary shadow-lift" : "border-border shadow-soft",
              )}
            >
              <p className="text-sm font-semibold text-primary">{t.bestFor[s.id]}</p>
              <h3 id={`svc-${s.id}`} className="mt-2 text-2xl font-semibold">{s.name[locale]}</h3>
              <p className="mt-3 text-muted-foreground">{s.summary[locale]}</p>
              <PriceLine service={s} className="mt-4" />
              <h4 className="mt-6 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">{m.lists.included}</h4>
              <ServiceList items={s.inclusions[locale]} kind="included" className="mt-3 text-[0.95rem]" />
              <div className="mt-auto flex flex-col gap-2 pt-8">
                <Button asChild className="whitespace-normal text-center">
                  <Link href={serviceActionHref(s)} aria-label={m.cta.bookService(s.name[locale])}>
                    {m.cta.bookShort}
                  </Link>
                </Button>
                <Link
                  href={serviceDetailHref(s)}
                  aria-label={m.cta.viewDetailsFor(s.name[locale])}
                  className="inline-flex min-h-11 items-center justify-center rounded-md text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline"
                >
                  {m.cta.viewDetails}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <article
          aria-labelledby="svc-specialty"
          className="mt-8 grid gap-6 rounded-xl border border-dashed border-input bg-surface-sunken p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center"
        >
          <div>
            <p className="text-sm font-semibold text-primary">{t.specialtyEyebrow}</p>
            <h3 id="svc-specialty" className="mt-1 text-2xl font-semibold">{SPECIALTY.name[locale]}</h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {SPECIALTY.summary[locale]} {t.specialtyBody}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <Button asChild variant="outline" className="whitespace-normal text-center">
              <Link href={serviceActionHref(SPECIALTY)}>{m.cta.requestQuote}</Link>
            </Button>
            <Link
              href={serviceDetailHref(SPECIALTY)}
              aria-label={m.cta.viewDetailsFor(SPECIALTY.name[locale])}
              className="inline-flex min-h-11 items-center justify-center rounded-md text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline"
            >
              {m.cta.viewDetails}
            </Link>
          </div>
        </article>

        <p className="mt-8">
          <Link href="/services" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4 hover:no-underline">
            {m.cta.allServices}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </p>
      </div>
    </section>
  );
}
