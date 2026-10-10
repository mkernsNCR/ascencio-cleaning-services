import { BadgeCheck, Languages } from "lucide-react";
import { VERIFIED_CREDENTIALS } from "@/content/site";
import { useLocale, useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { BookingSteps } from "./shared/booking-steps";
import { CtaBand } from "./shared/cta-band";
import { PageIntro, SectionHeading } from "./shared/page-intro";

const en = {
  metaTitle: "About us",
  metaDescription:
    "Ascencio Cleaning Services is a bilingual cleaning business serving homes and workplaces in Washington, DC, Maryland, and Virginia.",
  eyebrow: "About",
  title: "About Ascencio Cleaning",
  lead: "We're a local, bilingual cleaning business serving homes and workplaces in Washington, DC, Maryland, and Virginia. We keep things simple: clear scope, honest estimates, and a real person confirming every appointment.",
  approachTitle: "How we work",
  approach: [
    { title: "Clear scope before we start", body: "Every service lists what's included and what isn't, so you know what to expect before we arrive." },
    { title: "Honest estimates", body: "Home estimates are based on bedrooms and bathrooms and confirmed with you before service. If something differs on the day, we talk with you first." },
    { title: "A person confirms every booking", body: "Online requests are reviewed by the owner, not approved automatically, so your appointment fits the real schedule." },
    { title: "Easy changes", body: "Your confirmation email includes a link to reschedule or cancel online, within the cutoff described in our scheduling terms." },
  ],
  bilingualTitle: "Service in English and Spanish",
  bilingualBody: "You can browse this site, request appointments, and talk with us in English or Spanish. Your emails arrive in the language you choose.",
  schedulingTitle: "How scheduling works",
  credentialsTitle: "Credentials",
};
const es: typeof en = {
  metaTitle: "Nosotros",
  metaDescription:
    "Ascencio Cleaning Services es un negocio de limpieza bilingüe que atiende hogares y lugares de trabajo en Washington, DC, Maryland y Virginia.",
  eyebrow: "Nosotros",
  title: "Acerca de Ascencio Cleaning",
  lead: "Somos un negocio de limpieza local y bilingüe que atiende hogares y lugares de trabajo en Washington, DC, Maryland y Virginia. Lo mantenemos sencillo: alcance claro, estimados honestos y una persona real que confirma cada cita.",
  approachTitle: "Cómo trabajamos",
  approach: [
    { title: "Alcance claro antes de empezar", body: "Cada servicio indica qué incluye y qué no, para que sepa qué esperar antes de que lleguemos." },
    { title: "Estimados honestos", body: "Los estimados para el hogar se basan en dormitorios y baños, y se confirman con usted antes del servicio. Si algo es diferente ese día, primero hablamos con usted." },
    { title: "Una persona confirma cada reservación", body: "El propietario revisa las solicitudes en línea; no se aprueban automáticamente, para que su cita se ajuste al horario real." },
    { title: "Cambios sencillos", body: "Su correo de confirmación incluye un enlace para cambiar o cancelar en línea, dentro del plazo descrito en nuestros términos de programación." },
  ],
  bilingualTitle: "Atención en inglés y español",
  bilingualBody: "Puede navegar este sitio, solicitar citas y hablar con nosotros en inglés o en español. Sus correos llegan en el idioma que elija.",
  schedulingTitle: "Cómo funciona la programación",
  credentialsTitle: "Credenciales",
};
export const aboutMessages = { en, es };

export default function AboutPage() {
  const t = useMessages(aboutMessages);
  const { locale } = useLocale();
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/about" });

  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

      <section aria-labelledby="approach-title" className="bg-background py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <SectionHeading id="approach-title" title={t.approachTitle} />
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {t.approach.map((a) => (
              <div key={a.title} className="border-t-2 border-accent pt-4">
                <dt className="font-display text-xl font-semibold">{a.title}</dt>
                <dd className="mt-2 text-muted-foreground">{a.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="bilingual-title" className="bg-primary-soft py-14 sm:py-16">
        <div className="container-page grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-primary shadow-soft">
            <Languages className="h-8 w-8" />
          </span>
          <div className="max-w-3xl">
            <h2 id="bilingual-title" className="text-display-md">{t.bilingualTitle}</h2>
            <p className="mt-3 text-lg leading-8">{t.bilingualBody}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="scheduling-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <SectionHeading id="scheduling-title" title={t.schedulingTitle} />
          <BookingSteps className="mt-10" />
        </div>
      </section>

      {VERIFIED_CREDENTIALS.length > 0 && (
        <section aria-labelledby="credentials-title" className="border-t border-border bg-surface py-14 sm:py-16">
          <div className="container-page">
            <h2 id="credentials-title" className="text-display-md">{t.credentialsTitle}</h2>
            <ul className="mt-6 space-y-3">
              {VERIFIED_CREDENTIALS.map((c) => (
                <li key={c.en} className="flex items-start gap-3 text-lg">
                  <BadgeCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  {c[locale]}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  );
}
