import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, type Locale } from "@shared/domain";

export type { Locale };

const STORAGE_KEY = "acs.locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: "en", setLocale: () => {} });

function readPreferredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery && (LOCALES as readonly string[]).includes(fromQuery)) return fromQuery as Locale;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // storage unavailable (private mode); fall through
  }
  return "en";
}

/**
 * Shared locale for navigation, forms, errors, and receipts. Persists across routes and reloads.
 * Prerendered pages hydrate in English first, then switch, to avoid hydration mismatches.
 */
export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readPreferredLocale());

  useEffect(() => {
    if (initialLocale) {
      const preferred = readPreferredLocale();
      if (preferred !== locale) setLocaleState(preferred);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.delete("lang");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Picks the current locale's messages from a `{ en, es }` dictionary. */
export function useMessages<T>(dictionary: Record<Locale, T>): T {
  const { locale } = useLocale();
  return dictionary[locale];
}

export const intlLocale = (locale: Locale) => (locale === "es" ? "es-US" : "en-US");
