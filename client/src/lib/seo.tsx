import { createContext, useContext, useEffect } from "react";

export interface PageMeta {
  title: string;
  description: string;
  /** Canonical path, e.g. "/services". */
  path: string;
  noindex?: boolean;
  /** JSON-LD objects for this page (verified facts only). */
  jsonLd?: Record<string, unknown>[];
}

/** Collects meta during server prerendering; unused in the browser. */
export const SsrMetaContext = createContext<{ meta?: PageMeta } | null>(null);

export const SITE_NAME = "Ascencio Cleaning Services";

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Per-route title, description, canonical URL, robots, and social preview tags. */
export function usePageMeta(meta: PageMeta) {
  const ssr = useContext(SsrMetaContext);
  if (ssr) ssr.meta = meta;

  useEffect(() => {
    const fullTitle = meta.path === "/" ? meta.title : `${meta.title} | ${SITE_NAME}`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', "name", "description", meta.description);
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    setMeta('meta[name="robots"]', "name", "robots", meta.noindex ? "noindex, nofollow" : "index, follow");
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = new URL(meta.path, window.location.origin).toString();
    setMeta('meta[property="og:url"]', "property", "og:url", canonical.href);
  }, [meta.title, meta.description, meta.path, meta.noindex]);
}
