import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { SERVICE_CATALOG, SERVICE_IDS, type ServiceId } from "@shared/domain";
import type { ContactRequestInput } from "@shared/api";
import { Field, LiveRegion } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { api } from "@/lib/api";
import { usePublicConfig } from "@/lib/queries";
import { marketingMessages } from "../shared/messages";
import { NativeSelect } from "../shared/native-select";
import { RequiredLabel } from "../shared/required-label";
import { optional, requireFields, useApiForm } from "../shared/use-api-form";

const en = {
  service: "Service you're interested in",
  serviceNone: "Not sure yet",
  postalHint: "Helps us confirm the location is in our service area.",
  messageHint: "Tell us what you need, including any questions.",
  submit: "Send message",
  successTitle: "Thank you. Your message was sent.",
  successBody: "We'll reply by email or phone.",
  another: "Send another message",
};
const es: typeof en = {
  service: "Servicio que le interesa",
  serviceNone: "Todavía no estoy seguro",
  postalHint: "Nos ayuda a confirmar que la ubicación está dentro de nuestra área de servicio.",
  messageHint: "Cuéntenos qué necesita, incluidas sus preguntas.",
  submit: "Enviar mensaje",
  successTitle: "Gracias. Su mensaje fue enviado.",
  successBody: "Le responderemos por correo electrónico o por teléfono.",
  another: "Enviar otro mensaje",
};
export const contactFormMessages = { en, es };

const empty = { firstName: "", lastName: "", email: "", phone: "", serviceId: "", postalCode: "", message: "" };
type Values = typeof empty;

const isServiceId = (v: string | null): v is ServiceId => !!v && (SERVICE_IDS as readonly string[]).includes(v);

export function ContactForm() {
  const t = useMessages(contactFormMessages);
  const m = useMessages(marketingMessages);
  const common = useMessages(commonMessages);
  const { locale } = useLocale();
  const { data: config } = usePublicConfig();
  const [values, setValues] = useState<Values>(empty);
  const form = useApiForm();

  // Preselect a service from ?service=<id>. Read in an effect so prerendered HTML stays stable.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("service");
    if (isServiceId(fromQuery)) setValues((v) => (v.serviceId ? v : { ...v, serviceId: fromQuery }));
  }, []);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = requireFields(values, ["firstName", "lastName", "email", "phone", "message"]);
    const body: ContactRequestInput = {
      kind: "contact",
      locale,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      serviceId: isServiceId(values.serviceId) ? values.serviceId : undefined,
      postalCode: optional(values.postalCode),
      message: optional(values.message),
    };
    const ok = await form.submit(errors, () => api("/api/contact", { body }));
    if (ok) setValues(empty);
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
              <p className="text-foreground">{promise ?? t.successBody}</p>
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
            <Field label={t.service} optionalLabel={common.optional} error={form.fieldError("serviceId")}>
              <NativeSelect name="serviceId" value={values.serviceId} onChange={set("serviceId")}>
                <option value="">{t.serviceNone}</option>
                {SERVICE_CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name[locale]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={m.form.postalCode} optionalLabel={common.optional} hint={t.postalHint} error={form.fieldError("postalCode")}>
              <Input name="postalCode" inputMode="numeric" autoComplete="postal-code" value={values.postalCode} onChange={set("postalCode")} maxLength={10} />
            </Field>
          </div>
          <Field label={<RequiredLabel>{m.form.message}</RequiredLabel>} hint={t.messageHint} error={form.fieldError("message")}>
            <Textarea name="message" rows={5} value={values.message} onChange={set("message")} maxLength={2000} aria-required="true" />
          </Field>
          <div>
            <Button type="submit" size="lg" disabled={form.submitting}>
              {form.submitting ? m.form.sending : t.submit}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
