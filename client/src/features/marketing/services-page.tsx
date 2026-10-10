import { Link } from "wouter";
import { Info } from "lucide-react";
import { SERVICE_CATALOG, type ServiceDefinition } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { CtaBand } from "./shared/cta-band";
import { marketingMessages } from "./shared/messages";
import { PageIntro, SectionHeading } from "./shared/page-intro";
import { ModeBadge, PriceLine, ServiceList, serviceActionHref, serviceDetailHref } from "./shared/service-helpers";

const en = {
  metaTitle: "Cleaning services",
  metaDescription:
    "Compare standard, deep, and move-in/move-out home cleaning, plus post-construction and commercial cleaning by quote, in Washington, DC, Maryland, and Virginia.",
  eyebrow: "Services",
  title: "Cleaning services, side by side",
  lead: "See what each service includes and what it doesn't. Home services can be requested online; specialty and commercial work starts with a quote.",
  residentialTitle: "Home cleaning",
  residentialIntro: "Request a time online. Each service builds on the one before it.",
  quoteTitle: "Specialty and commercial cleaning",
  quoteIntro: "These jobs vary in size and scope, so we talk with you first and prepare a quote.",
  estimatesTitle: "How estimates work",
  estimatesBody: [
    "Home cleaning estimates are based on the number of bedrooms and bathrooms you select in the booking form.",
    "Your estimate is shown during booking and confirmed by our team before service. If the home's condition or size differs from what was described, we'll talk with you before making any change.",
  ],
  requestQuoteCommercial: "Request a commercial quote",
};
const es: typeof en = {
  metaTitle: "Servicios de limpieza",
  metaDescription:
    "Compare la limpieza estándar, profunda y de mudanza para hogares, y la limpieza post-construcción y comercial por cotización, en Washington, DC, Maryland y Virginia.",
  eyebrow: "Servicios",
  title: "Servicios de limpieza, uno al lado del otro",
  lead: "Vea qué incluye cada servicio y qué no. Los servicios para el hogar se pueden solicitar en línea; los trabajos especializados y comerciales comienzan con una cotización.",
  residentialTitle: "Limpieza del hogar",
  residentialIntro: "Solicite un horario en línea. Cada servicio es más completo que el anterior.",
  quoteTitle: "Limpieza especializada y comercial",
  quoteIntro: "Estos trabajos varían en tamaño y alcance, por eso primero hablamos con usted y preparamos una cotización.",
  estimatesTitle: "Cómo funcionan los estimados",
  estimatesBody: [
    "Los estimados de limpieza del hogar se basan en la cantidad de dormitorios y baños que seleccione en el formulario de reservación.",
    "Su estimado se muestra durante la reservación y nuestro equipo lo confirma antes del servicio. Si el estado o el tamaño de la vivienda es diferente a lo descrito, hablaremos con usted antes de hacer cualquier cambio.",
  ],
  requestQuoteCommercial: "Solicitar cotización comercial",
};
export const servicesPageMessages = { en, es };

function ServiceRow({ service, index }: { service: ServiceDefinition; index: number }) {
  const { locale } = useLocale();
  const t = useMessages(servicesPageMessages);
  const m = useMessages(marketingMessages);
  const name = service.name[locale];
  const actionLabel =
    service.mode === "bookable" ? m.cta.bookShort : service.id === "commercial" ? t.requestQuoteCommercial : m.cta.requestQuote;
  return (
    <article
      aria-labelledby={`row-${service.id}`}
      className={cn("grid gap-8 py-10 lg:grid-cols-[1fr_1.4fr] lg:gap-12", index > 0 && "border-t border-border")}
    >
      <div>
        <ModeBadge service={service} />
        <h3 id={`row-${service.id}`} className="mt-3 text-display-md font-semibold">{name}</h3>
        <p className="mt-3 text-muted-foreground">{service.summary[locale]}</p>
        <PriceLine service={service} className="mt-4" />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <Button asChild variant={service.mode === "bookable" ? "default" : "outline"} className="whitespace-normal text-center">
            <Link href={serviceActionHref(service)} aria-label={service.mode === "bookable" ? m.cta.bookService(name) : undefined}>
              {actionLabel}
            </Link>
          </Button>
          <Link
            href={serviceDetailHref(service)}
            aria-label={m.cta.viewDetailsFor(name)}
            className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline underline-offset-4 hover:no-underline"
          >
            {m.cta.viewDetails}
          </Link>
        </div>
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em]">{m.lists.included}</h4>
          <ServiceList items={service.inclusions[locale]} kind="included" className="mt-3" />
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.08em]">{m.lists.excluded}</h4>
          <ServiceList items={service.exclusions[locale]} kind="excluded" className="mt-3 text-muted-foreground" />
        </div>
      </div>
    </article>
  );
}

export default function ServicesPage() {
  const t = useMessages(servicesPageMessages);
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/services" });
  const bookable = SERVICE_CATALOG.filter((s) => s.mode === "bookable");
  const quoted = SERVICE_CATALOG.filter((s) => s.mode === "quote_required");

  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

      <section aria-labelledby="residential-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <SectionHeading id="residential-title" title={t.residentialTitle} intro={t.residentialIntro} />
          <div className="mt-6">
            {bookable.map((s, i) => <ServiceRow key={s.id} service={s} index={i} />)}
          </div>
        </div>
      </section>

      <section aria-labelledby="estimates-title" className="bg-surface-sunken py-14 sm:py-16">
        <div className="container-page grid gap-6 md:grid-cols-[auto_1fr]">
          <Info aria-hidden="true" className="h-8 w-8 text-primary" />
          <div className="max-w-3xl">
            <h2 id="estimates-title" className="text-display-md">{t.estimatesTitle}</h2>
            {t.estimatesBody.map((p) => (
              <p key={p} className="mt-3 text-lg leading-8">{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="quoted-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <SectionHeading id="quoted-title" title={t.quoteTitle} intro={t.quoteIntro} />
          <div className="mt-6">
            {quoted.map((s, i) => <ServiceRow key={s.id} service={s} index={i} />)}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
