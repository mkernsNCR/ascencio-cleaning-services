import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ReviewRequestInput } from "@shared/api";
import { Field, LiveRegion } from "@/components/forms/field";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useMessages } from "@/i18n";
import { api } from "@/lib/api";
import { marketingMessages } from "../shared/messages";
import { RequiredLabel } from "../shared/required-label";
import { requireFields, useApiForm } from "../shared/use-api-form";

const en = {
  title: "Share your experience",
  intro: "Had a cleaning with us? Tell us how it went. Reviews are read by the owner before they appear on the site.",
  name: "Your name",
  nameHint: "Shown with your review.",
  email: "Email",
  emailHint: "Used only if we need to follow up. Never published.",
  rating: "Your rating",
  ratingRequired: "Choose a rating from 1 to 5 stars.",
  body: "Your review",
  submit: "Submit review",
  successTitle: "Thank you for your review.",
  successBody: "It will appear on the site after the owner reviews it.",
  another: "Write another review",
};
const es: typeof en = {
  title: "Comparta su experiencia",
  intro: "¿Tuvo una limpieza con nosotros? Cuéntenos cómo le fue. El propietario lee las reseñas antes de publicarlas en el sitio.",
  name: "Su nombre",
  nameHint: "Se muestra junto a su reseña.",
  email: "Correo electrónico",
  emailHint: "Solo lo usaremos si necesitamos comunicarnos con usted. Nunca se publica.",
  rating: "Su calificación",
  ratingRequired: "Elija una calificación de 1 a 5 estrellas.",
  body: "Su reseña",
  submit: "Enviar reseña",
  successTitle: "Gracias por su reseña.",
  successBody: "Aparecerá en el sitio después de que el propietario la revise.",
  another: "Escribir otra reseña",
};
export const reviewFormMessages = { en, es };

const empty = { name: "", email: "", body: "" };

export function ReviewForm({ headingId }: { headingId?: string }) {
  const t = useMessages(reviewFormMessages);
  const m = useMessages(marketingMessages);
  const { locale } = useLocale();
  const [values, setValues] = useState(empty);
  const [rating, setRating] = useState(0);
  const form = useApiForm({ rating_required: t.ratingRequired });

  const set = (key: keyof typeof empty) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = requireFields(values, ["name", "email", "body"]);
    if (rating < 1 || rating > 5) errors.rating = "rating_required";
    const body: ReviewRequestInput = { name: values.name.trim(), email: values.email.trim(), rating, body: values.body.trim(), locale };
    const ok = await form.submit(errors, () => api("/api/reviews", { body }));
    if (ok) {
      setValues(empty);
      setRating(0);
    }
  }

  const ratingError = form.fieldError("rating");

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-soft sm:p-8">
      <h3 id={headingId} className="text-2xl font-semibold">{t.title}</h3>
      <p className="mt-2 text-muted-foreground">{t.intro}</p>

      <LiveRegion className="mt-4">
        {form.status === "success" && (
          <div className="flex gap-3 rounded-lg bg-success-soft p-4 text-success">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{t.successTitle}</p>
              <p className="text-foreground">{t.successBody}</p>
            </div>
          </div>
        )}
        {form.formErrorText && (
          <p className="rounded-lg bg-destructive-soft p-4 font-medium text-destructive">{form.formErrorText}</p>
        )}
      </LiveRegion>

      {form.status === "success" ? (
        <Button type="button" variant="outline" className="mt-4" onClick={form.reset}>
          {t.another}
        </Button>
      ) : (
        <form ref={form.formRef} noValidate onSubmit={onSubmit} className="mt-4 grid gap-5">
          <p className="text-sm text-muted-foreground">{m.form.requiredNote}</p>
          <StarRating
            interactive
            label={t.rating}
            rating={rating}
            onRatingChange={setRating}
            error={ratingError}
            required
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={<RequiredLabel>{t.name}</RequiredLabel>} hint={t.nameHint} error={form.fieldError("name")}>
              <Input name="name" autoComplete="name" value={values.name} onChange={set("name")} maxLength={80} aria-required="true" />
            </Field>
            <Field label={<RequiredLabel>{t.email}</RequiredLabel>} hint={t.emailHint} error={form.fieldError("email")}>
              <Input name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} maxLength={254} aria-required="true" />
            </Field>
          </div>
          <Field label={<RequiredLabel>{t.body}</RequiredLabel>} error={form.fieldError("body")}>
            <Textarea name="body" rows={5} value={values.body} onChange={set("body")} maxLength={2000} aria-required="true" />
          </Field>
          <div>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? m.form.sending : t.submit}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
