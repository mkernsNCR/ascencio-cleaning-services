import type { Locale } from "@shared/domain";
import { intlLocale } from "@/i18n";

export function formatMoney(cents: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function formatDuration(minutes: number, locale: Locale) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "es") return m ? `${h} h ${m} min` : `${h} ${h === 1 ? "hora" : "horas"}`;
  return m ? `${h} hr ${m} min` : `${h} ${h === 1 ? "hour" : "hours"}`;
}

export function formatDateLong(iso: string | Date, timeZone: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function formatTime(iso: string | Date, timeZone: string, locale: Locale, withZone = false) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone, hour: "numeric", minute: "2-digit", ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(new Date(iso));
}

/** Formats a pure calendar date (YYYY-MM-DD) without shifting it through any timezone. */
export function formatLocalDate(date: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function timeZoneLabel(timeZone: string, locale: Locale) {
  if (timeZone === "America/New_York") return locale === "es" ? "hora del Este (Nueva York)" : "Eastern Time (New York)";
  return timeZone;
}

export function propertyLabel(p: { bedrooms: number; bathrooms: number }, locale: Locale) {
  if (locale === "es") {
    const beds = p.bedrooms === 0 ? "Estudio" : `${p.bedrooms} ${p.bedrooms === 1 ? "dormitorio" : "dormitorios"}`;
    return `${beds}, ${p.bathrooms} ${p.bathrooms === 1 ? "baño" : "baños"}`;
  }
  const beds = p.bedrooms === 0 ? "Studio" : `${p.bedrooms} ${p.bedrooms === 1 ? "bedroom" : "bedrooms"}`;
  return `${beds}, ${p.bathrooms} ${p.bathrooms === 1 ? "bathroom" : "bathrooms"}`;
}
