// Lifecycle email templates. Every dynamic value is escaped via the `html` tagged template.
// Customer-facing messages use the booking's locale; owner messages are English.
import { BUSINESS } from "@shared/business";
import { getService, type Locale, type PropertyDetails } from "@shared/domain";
import { html, raw } from "../lib/html";

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export interface BookingView {
  id: string;
  reference: string;
  locale: Locale;
  serviceId: string;
  property: PropertyDetails;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  notes: string | null;
  start: Date;
  end: Date;
  timezone: string;
  durationMinutes: number;
  estimateCents: number;
  pricesApproved: boolean;
}

const COLORS = { bg: "#F7F6F0", surface: "#FFFFFF", text: "#182B25", primary: "#214F42", border: "#DCE3DD", muted: "#4A5C55" };

const STRINGS = {
  en: {
    greeting: (name: string) => `Hi ${name},`,
    reference: "Reference",
    service: "Service",
    when: "Requested time",
    confirmedWhen: "Appointment",
    duration: "Estimated duration",
    estimate: "Estimate",
    estimatePending: "Your estimate will be confirmed by our team.",
    estimateNote: "Estimates are based on the details you provided. Final price is confirmed before service.",
    address: "Address",
    property: (p: PropertyDetails) => `${p.bedrooms === 0 ? "Studio" : `${p.bedrooms} bedroom${p.bedrooms === 1 ? "" : "s"}`}, ${p.bathrooms} bathroom${p.bathrooms === 1 ? "" : "s"}`,
    manage: "View or manage your request",
    hours: (n: number) => `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}`,
    footer: "Questions? Reply to this email or call",
    received: {
      subject: (ref: string) => `We received your cleaning request (${ref})`,
      title: "Request received — pending approval",
      body: "Thanks for choosing us. Your appointment is not confirmed yet. We will review availability and email you once it is approved.",
    },
    confirmed: {
      subject: (when: string) => `Confirmed: your cleaning on ${when}`,
      title: "Your appointment is confirmed",
      body: "We're looking forward to it. A calendar file is attached.",
      prepTitle: "Before we arrive",
      prep: [
        "Make sure we can access the home at the scheduled time.",
        "Secure pets and put away valuables or fragile items.",
        "Let us know about parking or building access instructions.",
      ],
    },
    rejected: {
      subject: (ref: string) => `Update on your cleaning request (${ref})`,
      title: "We couldn't confirm this time",
      body: "Unfortunately we are unable to take this appointment. Please choose another available time.",
      reason: "Note from our team",
      cta: "See available times",
    },
    expired: {
      subject: (ref: string) => `Your cleaning request expired (${ref})`,
      title: "Your request expired",
      body: "We weren't able to confirm your request in time, so the time slot has been released. We're sorry for the inconvenience. Please choose a new time or contact us.",
      cta: "See available times",
    },
    cancelled: {
      subject: (ref: string) => `Cancelled: cleaning appointment ${ref}`,
      title: "Your appointment has been cancelled",
      body: "This confirms the cancellation below. No further reminders will be sent.",
    },
    rescheduled: {
      subject: (when: string) => `Rescheduled: your cleaning is now ${when}`,
      title: "Your appointment has been moved",
      body: "Your new appointment time is below. An updated calendar file is attached.",
      newTime: "New time",
    },
    rescheduleFailed: {
      subject: (ref: string) => `We couldn't move your appointment (${ref})`,
      title: "Your original appointment is unchanged",
      body: "The new time you chose is no longer available. Your original appointment is still confirmed. Please choose a different time.",
    },
    reminder: {
      subject: (when: string) => `Reminder: cleaning appointment ${when}`,
      title: "See you soon",
      body: "This is a reminder of your upcoming appointment.",
    },
  },
  es: {
    greeting: (name: string) => `Hola ${name}:`,
    reference: "Referencia",
    service: "Servicio",
    when: "Horario solicitado",
    confirmedWhen: "Cita",
    duration: "Duración estimada",
    estimate: "Estimado",
    estimatePending: "Nuestro equipo confirmará su estimado.",
    estimateNote: "Los estimados se basan en los datos proporcionados. El precio final se confirma antes del servicio.",
    address: "Dirección",
    property: (p: PropertyDetails) => `${p.bedrooms === 0 ? "Estudio" : `${p.bedrooms} dormitorio${p.bedrooms === 1 ? "" : "s"}`}, ${p.bathrooms} baño${p.bathrooms === 1 ? "" : "s"}`,
    manage: "Ver o administrar su solicitud",
    hours: (n: number) => `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}`,
    footer: "¿Preguntas? Responda a este correo o llame al",
    received: {
      subject: (ref: string) => `Recibimos su solicitud de limpieza (${ref})`,
      title: "Solicitud recibida — pendiente de aprobación",
      body: "Gracias por elegirnos. Su cita aún no está confirmada. Revisaremos la disponibilidad y le escribiremos cuando sea aprobada.",
    },
    confirmed: {
      subject: (when: string) => `Confirmada: su limpieza el ${when}`,
      title: "Su cita está confirmada",
      body: "Le esperamos. Adjuntamos un archivo de calendario.",
      prepTitle: "Antes de nuestra llegada",
      prep: [
        "Asegúrese de que podamos acceder a la vivienda a la hora programada.",
        "Asegure a sus mascotas y guarde objetos de valor o frágiles.",
        "Indíquenos instrucciones de estacionamiento o acceso al edificio.",
      ],
    },
    rejected: {
      subject: (ref: string) => `Actualización de su solicitud de limpieza (${ref})`,
      title: "No pudimos confirmar este horario",
      body: "Lamentablemente no podemos tomar esta cita. Por favor elija otro horario disponible.",
      reason: "Nota de nuestro equipo",
      cta: "Ver horarios disponibles",
    },
    expired: {
      subject: (ref: string) => `Su solicitud de limpieza venció (${ref})`,
      title: "Su solicitud venció",
      body: "No pudimos confirmar su solicitud a tiempo, por lo que el horario fue liberado. Lamentamos las molestias. Elija un nuevo horario o contáctenos.",
      cta: "Ver horarios disponibles",
    },
    cancelled: {
      subject: (ref: string) => `Cancelada: cita de limpieza ${ref}`,
      title: "Su cita fue cancelada",
      body: "Confirmamos la cancelación indicada abajo. No se enviarán más recordatorios.",
    },
    rescheduled: {
      subject: (when: string) => `Reprogramada: su limpieza ahora es el ${when}`,
      title: "Su cita fue cambiada",
      body: "Su nuevo horario aparece abajo. Adjuntamos un archivo de calendario actualizado.",
      newTime: "Nuevo horario",
    },
    rescheduleFailed: {
      subject: (ref: string) => `No pudimos cambiar su cita (${ref})`,
      title: "Su cita original no cambió",
      body: "El nuevo horario que eligió ya no está disponible. Su cita original sigue confirmada. Por favor elija otro horario.",
    },
    reminder: {
      subject: (when: string) => `Recordatorio: cita de limpieza ${when}`,
      title: "Hasta pronto",
      body: "Le recordamos su próxima cita.",
    },
  },
} as const;

