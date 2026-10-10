import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ContactRequestInput } from "@shared/api";
import { Field, LiveRegion } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { usePublicConfig } from "@/lib/queries";
import { marketingMessages } from "../shared/messages";
import { NativeSelect } from "../shared/native-select";
import { RequiredLabel } from "../shared/required-label";
import { optional, requireFields, useApiForm } from "../shared/use-api-form";

const FREQUENCIES = ["one_time", "weekly", "biweekly", "monthly", "daily", "other"] as const;
const WINDOWS = ["morning", "afternoon", "evening", "any"] as const;
const BUSINESS_TYPES = ["office", "retail", "common_areas", "studio", "other"] as const;
type Frequency = (typeof FREQUENCIES)[number];
type ContactWindow = (typeof WINDOWS)[number];

const en = {
  company: "Company or organization",
  businessType: "Type of space",
  businessTypes: {
    office: "Office",
    retail: "Retail store",
    common_areas: "Building common areas",
    studio: "Studio or fitness space",
    other: "Other",
  } as Record<(typeof BUSINESS_TYPES)[number], string>,
  squareFeet: "Approximate square feet",
  squareFeetHint: "A rough number is fine, for example 2500.",
  squareFeetRange: "Enter a whole number between 100 and 1,000,000.",
  frequency: "How often do you need cleaning?",
  frequencies: {
    one_time: "One time",
    weekly: "Weekly",
    biweekly: "Every two weeks",
    monthly: "Monthly",
    daily: "Daily",
    other: "Other / not sure",
  } as Record<Frequency, string>,
  contactWindow: "Best time to contact you",
  windows: {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    any: "Any time",
  } as Record<ContactWindow, string>,
  postalHint: "ZIP code of the space to be cleaned.",
  messageHint: "Hours you'd like us to work, areas to include, or anything else that helps us prepare a proposal.",
  submit: "Request a commercial quote",
  successTitle: "Thank you. Your quote request was sent.",
  successBody: "We'll contact you to discuss your space and schedule before preparing a proposal.",
  another: "Send another request",
};
const es: typeof en = {
  company: "Empresa u organización",
  businessType: "Tipo de espacio",
  businessTypes: {
    office: "Oficina",
    retail: "Tienda",
    common_areas: "Áreas comunes de edificio",
    studio: "Estudio o gimnasio",
    other: "Otro",
  },
  squareFeet: "Pies cuadrados aproximados",
  squareFeetHint: "Un número aproximado está bien, por ejemplo 2500.",
  squareFeetRange: "Ingrese un número entero entre 100 y 1,000,000.",
  frequency: "¿Con qué frecuencia necesita limpieza?",
  frequencies: {
    one_time: "Una sola vez",
    weekly: "Semanal",
    biweekly: "Cada dos semanas",
    monthly: "Mensual",
    daily: "Diaria",
    other: "Otra / no estoy seguro",
  },
  contactWindow: "Mejor horario para contactarle",
  windows: {
    morning: "Mañana",
    afternoon: "Tarde",
    evening: "Noche",
    any: "Cualquier hora",
  },
  postalHint: "Código postal del espacio que se va a limpiar.",
  messageHint: "Horario en que prefiere que trabajemos, áreas a incluir o cualquier otro detalle que nos ayude a preparar una propuesta.",
  submit: "Solicitar cotización comercial",
  successTitle: "Gracias. Su solicitud de cotización fue enviada.",
  successBody: "Nos comunicaremos con usted para hablar sobre su espacio y horario antes de preparar una propuesta.",
  another: "Enviar otra solicitud",
};
export const commercialQuoteFormMessages = { en, es };

const empty = {
  firstName: "", lastName: "", email: "", phone: "", company: "", businessType: "",
  squareFeet: "", frequency: "", contactWindow: "", postalCode: "", message: "",
};
type Values = typeof empty;

const pick = <T extends string>(list: readonly T[], v: string): T | undefined => ((list as readonly string[]).includes(v) ? (v as T) : undefined);

