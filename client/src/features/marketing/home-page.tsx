import { BUSINESS } from "@shared/business";
import { useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { CtaBand } from "./shared/cta-band";
import { CommercialFeature } from "./home/commercial-feature";
import { EvidenceStrip } from "./home/evidence-strip";
import { Faq } from "./home/faq";
import { Hero } from "./home/hero";
import { HowItWorks } from "./home/how-it-works";
import { ProjectEvidence } from "./home/project-evidence";
import { ServiceComparison } from "./home/service-comparison";
import { Testimonials } from "./home/testimonials";

const en = {
  metaTitle: "Ascencio Cleaning Services | Home and office cleaning in DC, MD, and VA",
  metaDescription:
    "Bilingual standard, deep, and move-in/move-out home cleaning plus tailored commercial cleaning in Washington, DC, Maryland, and Virginia. Check availability online.",
  finalTitle: "Ready for a cleaner space?",
  finalBody: "See open times and send a request in a few minutes. The owner confirms every appointment by email.",
};
const es: typeof en = {
  metaTitle: "Ascencio Cleaning Services | Limpieza de hogares y oficinas en DC, MD y VA",
  metaDescription:
    "Limpieza bilingüe estándar, profunda y de mudanza para hogares, y limpieza comercial a la medida en Washington, DC, Maryland y Virginia. Vea la disponibilidad en línea.",
  finalTitle: "¿Listo para un espacio más limpio?",
  finalBody: "Vea los horarios disponibles y envíe una solicitud en pocos minutos. El propietario confirma cada cita por correo electrónico.",
};
export const homeMessages = { en, es };

const BUSINESS_JSON_LD: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "Ascencio Cleaning Services",
  url: "/",
  telephone: BUSINESS.phoneE164,
  email: BUSINESS.email,
  areaServed: BUSINESS.areaServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  knowsLanguage: ["en", "es"],
};

export default function HomePage() {
  const t = useMessages(homeMessages);
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/", jsonLd: [BUSINESS_JSON_LD] });

  return (
    <>
      <Hero />
      <EvidenceStrip />
      <ServiceComparison />
      <HowItWorks />
      <ProjectEvidence />
      <CommercialFeature />
      <Testimonials />
      <Faq />
      <CtaBand id="contact" title={t.finalTitle} body={t.finalBody} />
    </>
  );
}
