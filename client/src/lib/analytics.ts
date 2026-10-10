import type { AnalyticsEventName, Locale, ServiceId } from "@shared/domain";

const ATTRIBUTION_KEY = "acs.attribution";

interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
}

const clean = (v: string | null) => (v && /^[\w.-]{1,80}$/.test(v) ? v : undefined);

/** Captures UTM attribution once per session, separately from any booking details. */
export function captureAttribution() {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
    const q = new URLSearchParams(window.location.search);
    const value: Attribution = { source: clean(q.get("utm_source")), medium: clean(q.get("utm_medium")), campaign: clean(q.get("utm_campaign")) };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function attribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Anonymous funnel events. Accepts only an event name, locale, and service ID: never names,
 * emails, addresses, notes, references, or tokens.
 */
export function track(name: AnalyticsEventName, props: { locale?: Locale; serviceId?: ServiceId } = {}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ name, path: window.location.pathname.replace(/[^A-Za-z0-9/_-]/g, ""), ...props, ...attribution() });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    // fall through to fetch
  }
  fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
