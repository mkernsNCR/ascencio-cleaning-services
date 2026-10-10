import { SERVICE_CATALOG } from "@shared/domain";

/** Public routes rendered to static HTML at build time and listed in the sitemap. */
export const PRERENDER_ROUTES: string[] = [
  "/",
  "/services",
  ...SERVICE_CATALOG.map((s) => `/services/${s.slug}`),
  "/commercial",
  "/service-areas",
  "/our-work",
  "/about",
  "/contact",
  "/booking",
  "/privacy",
  "/terms",
];
