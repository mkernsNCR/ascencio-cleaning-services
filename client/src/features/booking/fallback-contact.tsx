import { useState, type FormEvent } from "react";
import { BUSINESS } from "@shared/business";
import type { ServiceId } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, LiveRegion } from "@/components/forms/field";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { api, ApiError } from "@/lib/api";
import { bookingMessages } from "./messages";
import type { ContactDetails } from "./draft";

/**
 * Shown when online scheduling can't offer real slots (integration outage, uncovered ZIP, paused
 * booking). Sends a contact request; never implies an appointment was booked.
 */
export function FallbackContact({ reason, contact, serviceId, postalCode }: { reason: string; contact: ContactDetails; serviceId: ServiceId | null; postalCode: string }) {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const d = t.details;
  const common = useMessages(commonMessages);
  const [values, setValues] = useState({ ...contact, preferred: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState("");

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrors({});
    setFormError("");
    try {
      await api("/api/contact", {
        body: {
          kind: "booking_fallback",
          locale,
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone,
          serviceId: serviceId ?? undefined,
          postalCode: /^\d{5}$/.test(postalCode) ? postalCode : undefined,
          message: [values.preferred && `${t.fallback.preferred}: ${values.preferred}`, values.notes].filter(Boolean).join("\n\n") || undefined,
        },
      });
      setStatus("sent");
    } catch (error) {
      setStatus("error");
      if (error instanceof ApiError && error.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, code] of Object.entries(error.fields)) mapped[k] = (common.errors as Record<string, string>)[code] ?? common.errors.required;
        setErrors(mapped);
        setFormError(common.errors.fixFields);
      } else if (error instanceof ApiError && error.code === "rate_limited") setFormError(common.errors.rateLimited);
      else if (error instanceof ApiError && error.isNetwork) setFormError(common.errors.network);
      else setFormError(common.errors.generic);
    }
  };

  if (status === "sent") {
    return <LiveRegion className="rounded-xl border border-success/30 bg-success-soft p-5 font-medium">{t.fallback.sent}</LiveRegion>;
  }

  return (
    <section aria-labelledby="fallback-heading" className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <p className="rounded-lg bg-warning-soft p-3 text-warning">{reason}</p>
      <h3 id="fallback-heading" className="font-sans text-xl font-semibold">{t.fallback.heading}</h3>
      <p className="text-muted-foreground">{t.fallback.intro}</p>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={d.firstName} error={errors.firstName}><Input autoComplete="given-name" value={values.firstName} onChange={set("firstName")} required /></Field>
        <Field label={d.lastName} error={errors.lastName}><Input autoComplete="family-name" value={values.lastName} onChange={set("lastName")} required /></Field>
        <Field label={d.email} error={errors.email}><Input type="email" autoComplete="email" value={values.email} onChange={set("email")} required /></Field>
        <Field label={d.phone} error={errors.phone}><Input type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} required /></Field>
        <Field label={t.fallback.preferred} className="sm:col-span-2"><Input value={values.preferred} onChange={set("preferred")} /></Field>
        <Field label={d.notes} optionalLabel={common.optional} className="sm:col-span-2"><Textarea value={values.notes} onChange={set("notes")} maxLength={1500} /></Field>
        <div className="sm:col-span-2">
          {formError && <LiveRegion assertive className="mb-3 font-medium text-destructive">{formError}</LiveRegion>}
          <Button type="submit" disabled={status === "sending"}>{status === "sending" ? common.loading : t.fallback.submit}</Button>
          <p className="mt-3 text-sm text-muted-foreground">
            {t.fallback.callInstead} <a className="font-semibold text-primary underline" href={`tel:${BUSINESS.phoneE164}`}>{BUSINESS.phoneDisplay}</a>
          </p>
        </div>
      </form>
    </section>
  );
}
