import { useState, type FormEvent } from "react";
import { normalizeUsPhone } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, LiveRegion } from "@/components/forms/field";
import { useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { bookingMessages } from "./messages";
import type { BookingDraft, ContactDetails } from "./draft";

export function validateContact(draft: BookingDraft, errorsText: typeof commonMessages.en.errors, policyError: string) {
  const errors: Record<string, string> = {};
  const c = draft.contact;
  if (!c.firstName.trim()) errors.firstName = errorsText.required;
  if (!c.lastName.trim()) errors.lastName = errorsText.required;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) errors.email = errorsText.invalid_email;
  if (!normalizeUsPhone(c.phone)) errors.phone = errorsText.invalid_phone;
  if (!c.address.trim()) errors.address = errorsText.required;
  if (!draft.policyAccepted) errors.policyAccepted = policyError;
  return errors;
}

export function DetailsStep({
  draft, update, onBack, onContinue, serverErrors,
}: {
  draft: BookingDraft;
  update: (p: Partial<BookingDraft>) => void;
  onBack: () => void;
  onContinue: () => void;
  serverErrors: Record<string, string>;
}) {
  const t = useMessages(bookingMessages);
  const d = t.details;
  const common = useMessages(commonMessages);
  const [errors, setErrors] = useState<Record<string, string>>(serverErrors);
  const [attempted, setAttempted] = useState(Object.keys(serverErrors).length > 0);

  const setField = (key: keyof ContactDetails) => (e: { target: { value: string } }) => {
    update({ contact: { ...draft.contact, [key]: e.target.value } });
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateContact(draft, common.errors, d.policyError);
    setErrors(found);
    setAttempted(true);
    if (Object.keys(found).length === 0) onContinue();
    else document.querySelector<HTMLElement>(`[name="${Object.keys(found)[0]}"]`)?.focus();
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {attempted && hasErrors && <LiveRegion assertive className="rounded-lg bg-destructive-soft p-3 font-medium text-destructive">{common.errors.fixFields}</LiveRegion>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={d.firstName} error={errors.firstName}>
          <Input name="firstName" autoComplete="given-name" value={draft.contact.firstName} onChange={setField("firstName")} maxLength={80} required />
        </Field>
        <Field label={d.lastName} error={errors.lastName}>
          <Input name="lastName" autoComplete="family-name" value={draft.contact.lastName} onChange={setField("lastName")} maxLength={80} required />
        </Field>
        <Field label={d.email} hint={d.emailHint} error={errors.email}>
          <Input name="email" type="email" autoComplete="email" value={draft.contact.email} onChange={setField("email")} maxLength={254} required />
        </Field>
        <Field label={d.phone} error={errors.phone}>
          <Input name="phone" type="tel" autoComplete="tel" value={draft.contact.phone} onChange={setField("phone")} maxLength={32} required />
        </Field>
        <Field label={d.address} hint={d.addressHint} error={errors.address} className="sm:col-span-2">
          <Input name="address" autoComplete="street-address" value={draft.contact.address} onChange={setField("address")} maxLength={300} required />
        </Field>
        <Field label={d.notes} hint={d.notesHint} optionalLabel={common.optional} error={errors.notes} className="sm:col-span-2">
          <Textarea name="notes" value={draft.contact.notes} onChange={setField("notes")} maxLength={1000} rows={4} />
        </Field>
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="policyAccepted"
            checked={draft.policyAccepted}
            onChange={(e) => {
              update({ policyAccepted: e.target.checked });
              if (errors.policyAccepted) setErrors((prev) => ({ ...prev, policyAccepted: "" }));
            }}
            aria-invalid={errors.policyAccepted ? true : undefined}
            aria-describedby={errors.policyAccepted ? "policy-error" : undefined}
            className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--primary)]"
          />
          <span>
            {d.policy}{" "}
            <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-primary underline">
              {d.policyLink}
              <span className="sr-only"> {d.newTab}</span>
            </a>
            .
          </span>
        </label>
        {errors.policyAccepted && <p id="policy-error" className="mt-1 pl-9 text-sm font-medium text-destructive">{errors.policyAccepted}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>{t.back}</Button>
        <Button type="submit" size="lg">{t.continue}</Button>
      </div>
    </form>
  );
}
