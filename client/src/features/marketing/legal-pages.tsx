import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { BUSINESS } from "@shared/business";
import { useMessages } from "@/i18n";
import { usePublicConfig } from "@/lib/queries";
import { usePageMeta } from "@/lib/seo";

// DRAFT policy copy. Requires business and legal review before launch. Do not add legal entity
// details beyond BUSINESS.legalName without confirmation.

interface Section {
  title: string;
  paragraphs?: string[];
  list?: string[];
}

const draftEn = {
  label: "Draft — pending business and legal review",
  body: "This page is a working draft. It may change before it is finalized.",
};
const draftEs: typeof draftEn = {
  label: "Borrador — pendiente de revisión del negocio y revisión legal",
  body: "Esta página es un borrador de trabajo. Puede cambiar antes de su versión final.",
};
const draftMessages = { en: draftEn, es: draftEs };

function LegalLayout({ title, intro, sections, children }: { title: string; intro: string; sections: Section[]; children?: ReactNode }) {
  const d = useMessages(draftMessages);
  return (
    <article className="bg-background">
      <div className="container-page py-12 sm:py-16">
        <div role="note" className="flex max-w-prose gap-3 rounded-lg border-2 border-warning bg-warning-soft p-4 text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-warning">{d.label}</p>
            <p className="text-sm">{d.body}</p>
          </div>
        </div>
        <div className="prose-page mt-10">
          <h1 className="text-display-lg">{title}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
          {sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
              {s.list && (
                <ul>
                  {s.list.map((li) => <li key={li}>{li}</li>)}
                </ul>
              )}
            </section>
          ))}
          {children}
        </div>
      </div>
    </article>
  );
}

// --- Privacy ---------------------------------------------------------------------------------

