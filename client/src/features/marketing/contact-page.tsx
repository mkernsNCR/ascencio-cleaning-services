import { Link } from "wouter";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { useLocale, useMessages } from "@/i18n";
import { usePublicConfig } from "@/lib/queries";
import { usePageMeta } from "@/lib/seo";
import { ContactForm } from "./forms/contact-form";
import { ContactLinks } from "./shared/contact-links";

const en = {
  metaTitle: "Contact us",
  metaDescription:
    "Questions about home or specialty cleaning in Washington, DC, Maryland, or Virginia? Send a message, call, or email Ascencio Cleaning in English or Spanish.",
  eyebrow: "Contact",
  title: "Contact us",
  lead: "Have a question or need a quote for specialty cleaning? Send a message and we'll get back to you. We're happy to help in English or Spanish.",
  formTitle: "Send a message",
  directTitle: "Call or email",
  bookTitle: "Ready to book a home cleaning?",
  bookBody: "See open times and send a request online. The owner confirms every appointment by email.",
  book: "Check availability",
  commercialTitle: "Looking for commercial cleaning?",
  commercial: "Request a commercial quote",
};
const es: typeof en = {
  metaTitle: "Contacto",
  metaDescription:
    "¿Preguntas sobre limpieza del hogar o especializada en Washington, DC, Maryland o Virginia? Envíe un mensaje, llame o escriba a Ascencio Cleaning en inglés o español.",
  eyebrow: "Contacto",
  title: "Contáctenos",
  lead: "¿Tiene una pregunta o necesita una cotización para una limpieza especializada? Envíe un mensaje y le responderemos. Con gusto le atendemos en inglés o en español.",
  formTitle: "Envíe un mensaje",
  directTitle: "Llame o escriba",
  bookTitle: "¿Listo para reservar una limpieza del hogar?",
  bookBody: "Vea los horarios disponibles y envíe una solicitud en línea. El propietario confirma cada cita por correo electrónico.",
  book: "Ver disponibilidad",
  commercialTitle: "¿Busca limpieza comercial?",
  commercial: "Solicitar cotización comercial",
};
export const contactPageMessages = { en, es };

export default function ContactPage() {
  const t = useMessages(contactPageMessages);
  const { locale } = useLocale();
  const { data: config } = usePublicConfig();
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/contact" });
  const promise = config?.responsePromise?.[locale];

  return (
    <section className="bg-background">
      <div className="container-page grid gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <div>
          <p className="eyebrow mb-4">{t.eyebrow}</p>
          <h1 className="text-display-xl">{t.title}</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{t.lead}</p>
          {promise && <p className="mt-3 font-medium">{promise}</p>}

          <div className="mt-10 space-y-8">
            <div>
              <h2 className="text-xl font-semibold">{t.directTitle}</h2>
              <ContactLinks className="mt-2" />
            </div>
            <div className="rounded-xl bg-primary-soft p-6">
              <CalendarCheck aria-hidden="true" className="h-7 w-7 text-primary" />
              <h2 className="mt-3 text-xl font-semibold">{t.bookTitle}</h2>
              <p className="mt-1">{t.bookBody}</p>
              <Link href="/booking" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4 hover:no-underline">
                {t.book}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{t.commercialTitle}</h2>
              <Link href="/commercial" className="mt-1 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4 hover:no-underline">
                {t.commercial}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-soft sm:p-8 lg:self-start">
          <h2 className="text-display-md">{t.formTitle}</h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
