import { Link } from "wouter";
import { MapPin, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { CtaBand } from "./shared/cta-band";
import { PageIntro } from "./shared/page-intro";

const en = {
  metaTitle: "Service areas",
  metaDescription:
    "Ascencio Cleaning serves homes and workplaces in Washington, DC, and nearby communities in Maryland and Virginia. The booking form checks your ZIP code.",
  eyebrow: "Service areas",
  title: "Where we clean",
  lead: "We serve homes and workplaces in Washington, DC, and nearby communities in Maryland and Virginia. Coverage depends on the exact location, so the booking form checks your ZIP code before showing times.",
  regions: [
    { name: "Washington, DC", body: "Homes, apartments, and workplaces in the District." },
    { name: "Maryland", body: "Communities in the Maryland suburbs near Washington, DC." },
    { name: "Virginia", body: "Communities in Northern Virginia near Washington, DC." },
  ],
  regionsTitle: "Our coverage",
  checkTitle: "How we check your location",
  checkBody: [
    "When you start a booking, you'll enter your ZIP code. If it's in our current service area, you'll see available times right away.",
    "If your ZIP code isn't covered online, you can still contact us. We'll tell you honestly whether we can help.",
  ],
  check: "Check your ZIP code",
  contact: "Contact us",
  finalTitle: "See if we serve your area",
  finalBody: "Start a booking request with your ZIP code. It only takes a moment.",
};
const es: typeof en = {
  metaTitle: "Áreas de servicio",
  metaDescription:
    "Ascencio Cleaning atiende hogares y lugares de trabajo en Washington, DC, y comunidades cercanas en Maryland y Virginia. El formulario de reservación verifica su código postal.",
  eyebrow: "Áreas de servicio",
  title: "Dónde ofrecemos servicio",
  lead: "Atendemos hogares y lugares de trabajo en Washington, DC, y comunidades cercanas en Maryland y Virginia. La cobertura depende de la ubicación exacta, por eso el formulario de reservación verifica su código postal antes de mostrar horarios.",
  regions: [
    { name: "Washington, DC", body: "Casas, apartamentos y lugares de trabajo en el Distrito." },
    { name: "Maryland", body: "Comunidades en los suburbios de Maryland cercanos a Washington, DC." },
    { name: "Virginia", body: "Comunidades del norte de Virginia cercanas a Washington, DC." },
  ],
  regionsTitle: "Nuestra cobertura",
  checkTitle: "Cómo verificamos su ubicación",
  checkBody: [
    "Al comenzar una reservación, ingresará su código postal. Si está dentro de nuestra área de servicio actual, verá los horarios disponibles de inmediato.",
    "Si su código postal no aparece cubierto en línea, igual puede contactarnos. Le diremos con honestidad si podemos ayudarle.",
  ],
  check: "Verificar su código postal",
  contact: "Contáctenos",
  finalTitle: "Vea si atendemos su zona",
  finalBody: "Comience una solicitud de reservación con su código postal. Solo toma un momento.",
};
export const serviceAreasMessages = { en, es };

export default function ServiceAreasPage() {
  const t = useMessages(serviceAreasMessages);
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/service-areas" });

  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

      <section aria-labelledby="regions-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <h2 id="regions-title" className="text-display-lg">{t.regionsTitle}</h2>
          <ul className="mt-10 grid gap-0 md:grid-cols-3 md:divide-x md:divide-border">
            {t.regions.map((r, i) => (
              <li key={r.name} className={i > 0 ? "border-t border-border py-6 md:border-t-0 md:px-8 md:py-0" : "pb-6 md:pb-0 md:pr-8"}>
                <MapPin aria-hidden="true" className="h-7 w-7 text-primary" />
                <h3 className="mt-3 text-2xl font-semibold">{r.name}</h3>
                <p className="mt-2 text-muted-foreground">{r.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="check-title" className="bg-surface-sunken py-14 sm:py-20">
        <div className="container-page grid gap-8 md:grid-cols-[auto_1fr]">
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-primary shadow-soft">
            <SearchCheck className="h-8 w-8" />
          </span>
          <div className="max-w-3xl">
            <h2 id="check-title" className="text-display-md">{t.checkTitle}</h2>
            {t.checkBody.map((p) => (
              <p key={p} className="mt-3 text-lg leading-8">{p}</p>
            ))}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="whitespace-normal text-center">
                <Link href="/booking">{t.check}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="whitespace-normal text-center">
                <Link href="/contact">{t.contact}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <CtaBand title={t.finalTitle} body={t.finalBody} />
    </>
  );
}
