import { StarRating } from "@/components/star-rating";
import { useLocale, useMessages } from "@/i18n";
import { formatLocalDate } from "@/lib/format";
import { useReviews } from "@/lib/queries";
import { ReviewForm } from "../forms/review-form";

const en = {
  eyebrow: "Reviews",
  title: "What customers say",
  introWithReviews: "Reviews come from customers and are read by the owner before they're published.",
  introEmpty: "We publish only real reviews from customers, after the owner reads them. If we've cleaned for you, we'd love to hear from you.",
};
const es: typeof en = {
  eyebrow: "Reseñas",
  title: "Lo que dicen nuestros clientes",
  introWithReviews: "Las reseñas provienen de clientes y el propietario las lee antes de publicarlas.",
  introEmpty: "Solo publicamos reseñas reales de clientes, después de que el propietario las lee. Si hemos limpiado para usted, nos encantaría conocer su opinión.",
};
export const testimonialsMessages = { en, es };

/** Approved reviews from the API only, never fabricated, plus the review submission form. */
export function Testimonials() {
  const t = useMessages(testimonialsMessages);
  const { locale } = useLocale();
  const { data } = useReviews();
  const reviews = data && data.count > 0 ? data.reviews.slice(0, 6) : [];

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-24 bg-surface-sunken py-16 sm:py-24">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">{t.eyebrow}</p>
          <h2 id="reviews-title" className="text-display-lg">{t.title}</h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{reviews.length ? t.introWithReviews : t.introEmpty}</p>
        </div>

        {reviews.length > 0 && (
          <ul className="mt-10 columns-1 gap-6 md:columns-2 lg:columns-3">
            {reviews.map((r) => (
              <li key={r.id} className="mb-6 break-inside-avoid rounded-xl bg-surface p-6 shadow-soft">
                <figure>
                  <StarRating rating={r.rating} size="sm" />
                  <blockquote className="mt-3 leading-7">
                    <p>{r.body}</p>
                  </blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold">{r.name}</span>
                    {r.createdAt && (
                      <span className="text-muted-foreground"> · {formatLocalDate(r.createdAt.slice(0, 10), locale, { month: "long", year: "numeric" })}</span>
                    )}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12 max-w-3xl">
          <ReviewForm headingId="review-form-title" />
        </div>
      </div>
    </section>
  );
}