export function CommercialQuoteForm() {
  const t = useMessages(commercialQuoteFormMessages);
  const m = useMessages(marketingMessages);
  const common = useMessages(commonMessages);
  const { locale } = useLocale();
  const { data: config } = usePublicConfig();
  const [values, setValues] = useState<Values>(empty);
  const form = useApiForm({ square_feet_range: t.squareFeetRange });

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = requireFields(values, ["firstName", "lastName", "email", "phone"]);
    let squareFeet: number | undefined;
    const sq = values.squareFeet.replace(/[,\s]/g, "");
    if (sq) {
      const n = Number(sq);
      if (!Number.isInteger(n) || n < 100 || n > 1_000_000) errors.squareFeet = "square_feet_range";
      else squareFeet = n;
    }
    const body: ContactRequestInput = {
      kind: "commercial_quote",
      locale,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      company: optional(values.company),
      businessType: pick(BUSINESS_TYPES, values.businessType),
      squareFeet,
      frequency: pick(FREQUENCIES, values.frequency),
      contactWindow: pick(WINDOWS, values.contactWindow),
      serviceId: "commercial",
      postalCode: optional(values.postalCode),
      message: optional(values.message),
    };
    const ok = await form.submit(errors, () => api("/api/contact", { body }));
    if (ok) {
      track("commercial_quote_submitted", { locale });
      setValues(empty);
    }
  }

  const promise = config?.responsePromise?.[locale];

  return (
    <div>
      <LiveRegion>
        {form.status === "success" && (
          <div className="flex gap-3 rounded-lg bg-success-soft p-4 text-success">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{t.successTitle}</p>
              <p className="text-foreground">{t.successBody}</p>
              {promise && <p className="mt-1 text-foreground">{promise}</p>}
            </div>
          </div>
        )}
        {form.formErrorText && <p className="mb-4 rounded-lg bg-destructive-soft p-4 font-medium text-destructive">{form.formErrorText}</p>}
      </LiveRegion>

      {form.status === "success" ? (
        <Button type="button" variant="outline" className="mt-4" onClick={form.reset}>
          {t.another}
        </Button>
      ) : (
        <form ref={form.formRef} noValidate onSubmit={onSubmit} className="grid gap-5">
          <p className="text-sm text-muted-foreground">{m.form.requiredNote}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={<RequiredLabel>{m.form.firstName}</RequiredLabel>} error={form.fieldError("firstName")}>
              <Input name="firstName" autoComplete="given-name" value={values.firstName} onChange={set("firstName")} maxLength={80} aria-required="true" />
            </Field>
            <Field label={<RequiredLabel>{m.form.lastName}</RequiredLabel>} error={form.fieldError("lastName")}>
              <Input name="lastName" autoComplete="family-name" value={values.lastName} onChange={set("lastName")} maxLength={80} aria-required="true" />
            </Field>
            <Field label={<RequiredLabel>{m.form.email}</RequiredLabel>} error={form.fieldError("email")}>
              <Input name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} maxLength={254} aria-required="true" />
            </Field>
            <Field label={<RequiredLabel>{m.form.phone}</RequiredLabel>} error={form.fieldError("phone")}>
              <Input name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} maxLength={32} aria-required="true" />
            </Field>
            <Field label={t.company} optionalLabel={common.optional} error={form.fieldError("company")}>
              <Input name="company" autoComplete="organization" value={values.company} onChange={set("company")} maxLength={120} />
            </Field>
            <Field label={t.businessType} optionalLabel={common.optional} error={form.fieldError("businessType")}>
              <NativeSelect name="businessType" value={values.businessType} onChange={set("businessType")}>
                <option value="">{m.form.selectPlaceholder}</option>
                {BUSINESS_TYPES.map((k) => (
                  <option key={k} value={k}>{t.businessTypes[k]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.squareFeet} optionalLabel={common.optional} hint={t.squareFeetHint} error={form.fieldError("squareFeet")}>
              <Input name="squareFeet" inputMode="numeric" value={values.squareFeet} onChange={set("squareFeet")} maxLength={9} />
            </Field>
            <Field label={m.form.postalCode} optionalLabel={common.optional} hint={t.postalHint} error={form.fieldError("postalCode")}>
              <Input name="postalCode" inputMode="numeric" autoComplete="postal-code" value={values.postalCode} onChange={set("postalCode")} maxLength={10} />
            </Field>
            <Field label={t.frequency} optionalLabel={common.optional} error={form.fieldError("frequency")}>
              <NativeSelect name="frequency" value={values.frequency} onChange={set("frequency")}>
                <option value="">{m.form.selectPlaceholder}</option>
                {FREQUENCIES.map((k) => (
                  <option key={k} value={k}>{t.frequencies[k]}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.contactWindow} optionalLabel={common.optional} error={form.fieldError("contactWindow")}>
              <NativeSelect name="contactWindow" value={values.contactWindow} onChange={set("contactWindow")}>
                <option value="">{m.form.selectPlaceholder}</option>
                {WINDOWS.map((k) => (
                  <option key={k} value={k}>{t.windows[k]}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label={m.form.message} optionalLabel={common.optional} hint={t.messageHint} error={form.fieldError("message")}>
            <Textarea name="message" rows={5} value={values.message} onChange={set("message")} maxLength={2000} />
          </Field>
          <div>
            <Button type="submit" size="lg" disabled={form.submitting} className="whitespace-normal text-left">
              {form.submitting ? m.form.sending : t.submit}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