const privacyEn = {
  metaTitle: "Privacy policy (draft)",
  metaDescription: "How Ascencio Cleaning Services collects, uses, and protects information submitted through its booking, contact, and review forms.",
  title: "Privacy policy",
  intro: `This policy explains what information ${BUSINESS.legalName} ("we") collects through this website, why we collect it, and the choices you have.`,
  sections: [
    {
      title: "Information we collect",
      paragraphs: ["We collect only the information you choose to send us through our forms:"],
      list: [
        "Booking requests: your name, email, phone number, service address and ZIP code, home size (bedrooms and bathrooms), chosen service and time, notes you add, and your preferred language.",
        "Contact and quote requests: your name, email, phone number, and any company name, type of space, approximate size, preferred frequency and contact time, ZIP code, and message you provide.",
        "Reviews: your name, email, rating, and review text. Your name, rating, and review text may be published after the owner reviews them. Your email is never published.",
      ],
    },
    {
      title: "How we use it",
      list: [
        "To review, schedule, confirm, reschedule, or cancel your appointment.",
        "To reply to your questions and prepare quotes.",
        "To send emails about your request or appointment, such as confirmations and reminders.",
        "To moderate and publish reviews.",
      ],
      paragraphs: ["We do not sell your personal information."],
    },
    {
      title: "Services that help us operate",
      paragraphs: [
        "We use Gmail (Google) to send and receive email about your requests, and Google Calendar to manage our schedule. When an appointment is confirmed, details needed to perform the service (such as the service, time, and address) are stored in our calendar.",
        "These providers process information on our behalf under their own terms and privacy policies.",
      ],
    },
    {
      title: "Analytics",
      paragraphs: [
        "We count anonymous events, such as when a booking request or quote request is submitted, to understand how the site is used. These events do not include your name, email, phone number, address, notes, or any appointment link.",
      ],
    },
    {
      title: "Appointment links",
      paragraphs: [
        "Emails about your appointment may include a private link that lets you view, reschedule, or cancel it. Please don't share that link with others.",
      ],
    },
    {
      title: "How long we keep information",
      paragraphs: [
        "We keep request and appointment records for as long as needed to provide our services, keep business records, and meet legal obligations, and then delete them.",
      ],
    },
    {
      title: "Your choices and deletion requests",
      paragraphs: [
        `To ask what information we have about you, correct it, or request that we delete it, email us at ${BUSINESS.email}. We may need to keep some records where required by law.`,
      ],
    },
    {
      title: "Changes to this policy",
      paragraphs: ["If we change this policy, we'll update this page."],
    },
  ] as Section[],
};
const privacyEs: typeof privacyEn = {
  metaTitle: "Política de privacidad (borrador)",
  metaDescription: "Cómo Ascencio Cleaning Services recopila, usa y protege la información enviada mediante sus formularios de reservación, contacto y reseñas.",
  title: "Política de privacidad",
  intro: `Esta política explica qué información recopila ${BUSINESS.legalName} ("nosotros") a través de este sitio web, por qué la recopilamos y qué opciones tiene usted.`,
  sections: [
    {
      title: "Información que recopilamos",
      paragraphs: ["Solo recopilamos la información que usted decide enviarnos mediante nuestros formularios:"],
      list: [
        "Solicitudes de reservación: su nombre, correo electrónico, teléfono, dirección y código postal del servicio, tamaño de la vivienda (dormitorios y baños), servicio y horario elegidos, notas que agregue y su idioma preferido.",
        "Solicitudes de contacto y cotización: su nombre, correo electrónico, teléfono y, si los proporciona, nombre de la empresa, tipo de espacio, tamaño aproximado, frecuencia y horario de contacto preferidos, código postal y mensaje.",
        "Reseñas: su nombre, correo electrónico, calificación y texto de la reseña. Su nombre, calificación y reseña pueden publicarse después de que el propietario los revise. Su correo electrónico nunca se publica.",
      ],
    },
    {
      title: "Cómo la usamos",
      list: [
        "Para revisar, programar, confirmar, cambiar o cancelar su cita.",
        "Para responder sus preguntas y preparar cotizaciones.",
        "Para enviarle correos sobre su solicitud o cita, como confirmaciones y recordatorios.",
        "Para moderar y publicar reseñas.",
      ],
      paragraphs: ["No vendemos su información personal."],
    },
    {
      title: "Servicios que nos ayudan a operar",
      paragraphs: [
        "Usamos Gmail (Google) para enviar y recibir correos sobre sus solicitudes, y Google Calendar para administrar nuestro horario. Cuando se confirma una cita, los datos necesarios para realizar el servicio (como el servicio, el horario y la dirección) se guardan en nuestro calendario.",
        "Estos proveedores procesan la información en nuestro nombre según sus propios términos y políticas de privacidad.",
      ],
    },
    {
      title: "Analítica",
      paragraphs: [
        "Contamos eventos anónimos, como cuando se envía una solicitud de reservación o de cotización, para entender cómo se usa el sitio. Estos eventos no incluyen su nombre, correo electrónico, teléfono, dirección, notas ni ningún enlace de su cita.",
      ],
    },
    {
      title: "Enlaces de su cita",
      paragraphs: [
        "Los correos sobre su cita pueden incluir un enlace privado para verla, cambiarla o cancelarla. Por favor, no comparta ese enlace con otras personas.",
      ],
    },
    {
      title: "Cuánto tiempo conservamos la información",
      paragraphs: [
        "Conservamos los registros de solicitudes y citas el tiempo necesario para prestar nuestros servicios, mantener registros del negocio y cumplir obligaciones legales, y luego los eliminamos.",
      ],
    },
    {
      title: "Sus opciones y solicitudes de eliminación",
      paragraphs: [
        `Para preguntar qué información tenemos sobre usted, corregirla o pedir que la eliminemos, escríbanos a ${BUSINESS.email}. Es posible que debamos conservar algunos registros cuando la ley lo exija.`,
      ],
    },
    {
      title: "Cambios a esta política",
      paragraphs: ["Si cambiamos esta política, actualizaremos esta página."],
    },
  ],
};
const privacyMessages = { en: privacyEn, es: privacyEs };

export function PrivacyPage() {
  const t = useMessages(privacyMessages);
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/privacy" });
  return <LegalLayout title={t.title} intro={t.intro} sections={t.sections} />;
}

// --- Terms -----------------------------------------------------------------------------------

