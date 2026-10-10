import { Check, Minus } from "lucide-react";
import type { ServiceDefinition, ServiceId } from "@shared/domain";
import { useLocale, useMessages } from "@/i18n";
import { formatDuration, formatMoney } from "@/lib/format";
import { useServices } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { marketingMessages } from "./messages";

/** Where each service's primary action goes. Bookable services preselect themselves in booking. */
export function serviceActionHref(service: ServiceDefinition): string {
  if (service.mode === "bookable") return `/booking?service=${service.id}`;
  if (service.id === "commercial") return "/commercial";
  return `/contact?service=${service.id}`;
}

export function serviceDetailHref(service: ServiceDefinition): string {
  return `/services/${service.slug}`;
}

interface PublishedPricing {
  fromPriceCents: number | null;
  baseDurationMinutes: number | null;
}

/**
 * Published "from" prices and durations, only when the owner has approved the price list.
 * Returns an empty map while loading, during prerender, or when prices are unapproved.
 */
export function usePublishedPricing(): Partial<Record<ServiceId, PublishedPricing>> {
  const { data } = useServices();
  if (!data?.pricesApproved) return {};
  const map: Partial<Record<ServiceId, PublishedPricing>> = {};
  for (const s of data.services) map[s.id] = { fromPriceCents: s.fromPriceCents, baseDurationMinutes: s.baseDurationMinutes };
  return map;
}

/** Price/duration line that falls back to an honest estimate policy when nothing is published. */
export function PriceLine({ service, className }: { service: ServiceDefinition; className?: string }) {
  const { locale } = useLocale();
  const m = useMessages(marketingMessages);
  const pricing = usePublishedPricing()[service.id];
  const price = pricing?.fromPriceCents != null ? m.pricing.fromPrice(formatMoney(pricing.fromPriceCents, locale)) : null;
  const duration = pricing?.baseDurationMinutes != null ? m.pricing.typicalDuration(formatDuration(pricing.baseDurationMinutes, locale)) : null;
  const fallback = service.mode === "bookable" ? m.pricing.estimatePending : m.pricing.quotePending;
  return (
    <div className={cn("text-sm", className)}>
      {price || duration ? (
        <p>
          {price && <span className="font-semibold text-foreground">{price}</span>}
          {price && duration && <span aria-hidden="true" className="mx-2 text-muted-foreground">·</span>}
          {duration && <span className="text-muted-foreground">{duration}</span>}
        </p>
      ) : (
        <p className="text-muted-foreground">{fallback}</p>
      )}
    </div>
  );
}

/** Inclusion or exclusion list with decorative icons; the list heading carries the meaning. */
export function ServiceList({ items, kind, className }: { items: string[]; kind: "included" | "excluded"; className?: string }) {
  const Icon = kind === "included" ? Check : Minus;
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <Icon
            aria-hidden="true"
            className={cn("mt-1 h-4 w-4 shrink-0", kind === "included" ? "text-primary" : "text-muted-foreground")}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Small pill describing the booking mode. */
export function ModeBadge({ service, className }: { service: ServiceDefinition; className?: string }) {
  const m = useMessages(marketingMessages);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        service.mode === "bookable" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning",
        className,
      )}
    >
      {m.mode[service.mode]}
    </span>
  );
}
