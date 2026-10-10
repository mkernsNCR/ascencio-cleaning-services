import { BadgeCheck, Languages, MapPin } from "lucide-react";
import { StarRating } from "@/components/star-rating";
import { VERIFIED_CREDENTIALS } from "@/content/site";
import { intlLocale, useLocale, useMessages } from "@/i18n";
import { useReviews } from "@/lib/queries";

const en = {
  label: "At a glance",
  rating: (avg: string, count: number) => `${avg} average from ${count} ${count === 1 ? "review" : "reviews"}`,
  area: "Washington, DC, Maryland, and Virginia",
  areaLabel: "Service area",
  bilingual: "English and Spanish",
  bilingualLabel: "Languages",
};
const es: typeof en = {
  label: "En resumen",
  rating: (avg: string, count: number) => `Promedio de ${avg} en ${count} ${count === 1 ? "reseña" : "reseñas"}`,
  area: "Washington, DC, Maryland y Virginia",
  areaLabel: "Área de servicio",
  bilingual: "Inglés y español",
  bilingualLabel: "Idiomas",
};
export const evidenceMessages = { en, es };

/** Verified facts only: approved rating (when reviews exist), verified credentials, area, languages. */
export function EvidenceStrip() {
  const t = useMessages(evidenceMessages);
  const { locale } = useLocale();
  const { data: reviews } = useReviews();
  const hasRating = !!reviews && reviews.count > 0 && reviews.averageRating != null;

  return (
    <section aria-label={t.label} className="border-y border-border bg-surface">
      <ul className="container-page flex flex-col gap-4 py-6 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-10 sm:gap-y-4">
        {hasRating && (
          <li className="flex items-center gap-3">
            <StarRating rating={reviews.averageRating!} size="sm" />
            <span className="font-semibold">
              {t.rating(new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(reviews.averageRating!), reviews.count)}
            </span>
          </li>
        )}
        {VERIFIED_CREDENTIALS.map((c) => (
          <li key={c.en} className="flex items-center gap-2.5 font-semibold">
            <BadgeCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
            {c[locale]}
          </li>
        ))}
        <li className="flex items-center gap-2.5">
          <MapPin aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="text-muted-foreground">{t.areaLabel}: </span>
            <span className="font-semibold">{t.area}</span>
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <Languages aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="text-muted-foreground">{t.bilingualLabel}: </span>
            <span className="font-semibold">{t.bilingual}</span>
          </span>
        </li>
      </ul>
    </section>
  );
}