const termsEn = {
  metaTitle: "Scheduling terms (draft)",
  metaDescription: "How appointment requests, estimates, rescheduling, and cancellations work with Ascencio Cleaning Services.",
  title: "Scheduling terms",
  intro: `These terms describe how appointments with ${BUSINESS.legalName} are requested, confirmed, and changed.`,
  cutoffBoth: (cancel: number, reschedule: number) =>
    cancel === reschedule
      ? `You can reschedule or cancel online up to ${cancel} hours before your appointment's start time.`
      : `You can reschedule online up to ${reschedule} hours, and cancel online up to ${cancel} hours, before your appointment's start time.`,
  cutoffGeneral: "You can reschedule or cancel online up to the cutoff time shown in your confirmation email and on your appointment page.",
  sections: (cutoff: string): Section[] => [
    {
      title: "Requests and confirmation",
      paragraphs: [
        "Submitting a booking request does not confirm an appointment. Each request stays pending until the owner reviews it. You'll receive an email when your appointment is confirmed, or if we can't accommodate the request.",
        "If a request can't be confirmed, we may suggest another time or contact you to discuss options.",
      ],
    },
    {
      title: "Estimates",
      paragraphs: [
        "Online estimates are based on the service and the number of bedrooms and bathrooms you select. They are estimates, not final prices.",
        "If the property's size, condition, or the work requested differs from what was described, the estimate may change. We'll talk with you before doing additional work.",
        "Specialty and commercial services are priced by quote.",
      ],
    },
    {
      title: "Rescheduling and cancelling",
      paragraphs: [
        "Your confirmation email includes a private link to manage your appointment.",
        cutoff,
        "After the cutoff, please call or email us and we'll do our best to help.",
      ],
    },
    {
      title: "Arrival and access",
      list: [
        "Appointment times are the scheduled start time. Arrival can vary somewhat because of traffic and earlier appointments; we'll contact you if we expect a significant delay.",
        "Please make sure we can get in at the scheduled time, for example by being home or sharing access instructions in advance.",
        "Let us know beforehand about pets, parking, building rules, or areas you'd like us to avoid.",
        "If we can't get in at the scheduled time, we'll try to reach you and may need to reschedule.",
      ],
    },
    {
      title: "Safety",
      paragraphs: [
        "We may decline or stop work in conditions that are unsafe or outside the agreed scope, such as hazardous materials, mold, or biohazards.",
      ],
    },
    {
      title: "Questions",
      paragraphs: [`For questions about these terms, contact us at ${BUSINESS.email} or ${BUSINESS.phoneDisplay}.`],
    },
  ],
};
const termsEs: typeof termsEn = {
  metaTitle: "Términos de programación (borrador)",
  metaDescription: "Cómo funcionan las solicitudes de cita, los estimados, los cambios y las cancelaciones con Ascencio Cleaning Services.",
  title: "Términos de programación",
  intro: `Estos términos describen cómo se solicitan, confirman y cambian las citas con ${BUSINESS.legalName}.`,
  cutoffBoth: (cancel: number, reschedule: number) =>
    cancel === reschedule
      ? `Puede cambiar o cancelar su cita en línea hasta ${cancel} horas antes de la hora de inicio.`
      : `Puede cambiar su cita en línea hasta ${reschedule} horas antes, y cancelarla en línea hasta ${cancel} horas antes, de la hora de inicio.`,
  cutoffGeneral: "Puede cambiar o cancelar su cita en línea hasta el plazo indicado en su correo de confirmación y en la página de su cita.",
  sections: (cutoff: string): Section[] => [
    {
      title: "Solicitudes y confirmación",
      paragraphs: [
        "Enviar una solicitud de reservación no confirma una cita. Cada solicitud queda pendiente hasta que el propietario la revisa. Usted recibirá un correo electrónico cuando su cita quede confirmada, o si no podemos atender la solicitud.",
        "Si una solicitud no se puede confirmar, podemos sugerirle otro horario o comunicarnos con usted para ver otras opciones.",
      ],
    },
    {
      title: "Estimados",
      paragraphs: [
        "Los estimados en línea se basan en el servicio y en la cantidad de dormitorios y baños que seleccione. Son estimados, no precios finales.",
        "Si el tamaño o el estado de la propiedad, o el trabajo solicitado, es diferente a lo descrito, el estimado puede cambiar. Hablaremos con usted antes de realizar trabajo adicional.",
        "Los servicios especializados y comerciales se cotizan por separado.",
      ],
    },
    {
      title: "Cambios y cancelaciones",
      paragraphs: [
        "Su correo de confirmación incluye un enlace privado para administrar su cita.",
        cutoff,
        "Después de ese plazo, llámenos o escríbanos y haremos lo posible por ayudarle.",
      ],
    },
    {
      title: "Llegada y acceso",
      list: [
        "La hora de la cita es la hora de inicio programada. La llegada puede variar un poco por el tráfico y citas anteriores; le avisaremos si esperamos un retraso importante.",
        "Asegúrese de que podamos entrar a la hora programada, por ejemplo, estando en casa o compartiendo las instrucciones de acceso con anticipación.",
        "Avísenos con anticipación sobre mascotas, estacionamiento, reglas del edificio o áreas que prefiera que no limpiemos.",
        "Si no podemos entrar a la hora programada, intentaremos comunicarnos con usted y es posible que debamos reprogramar.",
      ],
    },
    {
      title: "Seguridad",
      paragraphs: [
        "Podemos rechazar o detener un trabajo en condiciones inseguras o fuera del alcance acordado, como materiales peligrosos, moho o riesgos biológicos.",
      ],
    },
    {
      title: "Preguntas",
      paragraphs: [`Si tiene preguntas sobre estos términos, contáctenos en ${BUSINESS.email} o al ${BUSINESS.phoneDisplay}.`],
    },
  ],
};
const termsMessages = { en: termsEn, es: termsEs };

export function TermsPage() {
  const t = useMessages(termsMessages);
  const { data: config } = usePublicConfig();
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/terms" });
  const cutoff = config ? t.cutoffBoth(config.cancellationCutoffHours, config.rescheduleCutoffHours) : t.cutoffGeneral;
  return <LegalLayout title={t.title} intro={t.intro} sections={t.sections(cutoff)} />;
}
