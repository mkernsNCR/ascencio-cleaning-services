import { Link, useParams } from "wouter";
import { ChevronRight } from "lucide-react";
import { BUSINESS } from "@shared/business";
import { SERVICE_CATALOG, getServiceBySlug, type ServiceDefinition } from "@shared/domain";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import { useLocale, useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { BookingSteps } from "./shared/booking-steps";
import { ContactLinks } from "./shared/contact-links";
import { CtaBand } from "./shared/cta-band";
import { marketingMessages } from "./shared/messages";
import { ModeBadge, PriceLine, ServiceList, serviceActionHref, serviceDetailHref } from "./shared/service-helpers";

const en = {
  breadcrumb: "Breadcrumb",
  services: "Services",
  metaDescription: (name: string, summary: string) => `${name} in Washington, DC, Maryland, and Virginia. ${summary}`,
  bookableTitle: "How booking works",
  quoteTitle: "How quotes work",
  quoteSteps: [
    "Send us a short description of the space and what needs cleaning.",
    "We contact you to discuss the scope and may ask for photos or a visit.",
    "You receive a quote before any work is scheduled.",
  ],
  estimateNote:
    "Estimates are based on the number of bedrooms and bathrooms and are confirmed with you before service. If the home differs from what was described, we'll talk with you before making any change.",
  questions: "Questions first?",
  questionsBody: "Call or email us in English or Spanish.",
  otherServices: "Other services",
  requestCommercial: "Request a commercial quote",
  finalBookable: "See open times for this service",
  finalQuote: "Tell us about your project",
  finalQuoteBody: "Share a few details and we'll follow up to discuss the scope and prepare a quote.",
};
const es: typeof en = {
  breadcrumb: "Ruta de navegación",
  services: "Servicios",
  metaDescription: (name: string, summary: string) => `${name} en Washington, DC, Maryland y Virginia. ${summary}`,
  bookableTitle: "Cómo funciona la reservación",
  quoteTitle: "Cómo funcionan las cotizaciones",
  quoteSteps: [
    "Envíenos una breve descripción del espacio y de lo que necesita limpiar.",
    "Nos comunicamos con usted para hablar del alcance y podemos pedirle fotos o una visita.",
    "Usted recibe una cotización antes de programar cualquier trabajo.",
  ],
  estimateNote:
    "Los estimados se basan en la cantidad de dormitorios y baños, y se confirman con usted antes del servicio. Si la vivienda es diferente a lo descrito, hablaremos con usted antes de hacer cualquier cambio.",
  questions: "¿Tiene preguntas?",
  questionsBody: "Llámenos o escríbanos en inglés o en español.",
  otherServices: "Otros servicios",
  requestCommercial: "Solicitar cotización comercial",
  finalBookable: "Vea los horarios disponibles para este servicio",
  finalQuote: "Cuéntenos sobre su proyecto",
  finalQuoteBody: "Comparta algunos detalles y nos comunicaremos con usted para hablar del alcance y preparar una cotización.",
};
export const serviceDetailMessages = { en, es };

function ServiceDetail({ service }: { service: ServiceDefinition }) {
  const t = useMessages(serviceDetailMessages);
  const m = useMessages(marketingMessages);
  const { locale } = useLocale();
  const name = service.name[locale];
  const summary = service.summary[locale];
  const path = serviceDetailHref(service);
  const bookable = service.mode === "bookable";
  const actionLabel = bookable ? m.cta.checkAvailability : service.id === "commercial" ? t.requestCommercial : m.cta.requestQuote;

  usePageMeta({
    title: name,
    description: t.metaDescription(name, summary),
    path,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name,
        description: summary,
        serviceType: name,
        url: path,
        provider: {
          "@type": "HomeAndConstructionBusiness",
          name: "Ascencio Cleaning Services",
          telephone: BUSINESS.phoneE164,
        },
        areaServed: BUSINESS.areaServed.map((area) => ({ "@type": "AdministrativeArea", name: area })),
      },
    ],
  });

  const others = SERVICE_CATALOG.filter((s) => s.id !== service.id);

  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="container-page py-10 sm:py-16">
          <nav aria-label={t.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              <li className="flex items-center gap-1">
                <Link href="/services" className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline underline-offset-4 hover:no-underline">
                  {t.services}
                </Link>
                <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              </li>
              <li>
                <span aria-current="page" className="text-muted-foreground">{name}</span>
              </li>
            </ol>
          </nav>
          <div className="mt-4 max-w-3xl">
            <ModeBadge service={service} />
            <h1 className="mt-4 text-display-xl">{name}</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{summary}</p>
            <PriceLine service={service} className="mt-5 text-base" />
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="whitespace-normal text-center">
                <Link href={serviceActionHref(service)}>{actionLabel}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="scope-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <h2 id="scope-title" className="sr-only">{`${m.lists.included} / ${m.lists.excluded}`}</h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-6 shadow-soft sm:p-8">
              <h3 className="text-2xl font-semibold">{m.lists.included}</h3>
              <ServiceList items={service.inclusions[locale]} kind="included" className="mt-5 text-lg" />
            </div>
            <div className="rounded-xl bg-surface-sunken p-6 sm:p-8">
              <h3 className="text-2xl font-semibold">{m.lists.excluded}</h3>
              <ServiceList items={service.exclusions[locale]} kind="excluded" className="mt-5 text-lg" />
            </div>
          </div>
          {bookable && <p className="mt-8 max-w-3xl text-muted-foreground">{t.estimateNote}</p>}
        </div>
      </section>

      <section aria-labelledby="process-title" className="bg-surface-sunken py-14 sm:py-20">
        <div className="container-page">
          <h2 id="process-title" className="text-display-lg">{bookable ? t.bookableTitle : t.quoteTitle}</h2>
          {bookable ? (
            <BookingSteps className="mt-10" tone="sunken" />
          ) : (
            <ol className="mt-8 max-w-3xl space-y-4">
              {t.quoteSteps.map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface font-display text-lg font-semibold text-primary">
                    {i + 1}
                  </span>
                  <p className="pt-1.5 text-lg">{step}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-12 max-w-3xl border-t border-border pt-8">
            <h3 className="text-xl font-semibold">{t.questions}</h3>
            <p className="mt-1 text-muted-foreground">{t.questionsBody}</p>
            <ContactLinks className="mt-3" />
          </div>
        </div>
      </section>

      <section aria-labelledby="others-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <h2 id="others-title" className="text-display-md">{t.otherServices}</h2>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {others.map((s) => (
              <li key={s.id}>
                <Link
                  href={serviceDetailHref(s)}
                  className="group flex min-h-14 flex-col justify-center gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <span className="font-display text-xl font-semibold text-primary underline-offset-4 group-hover:underline">{s.name[locale]}</span>
                  <span className="text-sm text-muted-foreground sm:max-w-md sm:text-right">{s.summary[locale]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title={bookable ? t.finalBookable : t.finalQuote}
        body={bookable ? undefined : t.finalQuoteBody}
        href={serviceActionHref(service)}
        actionLabel={actionLabel}
      />
    </>
  );
}

export default function ServiceDetailPage() {
  const params = useParams<{ slug: string }>();
  const service = params.slug ? getServiceBySlug(params.slug) : undefined;
  if (!service) return <NotFound />;
  return <ServiceDetail key={service.id} service={service} />;
}
