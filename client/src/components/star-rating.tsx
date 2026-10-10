import { useId, useState } from "react";
import { Star } from "lucide-react";
import { useLocale, useMessages, intlLocale } from "@/i18n";
import { cn } from "@/lib/utils";

const en = {
  outOf: (rating: string) => `${rating} out of 5 stars`,
  star: (n: number) => (n === 1 ? "1 star" : `${n} stars`),
};
const es: typeof en = {
  outOf: (rating: string) => `${rating} de 5 estrellas`,
  star: (n: number) => (n === 1 ? "1 estrella" : `${n} estrellas`),
};
export const starRatingMessages = { en, es };

const sizeClasses = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" } as const;

// Brass fill with a dark-brass outline keeps filled stars distinguishable (non-text contrast);
// empty stars use a muted outline. Meaning is always also available as text.
const filledClass = "fill-accent text-warning";
const emptyClass = "fill-transparent text-muted-foreground";

interface DisplayProps {
  rating: number;
  size?: keyof typeof sizeClasses;
  className?: string;
  interactive?: false;
}

interface InteractiveProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  interactive: true;
  /** Visible group label (rendered as the fieldset legend). */
  label: string;
  /** Radio group name; defaults to a generated id. */
  name?: string;
  error?: string | null;
  required?: boolean;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export type StarRatingProps = DisplayProps | InteractiveProps;

/**
 * Star rating.
 * - Display mode: decorative stars with an accessible text equivalent ("4 out of 5 stars").
 * - Interactive mode: a native radio group (arrow keys move between ratings) with labelled options.
 */
export function StarRating(props: StarRatingProps) {
  if (props.interactive) return <InteractiveStars {...props} />;
  return <DisplayStars {...props} />;
}

function DisplayStars({ rating, size = "md", className }: DisplayProps) {
  const t = useMessages(starRatingMessages);
  const { locale } = useLocale();
  const rounded = Math.round(rating);
  const text = t.outOf(new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(rating));
  return (
    <span role="img" aria-label={text} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn(sizeClasses[size], n <= rounded ? filledClass : emptyClass)} />
      ))}
    </span>
  );
}

function InteractiveStars({ rating, onRatingChange, label, name, error, required, size = "lg", className }: InteractiveProps) {
  const t = useMessages(starRatingMessages);
  const id = useId();
  const groupName = name ?? `${id}-rating`;
  const errorId = error ? `${id}-error` : undefined;
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)} aria-describedby={errorId}>
      <legend className="mb-1.5 p-0 text-sm font-semibold text-foreground">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </legend>
      <div className="flex flex-wrap items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            onMouseEnter={() => setHover(n)}
            className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-muted [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-[3px] [&:has(:focus-visible)]:outline-offset-1 [&:has(:focus-visible)]:outline-ring"
          >
            <input
              type="radio"
              name={groupName}
              value={n}
              checked={rating === n}
              onChange={() => onRatingChange(n)}
              required={required}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              className="peer sr-only"
            />
            <Star aria-hidden="true" className={cn(sizeClasses[size], n <= shown ? filledClass : emptyClass)} />
            <span className="sr-only">{t.star(n)}</span>
          </label>
        ))}
        {rating > 0 && (
          <span aria-hidden="true" className="ml-2 text-sm text-muted-foreground">
            {t.outOf(String(rating))}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