const intlLocale = (locale: Locale) => (locale === "es" ? "es-US" : "en-US");

export function formatWhen(date: Date, timezone: string, locale: Locale): string {
  const formatted = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return formatted;
}

export function formatShortWhen(date: Date, timezone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

export function formatMoney(cents: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(cents / 100);
}

function serviceName(id: string, locale: Locale) {
  return getService(id)?.name[locale] ?? id;
}

function layout(title: string, bodyHtml: string, locale: Locale): string {
  const footer = STRINGS[locale].footer;
  return html`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:${COLORS.bg};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};line-height:1.5">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="font-size:20px;font-weight:bold;color:${COLORS.primary};padding:8px 0 16px">${BUSINESS.shortName}</div>
<div style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;padding:24px">
<h1 style="font-size:22px;margin:0 0 16px;color:${COLORS.text}">${title}</h1>
${raw(bodyHtml)}
</div>
<p style="font-size:13px;color:${COLORS.muted};padding:16px 4px">${footer} <a href="tel:${BUSINESS.phoneE164}" style="color:${COLORS.primary}">${BUSINESS.phoneDisplay}</a>.<br>${BUSINESS.legalName}</p>
</div></body></html>`;
}

function detailRows(rows: [string, string][]): string {
  return html`<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0">${rows.map(
    ([k, v]) => raw(html`<tr><td style="padding:6px 12px 6px 0;color:${COLORS.muted};vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0;font-weight:bold">${v}</td></tr>`),
  )}</table>`;
}

function button(href: string, label: string): string {
  return html`<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:${COLORS.primary};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${label}</a></p>`;
}

function textRows(rows: [string, string][]) {
  return rows.map(([k, v]) => `${k}: ${v}`).join("\n");
}

function customerRows(b: BookingView, opts: { whenLabel: string; includeAddress?: boolean }): [string, string][] {
  const s = STRINGS[b.locale];
  const rows: [string, string][] = [
    [s.reference, b.reference],
    [s.service, `${serviceName(b.serviceId, b.locale)} — ${s.property(b.property)}`],
    [opts.whenLabel, formatWhen(b.start, b.timezone, b.locale)],
    [s.duration, s.hours(b.durationMinutes)],
    [s.estimate, b.pricesApproved ? formatMoney(b.estimateCents, b.locale) : s.estimatePending],
  ];
  if (opts.includeAddress) rows.push([s.address, b.address]);
  return rows;
}

function customerMail(
  b: BookingView,
  subject: string,
  title: string,
  paragraphs: string[],
  rows: [string, string][],
  extras: { manageUrl?: string; manageLabel?: string; extraHtml?: string; extraText?: string } = {},
): RenderedMail {
  const s = STRINGS[b.locale];
  const bodyHtml =
    html`<p>${s.greeting(b.firstName)}</p>${paragraphs.map((p) => raw(html`<p>${p}</p>`))}` +
    detailRows(rows) +
    (b.pricesApproved ? html`<p style="font-size:13px;color:${COLORS.muted}">${s.estimateNote}</p>` : "") +
    (extras.extraHtml ?? "") +
    (extras.manageUrl ? button(extras.manageUrl, extras.manageLabel ?? s.manage) : "");
  const text = [
    s.greeting(b.firstName),
    "",
    ...paragraphs,
    "",
    textRows(rows),
    b.pricesApproved ? `\n${s.estimateNote}` : "",
    extras.extraText ?? "",
    extras.manageUrl ? `\n${extras.manageLabel ?? s.manage}: ${extras.manageUrl}` : "",
    "",
    `${s.footer} ${BUSINESS.phoneDisplay}.`,
    BUSINESS.legalName,
  ].join("\n").replace(/\n{3,}/g, "\n\n");
  return { subject, html: layout(title, bodyHtml, b.locale), text };
}

export const customerTemplates = {
  requestReceived(b: BookingView, manageUrl: string, responsePromise: string | null): RenderedMail {
    const s = STRINGS[b.locale];
    const paragraphs: string[] = [s.received.body];
    if (responsePromise) paragraphs.push(responsePromise);
    return customerMail(b, s.received.subject(b.reference), s.received.title, paragraphs,
      customerRows(b, { whenLabel: s.when, includeAddress: true }), { manageUrl });
  },
  confirmed(b: BookingView, manageUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    const prepHtml = html`<h2 style="font-size:16px;margin:16px 0 8px">${s.confirmed.prepTitle}</h2><ul>${s.confirmed.prep.map((p) => raw(html`<li>${p}</li>`))}</ul>`;
    const prepText = `\n${s.confirmed.prepTitle}\n${s.confirmed.prep.map((p) => `- ${p}`).join("\n")}`;
    return customerMail(b, s.confirmed.subject(formatShortWhen(b.start, b.timezone, b.locale)), s.confirmed.title,
      [s.confirmed.body], customerRows(b, { whenLabel: s.confirmedWhen, includeAddress: true }),
      { manageUrl, extraHtml: prepHtml, extraText: prepText });
  },
  rejected(b: BookingView, reason: string | null, bookingUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    const paragraphs: string[] = [s.rejected.body];
    if (reason) paragraphs.push(`${s.rejected.reason}: ${reason}`);
    return customerMail(b, s.rejected.subject(b.reference), s.rejected.title, paragraphs,
      customerRows(b, { whenLabel: s.when }), { manageUrl: bookingUrl, manageLabel: s.rejected.cta });
  },
  expired(b: BookingView, bookingUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    return customerMail(b, s.expired.subject(b.reference), s.expired.title, [s.expired.body],
      customerRows(b, { whenLabel: s.when }), { manageUrl: bookingUrl, manageLabel: s.expired.cta });
  },
  cancelled(b: BookingView): RenderedMail {
    const s = STRINGS[b.locale];
    return customerMail(b, s.cancelled.subject(b.reference), s.cancelled.title, [s.cancelled.body],
      customerRows(b, { whenLabel: s.confirmedWhen }));
  },
  rescheduled(b: BookingView, manageUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    return customerMail(b, s.rescheduled.subject(formatShortWhen(b.start, b.timezone, b.locale)), s.rescheduled.title,
      [s.rescheduled.body], customerRows(b, { whenLabel: s.rescheduled.newTime, includeAddress: true }), { manageUrl });
  },
  rescheduleFailed(b: BookingView, manageUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    return customerMail(b, s.rescheduleFailed.subject(b.reference), s.rescheduleFailed.title, [s.rescheduleFailed.body],
      customerRows(b, { whenLabel: s.confirmedWhen }), { manageUrl });
  },
  reminder(b: BookingView, manageUrl: string): RenderedMail {
    const s = STRINGS[b.locale];
    return customerMail(b, s.reminder.subject(formatShortWhen(b.start, b.timezone, b.locale)), s.reminder.title,
      [s.reminder.body], customerRows(b, { whenLabel: s.confirmedWhen, includeAddress: true }), { manageUrl });
  },
  icsSummary(b: BookingView) {
    return `${serviceName(b.serviceId, b.locale)} — ${BUSINESS.shortName}`;
  },
};

function ownerRows(b: BookingView): [string, string][] {
  const rows: [string, string][] = [
    ["Reference", b.reference],
    ["Customer", `${b.firstName} ${b.lastName}`],
    ["Email", b.email],
    ["Phone", b.phone],
    ["Service", `${serviceName(b.serviceId, "en")} — ${STRINGS.en.property(b.property)}`],
    ["Time", formatWhen(b.start, b.timezone, "en")],
    ["Duration", STRINGS.en.hours(b.durationMinutes)],
    ["Estimate", `${formatMoney(b.estimateCents)}${b.pricesApproved ? "" : " (unapproved price list)"}`],
    ["Address", `${b.address} (${b.postalCode})`],
    ["Customer language", b.locale === "es" ? "Spanish" : "English"],
  ];
  if (b.notes) rows.push(["Notes", b.notes]);
  return rows;
}

function ownerMail(subject: string, title: string, intro: string, rows: [string, string][], action?: { url: string; label: string }): RenderedMail {
  const bodyHtml = html`<p>${intro}</p>` + detailRows(rows) + (action ? button(action.url, action.label) : "");
  const text = [intro, "", textRows(rows), action ? `\n${action.label}: ${action.url}` : ""].join("\n");
  return { subject, html: layout(title, bodyHtml, "en"), text };
}

export const ownerTemplates = {
  bookingRequest(b: BookingView, reviewUrl: string, expiresAt: Date | null): RenderedMail {
    const expiry = expiresAt ? ` It will expire if not decided by ${formatWhen(expiresAt, b.timezone, "en")}.` : "";
    return ownerMail(
      `New booking request ${b.reference}: ${formatShortWhen(b.start, b.timezone, "en")}`,
      "New booking request",
      `A customer requested an appointment. The time is held until you decide.${expiry} Opening the link does not change anything; you will confirm on the review screen.`,
      ownerRows(b),
      { url: reviewUrl, label: "Review request" },
    );
  },
  expiryWarning(b: BookingView, reviewUrl: string, expiresAt: Date): RenderedMail {
    return ownerMail(
      `Action needed: ${b.reference} expires soon`,
      "Request expiring soon",
      `This request will expire at ${formatWhen(expiresAt, b.timezone, "en")} and the customer will be notified.`,
      ownerRows(b),
      { url: reviewUrl, label: "Review request" },
    );
  },
  lifecycle(b: BookingView, event: "confirmed" | "cancelled" | "rescheduled" | "expired" | "rejected", adminUrl: string): RenderedMail {
    const titles = {
      confirmed: "Appointment confirmed",
      cancelled: "Appointment cancelled by customer",
      rescheduled: "Appointment rescheduled",
      expired: "Request expired",
      rejected: "Request declined",
    } as const;
    return ownerMail(`${titles[event]}: ${b.reference}`, titles[event], `${titles[event]}. Records have been updated.`, ownerRows(b),
      { url: adminUrl, label: "Open dashboard" });
  },
  staffAlert(subject: string, detail: string, adminUrl: string): RenderedMail {
    return ownerMail(`Attention needed: ${subject}`, "Attention needed", detail, [], { url: adminUrl, label: "Open dashboard" });
  },
  contactRequest(c: {
    kind: string; firstName: string; lastName: string; email: string; phone: string; company?: string | null;
    businessType?: string | null; squareFeet?: number | null; frequency?: string | null; contactWindow?: string | null;
    serviceId?: string | null; postalCode?: string | null; message?: string | null; locale: string;
  }, adminUrl: string): RenderedMail {
    const kindLabel = c.kind === "commercial_quote" ? "Commercial quote request" : c.kind === "booking_fallback" ? "Booking help request" : "Contact request";
    const rows: [string, string][] = [
      ["Name", `${c.firstName} ${c.lastName}`],
      ["Email", c.email],
      ["Phone", c.phone],
      ["Language", c.locale === "es" ? "Spanish" : "English"],
    ];
    if (c.company) rows.push(["Company", c.company]);
    if (c.businessType) rows.push(["Business type", c.businessType]);
    if (c.squareFeet) rows.push(["Square feet", String(c.squareFeet)]);
    if (c.frequency) rows.push(["Frequency", c.frequency]);
    if (c.contactWindow) rows.push(["Preferred contact window", c.contactWindow]);
    if (c.serviceId) rows.push(["Service", serviceName(c.serviceId, "en")]);
    if (c.postalCode) rows.push(["ZIP code", c.postalCode]);
    if (c.message) rows.push(["Message", c.message]);
    return ownerMail(`${kindLabel} from ${c.firstName} ${c.lastName}`, kindLabel, "A new request arrived from the website.", rows,
      { url: adminUrl, label: "Open dashboard" });
  },
  reviewSubmitted(r: { name: string; email: string; rating: number; body: string }, moderateUrl: string): RenderedMail {
    return ownerMail(
      `New review (${r.rating}/5) from ${r.name}`,
      "New review awaiting moderation",
      "A customer submitted a review. It is not published until you approve it. Opening the link does not change anything.",
      [["Name", r.name], ["Email", r.email], ["Rating", `${r.rating}/5`], ["Review", r.body]],
      { url: moderateUrl, label: "Review submission" },
    );
  },
};
