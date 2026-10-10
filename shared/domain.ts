// Domain IDs, the shared service catalog, and business configuration types.
// Prices, durations, hours, and coverage below are PROPOSED DEFAULTS carried over from the original
// code or planning notes. They are not verified business facts and must be approved by the owner
// (see the admin settings screen) before they are published.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export type Localized<T = string> = Record<Locale, T>;

export const SERVICE_IDS = ["standard", "deep", "move", "post_construction", "commercial"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export type BookingMode = "bookable" | "quote_required";

export interface ServiceDefinition {
  id: ServiceId;
  slug: string;
  mode: BookingMode;
  audience: "residential" | "commercial";
  name: Localized;
  summary: Localized;
  inclusions: Localized<string[]>;
  exclusions: Localized<string[]>;
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  {
    id: "standard",
    slug: "standard-cleaning",
    mode: "bookable",
    audience: "residential",
    name: { en: "Standard home cleaning", es: "Limpieza estándar del hogar" },
    summary: {
      en: "Recurring-quality upkeep for kitchens, bathrooms, bedrooms, and living areas.",
      es: "Mantenimiento de calidad para cocinas, baños, dormitorios y áreas comunes.",
    },
    inclusions: {
      en: [
        "Dusting of reachable surfaces and fixtures",
        "Kitchen counters, sink, stovetop, and exterior of appliances",
        "Bathroom sinks, toilets, tubs, showers, and mirrors",
        "Vacuuming and mopping of floors",
        "Emptying trash and making beds",
      ],
      es: [
        "Limpieza de polvo en superficies y accesorios accesibles",
        "Encimeras, fregadero, estufa y exterior de electrodomésticos",
        "Lavamanos, inodoros, bañeras, duchas y espejos",
        "Aspirado y trapeado de pisos",
        "Vaciado de basura y tendido de camas",
      ],
    },
    exclusions: {
      en: ["Inside the oven or refrigerator", "Interior windows", "Heavy furniture moving"],
      es: ["Interior del horno o refrigerador", "Ventanas interiores", "Mover muebles pesados"],
    },
  },
  {
    id: "deep",
    slug: "deep-cleaning",
    mode: "bookable",
    audience: "residential",
    name: { en: "Deep cleaning", es: "Limpieza profunda" },
    summary: {
      en: "A detailed top-to-bottom clean for homes that need extra attention.",
      es: "Una limpieza detallada de arriba a abajo para hogares que necesitan atención extra.",
    },
    inclusions: {
      en: [
        "Everything in standard cleaning",
        "Baseboards, door frames, and trim",
        "Inside the microwave, oven, and refrigerator",
        "Cabinet fronts and light switches",
        "Built-up grime in kitchens and bathrooms",
      ],
      es: [
        "Todo lo incluido en la limpieza estándar",
        "Zócalos, marcos de puertas y molduras",
        "Interior del microondas, horno y refrigerador",
        "Frentes de gabinetes e interruptores",
        "Suciedad acumulada en cocinas y baños",
      ],
    },
    exclusions: {
      en: ["Exterior windows", "Carpet shampooing", "Mold or biohazard remediation"],
      es: ["Ventanas exteriores", "Lavado de alfombras", "Remediación de moho o riesgos biológicos"],
    },
  },
  {
    id: "move",
    slug: "move-in-move-out-cleaning",
    mode: "bookable",
    audience: "residential",
    name: { en: "Move-in / move-out cleaning", es: "Limpieza de mudanza" },
    summary: {
      en: "An empty-home clean so you can hand over keys or settle in with confidence.",
      es: "Limpieza de vivienda vacía para entregar las llaves o mudarse con tranquilidad.",
    },
    inclusions: {
      en: [
        "Everything in deep cleaning",
        "Inside empty cabinets, drawers, and closets",
        "Inside all appliances",
        "Window sills and tracks",
      ],
      es: [
        "Todo lo incluido en la limpieza profunda",
        "Interior de gabinetes, cajones y clósets vacíos",
        "Interior de todos los electrodomésticos",
        "Alféizares y rieles de ventanas",
      ],
    },
    exclusions: {
      en: ["Homes that are still furnished", "Wall washing or paint touch-ups", "Junk removal"],
      es: ["Viviendas aún amuebladas", "Lavado de paredes o retoques de pintura", "Retiro de basura voluminosa"],
    },
  },
  {
    id: "post_construction",
    slug: "post-construction-cleaning",
    mode: "quote_required",
    audience: "residential",
    name: { en: "Post-construction cleaning", es: "Limpieza post-construcción" },
    summary: {
      en: "Dust and debris cleanup after renovation work, scoped on request.",
      es: "Limpieza de polvo y residuos después de remodelaciones, cotizada a pedido.",
    },
    inclusions: {
      en: ["Fine dust removal from surfaces and fixtures", "Floor cleaning", "Fixture and glass detailing"],
      es: ["Eliminación de polvo fino en superficies y accesorios", "Limpieza de pisos", "Detallado de accesorios y vidrios"],
    },
    exclusions: {
      en: ["Hazardous material disposal", "Large debris haul-away"],
      es: ["Eliminación de materiales peligrosos", "Retiro de escombros grandes"],
    },
  },
  {
    id: "commercial",
    slug: "commercial-cleaning",
    mode: "quote_required",
    audience: "commercial",
    name: { en: "Commercial cleaning", es: "Limpieza comercial" },
    summary: {
      en: "Tailored recurring cleaning for offices, retail, and other workplaces.",
      es: "Limpieza recurrente a la medida para oficinas, comercios y otros espacios de trabajo.",
    },
    inclusions: {
      en: ["Workspaces and common areas", "Restrooms and break rooms", "Schedules that fit your business hours"],
      es: ["Espacios de trabajo y áreas comunes", "Baños y salas de descanso", "Horarios que se ajustan a su negocio"],
    },
    exclusions: {
      en: ["Specialized medical or lab decontamination unless agreed in writing"],
      es: ["Descontaminación médica o de laboratorio especializada, salvo acuerdo por escrito"],
    },
  },
] as const;

export function getService(id: string): ServiceDefinition | undefined {
  return SERVICE_CATALOG.find((s) => s.id === id);
}

export function getServiceBySlug(slug: string): ServiceDefinition | undefined {
  return SERVICE_CATALOG.find((s) => s.slug === slug);
}

export interface PropertyDetails {
  bedrooms: number; // 0 = studio
  bathrooms: number;
}

export const PROPERTY_LIMITS = { minBedrooms: 0, maxBedrooms: 6, minBathrooms: 1, maxBathrooms: 5 } as const;

export interface ServicePriceRule {
  basePriceCents: number; // studio/1 bedroom, 1 bathroom
  baseMinutes: number;
  perExtraBedroomCents: number;
  perExtraBedroomMinutes: number;
  perExtraBathroomCents: number;
  perExtraBathroomMinutes: number;
  /** Jobs estimated longer than this are routed to a quote instead of online booking. */
  maxBookableMinutes: number;
}

export interface PricingRules {
  currency: "USD";
  roundingMinutes: number;
  services: Partial<Record<ServiceId, ServicePriceRule>>;
}

/** Proposed defaults derived from the original code ($120/$200/$250 base). Not approved rates. */
export const DEFAULT_PRICING_RULES: PricingRules = {
  currency: "USD",
  roundingMinutes: 30,
  services: {
    standard: {
      basePriceCents: 12000, baseMinutes: 180,
      perExtraBedroomCents: 3600, perExtraBedroomMinutes: 45,
      perExtraBathroomCents: 2000, perExtraBathroomMinutes: 30,
      maxBookableMinutes: 480,
    },
    deep: {
      basePriceCents: 20000, baseMinutes: 300,
      perExtraBedroomCents: 6000, perExtraBedroomMinutes: 60,
      perExtraBathroomCents: 3000, perExtraBathroomMinutes: 45,
      maxBookableMinutes: 480,
    },
    move: {
      basePriceCents: 25000, baseMinutes: 360,
      perExtraBedroomCents: 7500, perExtraBedroomMinutes: 60,
      perExtraBathroomCents: 3500, perExtraBathroomMinutes: 45,
      maxBookableMinutes: 480,
    },
  },
};

export interface OpeningWindow {
  open: string; // HH:MM
  close: string; // HH:MM
}

export interface BusinessSettings {
  timezone: string;
  /** Keyed by day of week, "0" = Sunday. Empty array = closed. */
  weeklyHours: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", OpeningWindow[]>;
  closedDates: string[]; // YYYY-MM-DD holidays/closures
  leadTimeHours: number;
  horizonDays: number;
  bufferMinutes: number;
  slotIncrementMinutes: number;
  pendingExpiryHours: number;
  ownerExpiryWarningHours: number;
  reminderHoursBefore: number;
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
  coverage: {
    postalPrefixes: string[]; // e.g. "200" matches 200xx
    postalCodes: string[];
    excludedPostalCodes: string[];
  };
  /** Shown to customers after submission. null until the owner approves a promise. */
  responsePromise: Localized | null;
}

/** Proposed planning defaults from the specification. Owner must review before launch. */
export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  timezone: "America/New_York",
  weeklyHours: {
    "0": [],
    "1": [{ open: "08:00", close: "18:00" }],
    "2": [{ open: "08:00", close: "18:00" }],
    "3": [{ open: "08:00", close: "18:00" }],
    "4": [{ open: "08:00", close: "18:00" }],
    "5": [{ open: "08:00", close: "18:00" }],
    "6": [],
  },
  closedDates: [],
  leadTimeHours: 24,
  horizonDays: 60,
  bufferMinutes: 30,
  slotIncrementMinutes: 30,
  pendingExpiryHours: 24,
  ownerExpiryWarningHours: 4,
  reminderHoursBefore: 24,
  cancellationCutoffHours: 24,
  rescheduleCutoffHours: 24,
  coverage: {
    // Proposed DMV ZIP3 prefixes: DC (200, 202-205), Maryland (206-212, 214-219), Northern Virginia (201, 220-223).
    postalPrefixes: ["200", "201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212",
      "214", "215", "216", "217", "218", "219", "220", "221", "222", "223"],
    postalCodes: [],
    excludedPostalCodes: [],
  },
  responsePromise: null,
};

export const BOOKING_STATUSES = ["pending_approval", "confirmed", "rejected", "cancelled", "expired", "completed"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ANALYTICS_EVENTS = [
  "service_selected",
  "availability_viewed",
  "request_submitted",
  "request_confirmed",
  "commercial_quote_submitted",
  "call_link_clicked",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export function normalizePostalCode(input: string): string | null {
  const m = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(input);
  return m ? m[1] : null;
}

export function isPostalCodeCovered(postalCode: string, coverage: BusinessSettings["coverage"]): boolean {
  if (coverage.excludedPostalCodes.includes(postalCode)) return false;
  if (coverage.postalCodes.includes(postalCode)) return true;
  return coverage.postalPrefixes.some((p) => postalCode.startsWith(p));
}

/** Normalizes US phone numbers to E.164 (+1XXXXXXXXXX). Returns null when not a valid US number. */
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10 || /^[01]/.test(national) || /^\d{3}[01]/.test(national)) return null;
  return `+1${national}`;
}
