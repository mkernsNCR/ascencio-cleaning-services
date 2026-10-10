import { Building2, CalendarClock, Repeat, ListChecks } from "lucide-react";
import { getService } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { CommercialQuoteForm } from "./forms/commercial-quote-form";
import { ContactLinks } from "./shared/contact-links";
import { PageIntro, SectionHeading } from "./shared/page-intro";
import { ServiceList } from "./shared/service-helpers";

const en = {
  metaTitle: "Commercial cleaning",
  metaDescription:
    "Tailored commercial cleaning for offices, retail, and shared spaces in Washington, DC, Maryland, and Virginia. Request a quote built around your schedule.",
  eyebrow: "Commercial cleaning",
  title: "Cleaning tailored to your workplace",
  lead: "Every business runs differently. Tell us about your space, hours, and priorities, and we'll prepare a proposal that fits. Service in English and Spanish.",
  jump: "Request a commercial quote",
  whoTitle: "Who it's for",
  whoIntro: "Workplaces in Washington, DC, Maryland, and Virginia that want dependable, recurring cleaning.",
  who: ["Offices and professional suites", "Retail stores and showrooms", "Building lobbies, hallways, and common areas", "Studios and small fitness spaces"],
  tailoredTitle: "What we tailor",
  tailored: [
    { title: "Schedule", body: "Early mornings, evenings, or weekends so cleaning doesn't interrupt your work." },
    { title: "Frequency", body: "Daily, weekly, every two weeks, monthly, or a one-time clean." },
    { title: "Scope", body: "The rooms, surfaces, and tasks that matter most, agreed with you in writing." },
  ],
  typicalTitle: "Typically included",
  limitsTitle: "Not included",
  processTitle: "How the quote process works",
  process: [
    { title: "Share the details", body: "Use the form below to tell us about your space, size, and the schedule you have in mind." },
    { title: "Talk through the scope", body: "We contact you at the time you prefer to ask questions, and may ask for photos or to see the space." },
    { title: "Receive a proposal", body: "You get a written proposal with the scope and schedule before any work begins." },
  ],
  formTitle: "Request a commercial quote",
  formIntro: "There's no obligation. We'll use these details only to prepare your quote.",
  altTitle: "Prefer to talk?",
  altBody: "Call or email us in English or Spanish.",
};
const es: typeof en = {
  metaTitle: "Limpieza comercial",
  metaDescription:
    "Limpieza comercial a la medida para oficinas, comercios y espacios compartidos en Washington, DC, Maryland y Virginia. Solicite una cotización según su horario.",
  eyebrow: "Limpieza comercial",
  title: "Limpieza a la medida de su lugar de trabajo",
  lead: "Cada negocio funciona de manera diferente. Cuéntenos sobre su espacio, su horario y sus prioridades, y le prepararemos una propuesta adecuada. Atención en inglés y español.",
  jump: "Solicitar cotización comercial",
  whoTitle: "Para quién es",
  whoIntro: "Lugares de trabajo en Washington, DC, Maryland y Virginia que buscan una limpieza recurrente y confiable.",
  who: ["Oficinas y consultorios profesionales", "Tiendas y salas de exhibición", "Vestíbulos, pasillos y áreas comunes de edificios", "Estudios y gimnasios pequeños"],
  tailoredTitle: "Lo que adaptamos",
  tailored: [
    { title: "Horario", body: "Temprano en la mañana, por la noche o los fines de semana, para no interrumpir su trabajo." },
    { title: "Frecuencia", body: "Diaria, semanal, cada dos semanas, mensual o una sola vez." },
    { title: "Alcance", body: "Las áreas, superficies y tareas más importantes para usted, acordadas por escrito." },
  ],
  typicalTitle: "Normalmente incluye",
  limitsTitle: "No incluye",
  processTitle: "Cómo funciona la cotización",
  process: [
    { title: "Comparta los detalles", body: "Use el formulario de abajo para contarnos sobre su espacio, su tamaño y el horario que tiene en mente." },
    { title: "Hablemos del alcance", body: "Nos comunicamos con usted en el horario que prefiera para hacerle preguntas, y podemos pedirle fotos o ver el espacio." },
    { title: "Reciba una propuesta", body: "Usted recibe una propuesta por escrito con el alcance y el horario antes de comenzar cualquier trabajo." },
  ],
  formTitle: "Solicitar cotización comercial",
  formIntro: "Sin compromiso. Usaremos estos datos solo para preparar su cotización.",
  altTitle: "¿Prefiere hablar?",
  altBody: "Llámenos o escríbanos en inglés o en español.",
};
export const commercialPageMessages = { en, es };

const TAILORED_ICONS = [CalendarClock, Repeat, ListChecks];

export default function CommercialPage() {
  const t = useMessages(commercialPageMessages);
  const { locale } = useLocale();
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/commercial" });
  const commercial = getService("commercial")!;

  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title} lead={t.lead}>
        <Button asChild size="lg" className="whitespace-normal text-center">
          <a href="#quote">{t.jump}</a>
        </Button>
      </PageIntro>

      <section aria-labelledby="who-title" className="bg-background py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading id="who-title" title={t.whoTitle} intro={t.whoIntro} />
            <ul className="mt-8 space-y-3">
              {t.who.map((w) => (
                <li key={w} className="flex items-center gap-3 text-lg">
                  <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-6 rounded-xl bg-surface-sunken p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <h3 className="text-xl font-semibold">{t.typicalTitle}</h3>
              <ServiceList items={commercial.inclusions[locale]} kind="included" className="mt-4" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{t.limitsTitle}</h3>
              <ServiceList items={commercial.exclusions[locale]} kind="excluded" className="mt-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="tailored-title" className="border-y border-border bg-surface py-14 sm:py-20">
        <div className="container-page">
          <SectionHeading id="tailored-title" title={t.tailoredTitle} />
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {t.tailored.map((item, i) => {
              const Icon = TAILORED_ICONS[i];
              return (
                <div key={item.title}>
                  <Icon aria-hidden="true" className="h-8 w-8 text-primary" />
                  <h3 className="mt-4 text-2xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-muted-foreground">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="process-title" className="bg-background py-14 sm:py-20">
        <div className="container-page">
          <SectionHeading id="process-title" title={t.processTitle} />
          <ol className="ml-5 mt-10 max-w-3xl space-y-8 border-l-2 border-accent pl-8">
            {t.process.map((step, i) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[3.15rem] flex h-9 w-9 items-center justify-center rounded-full bg-primary font-display font-semibold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <h3 className="text-xl font-semibold">
                  <span className="sr-only">{`${i + 1}. `}</span>
                  {step.title}
                </h3>
                <p className="mt-1 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="quote" aria-labelledby="quote-title" className="scroll-mt-24 bg-surface-sunken py-14 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <h2 id="quote-title" className="text-display-lg">{t.formTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">{t.formIntro}</p>
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="text-xl font-semibold">{t.altTitle}</h3>
              <p className="mt-1 text-muted-foreground">{t.altBody}</p>
              <ContactLinks className="mt-3" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6 shadow-soft sm:p-8">
            <CommercialQuoteForm />
          </div>
        </div>
      </section>

    </>
  );
}
