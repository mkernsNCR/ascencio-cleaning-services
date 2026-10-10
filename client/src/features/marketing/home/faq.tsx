import type { ReactNode } from "react";
import { Link } from "wouter";
import { getService } from "@shared/domain";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useLocale, useMessages } from "@/i18n";
import { usePublicConfig } from "@/lib/queries";
import { SectionHeading } from "../shared/page-intro";

const en = {
  eyebrow: "Questions",
  title: "How the process works",
  booking: {
    q: "How does booking work?",
    a: "Choose a service, enter your home's size and ZIP code, and pick from the times that are open. Sending the form is a request, not a confirmed appointment. The owner reviews each request and you receive an email once it's confirmed.",
  },
  included: {
    q: "What's included in a standard cleaning, and what isn't?",
    intro: "Standard cleaning includes:",
    excludedIntro: "It doesn't include:",
    more: "Deep and move-in/move-out cleaning add more. Compare every service on the",
    moreLink: "services page",
  },
  changes: {
    q: "Can I reschedule or cancel?",
    withCutoff: (cancel: number, reschedule: number) =>
      cancel === reschedule
        ? `Yes. Your confirmation email includes a link to manage your appointment online. You can reschedule or cancel there up to ${cancel} hours before your appointment. After that, please call or email us.`
        : `Yes. Your confirmation email includes a link to manage your appointment online. You can reschedule there up to ${reschedule} hours before your appointment, and cancel up to ${cancel} hours before. After that, please call or email us.`,
    general: "Yes. Your confirmation email includes a link to manage your appointment online, where you can reschedule or cancel up to the cutoff shown in your email. After the cutoff, please call or email us.",
  },
  area: {
    q: "Where do you clean?",
    a: "We serve Washington, DC, and nearby communities in Maryland and Virginia. The booking form checks your ZIP code before showing times.",
  },
  language: {
    q: "Can I communicate in Spanish?",
    a: "Yes. You can use this website, book, and talk with us in English or Spanish. Use the language switch at the top of the page.",
  },
};
const es: typeof en = {
  eyebrow: "Preguntas",
  title: "Cómo funciona el proceso",
  booking: {
    q: "¿Cómo funciona la reservación?",
    a: "Elija un servicio, indique el tamaño de su hogar y su código postal, y escoja entre los horarios disponibles. Enviar el formulario es una solicitud, no una cita confirmada. El propietario revisa cada solicitud y usted recibe un correo electrónico cuando queda confirmada.",
  },
  included: {
    q: "¿Qué incluye la limpieza estándar y qué no?",
    intro: "La limpieza estándar incluye:",
    excludedIntro: "No incluye:",
    more: "La limpieza profunda y la de mudanza incluyen más. Compare todos los servicios en la",
    moreLink: "página de servicios",
  },
  changes: {
    q: "¿Puedo cambiar o cancelar mi cita?",
    withCutoff: (cancel: number, reschedule: number) =>
      cancel === reschedule
        ? `Sí. Su correo de confirmación incluye un enlace para administrar su cita en línea. Allí puede cambiarla o cancelarla hasta ${cancel} horas antes de la cita. Después de ese plazo, llámenos o escríbanos.`
        : `Sí. Su correo de confirmación incluye un enlace para administrar su cita en línea. Allí puede cambiarla hasta ${reschedule} horas antes de la cita y cancelarla hasta ${cancel} horas antes. Después de ese plazo, llámenos o escríbanos.`,
    general: "Sí. Su correo de confirmación incluye un enlace para administrar su cita en línea, donde puede cambiarla o cancelarla hasta el plazo indicado en el correo. Después de ese plazo, llámenos o escríbanos.",
  },
  area: {
    q: "¿Dónde ofrecen servicio?",
    a: "Servimos Washington, DC, y comunidades cercanas en Maryland y Virginia. El formulario de reservación verifica su código postal antes de mostrar horarios.",
  },
  language: {
    q: "¿Puedo comunicarme en español?",
    a: "Sí. Puede usar este sitio, reservar y hablar con nosotros en inglés o en español. Use el selector de idioma en la parte superior de la página.",
  },
};
export const faqMessages = { en, es };

function Item({ value, q, children }: { value: string; q: string; children: ReactNode }) {
  return (
    <AccordionItem value={value} className="border-border">
      <AccordionTrigger className="min-h-14 gap-4 text-left text-lg font-semibold">{q}</AccordionTrigger>
      <AccordionContent className="max-w-3xl text-base leading-7 text-foreground">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function Faq() {
  const t = useMessages(faqMessages);
  const { locale } = useLocale();
  const { data: config } = usePublicConfig();
  const standard = getService("standard")!;

  return (
    <section aria-labelledby="faq-title" className="bg-background py-16 sm:py-24">
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <SectionHeading id="faq-title" eyebrow={t.eyebrow} title={t.title} />
        <Accordion type="multiple" className="border-t border-border">
          <Item value="booking" q={t.booking.q}>
            <p>{t.booking.a}</p>
          </Item>
          <Item value="included" q={t.included.q}>
            <p>{t.included.intro}</p>
            <ul className="mb-3 mt-2 list-disc space-y-1 pl-6">
              {standard.inclusions[locale].map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p>{t.included.excludedIntro}</p>
            <ul className="mb-3 mt-2 list-disc space-y-1 pl-6">
              {standard.exclusions[locale].map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p>
              {t.included.more}{" "}
              <Link href="/services" className="font-semibold text-primary underline underline-offset-4 hover:no-underline">
                {t.included.moreLink}
              </Link>
              .
            </p>
          </Item>
          <Item value="changes" q={t.changes.q}>
            <p>{config ? t.changes.withCutoff(config.cancellationCutoffHours, config.rescheduleCutoffHours) : t.changes.general}</p>
          </Item>
          <Item value="area" q={t.area.q}>
            <p>{t.area.a}</p>
          </Item>
          <Item value="language" q={t.language.q}>
            <p>{t.language.a}</p>
          </Item>
        </Accordion>
      </div>
    </section>
  );
}
