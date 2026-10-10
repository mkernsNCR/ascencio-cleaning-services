// Public request/response contracts shared by client and server. Kept separate from database types.
import { z } from "zod";
import {
  LOCALES, SERVICE_IDS, PROPERTY_LIMITS, ANALYTICS_EVENTS,
  normalizePostalCode, normalizeUsPhone, type BookingStatus, type Localized, type ServiceId, type BookingMode,
} from "./domain";
import { isValidLocalDate } from "./time";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const localeSchema = z.enum(LOCALES);
export const serviceIdSchema = z.enum(SERVICE_IDS);

export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export const phoneSchema = z.string().trim().max(32).transform((v, ctx) => {
  const normalized = normalizeUsPhone(v);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_phone" });
    return z.NEVER;
  }
  return normalized;
});
export const postalCodeSchema = z.string().trim().max(10).transform((v, ctx) => {
  const normalized = normalizePostalCode(v);
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_postal_code" });
    return z.NEVER;
  }
  return normalized;
});
export const localDateSchema = z.string().refine(isValidLocalDate, "invalid_date");

export const propertySchema = z.object({
  bedrooms: z.coerce.number().int().min(PROPERTY_LIMITS.minBedrooms).max(PROPERTY_LIMITS.maxBedrooms),
  bathrooms: z.coerce.number().int().min(PROPERTY_LIMITS.minBathrooms).max(PROPERTY_LIMITS.maxBathrooms),
});

export const estimateRequestSchema = z.object({
  serviceId: serviceIdSchema,
  property: propertySchema,
});
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

export interface EstimateResponse {
  serviceId: ServiceId;
  mode: BookingMode;
  /** True when this job must go through a quote (service type or size exceeds online booking). */
  quoteRequired: boolean;
  durationMinutes: number | null;
  /** Null when the active price list has not been approved for publication. */
  estimateCents: number | null;
  currency: "USD";
  pricingVersionId: number;
  pricesApproved: boolean;
}

export const availabilityQuerySchema = z.object({
  serviceId: serviceIdSchema,
  bedrooms: z.coerce.number().int().min(PROPERTY_LIMITS.minBedrooms).max(PROPERTY_LIMITS.maxBedrooms),
  bathrooms: z.coerce.number().int().min(PROPERTY_LIMITS.minBathrooms).max(PROPERTY_LIMITS.maxBathrooms),
  postalCode: postalCodeSchema,
  from: localDateSchema,
  to: localDateSchema,
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailabilitySlot {
  /** ISO instant of service start. */
  start: string;
  /** ISO instant of service end (excludes buffers). */
  end: string;
  /** Local wall-clock label in the business zone, e.g. "09:30". */
  localTime: string;
  /** Zone abbreviation to disambiguate repeated times on DST fall-back days. */
  zoneLabel: string;
}

export type DayStatus = "open" | "closed" | "full" | "outside_window" | "unavailable";

export interface AvailabilityDay {
  date: string;
  status: DayStatus;
  slots: AvailabilitySlot[];
}

export type AvailabilityStatus =
  | "ok"
  | "not_covered"
  | "quote_required"
  | "calendar_unavailable"
  | "booking_disabled";

export interface AvailabilityResponse {
  status: AvailabilityStatus;
  timezone: string;
  durationMinutes: number | null;
  earliestDate: string;
  latestDate: string;
  days: AvailabilityDay[];
}

export const bookingRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
  locale: localeSchema,
  serviceId: serviceIdSchema,
  property: propertySchema,
  postalCode: postalCodeSchema,
  start: z.string().datetime({ offset: true }),
  firstName: trimmed(80),
  lastName: trimmed(80),
  email: emailSchema,
  phone: phoneSchema,
  address: trimmed(300),
  notes: optionalText(1000),
  policyAccepted: z.literal(true),
  marketingOptIn: z.boolean().optional().default(false),
  // Client-supplied price/duration are intentionally not part of the contract; extra keys are stripped.
});
export type BookingRequest = z.input<typeof bookingRequestSchema>;

export interface BookingReceipt {
  reference: string;
  status: BookingStatus;
  serviceId: ServiceId;
  start: string;
  end: string;
  timezone: string;
  durationMinutes: number;
  estimateCents: number | null;
  currency: "USD";
  manageUrl: string;
  responsePromise: Localized | null;
}

export interface ManagedBooking {
  reference: string;
  status: BookingStatus;
  serviceId: ServiceId;
  property: { bedrooms: number; bathrooms: number };
  postalCode: string;
  start: string;
  end: string;
  timezone: string;
  durationMinutes: number;
  estimateCents: number | null;
  currency: "USD";
  firstName: string;
  addressSummary: string;
  pendingChange: { kind: "reschedule"; start: string; end: string } | null;
  processing: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  policy: { cancellationCutoffHours: number; rescheduleCutoffHours: number };
  decisionReason: string | null;
}

export const rescheduleRequestSchema = z.object({ start: z.string().datetime({ offset: true }) });

export const contactRequestSchema = z.object({
  kind: z.enum(["contact", "commercial_quote", "booking_fallback"]),
  locale: localeSchema,
  firstName: trimmed(80),
  lastName: trimmed(80),
  email: emailSchema,
  phone: phoneSchema,
  company: optionalText(120),
  businessType: optionalText(80),
  squareFeet: z.coerce.number().int().min(100).max(1_000_000).optional(),
  frequency: z.enum(["one_time", "weekly", "biweekly", "monthly", "daily", "other"]).optional(),
  contactWindow: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
  serviceId: serviceIdSchema.optional(),
  postalCode: postalCodeSchema.optional(),
  message: optionalText(2000),
});
export type ContactRequestInput = z.input<typeof contactRequestSchema>;

export const reviewRequestSchema = z.object({
  name: trimmed(80),
  email: emailSchema,
  rating: z.coerce.number().int().min(1).max(5),
  body: trimmed(2000),
  locale: localeSchema.default("en"),
});
export type ReviewRequestInput = z.input<typeof reviewRequestSchema>;

export interface PublicReview {
  id: number;
  name: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface PublicReviewSummary {
  reviews: PublicReview[];
  /** Null when there are no verified reviews; never a fabricated default. */
  averageRating: number | null;
  count: number;
}

export const analyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  path: z.string().max(200).regex(/^\/[A-Za-z0-9/_-]*$/).optional(),
  locale: localeSchema.optional(),
  serviceId: serviceIdSchema.optional(),
  source: z.string().max(80).regex(/^[\w.-]*$/).optional(),
  medium: z.string().max(80).regex(/^[\w.-]*$/).optional(),
  campaign: z.string().max(80).regex(/^[\w.-]*$/).optional(),
});

export const actionDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "publish", "decline"]),
  version: z.number().int().positive().optional(),
  reason: optionalText(500),
});

export interface ActionPreview {
  scope: "booking.decide" | "review.moderate";
  state: "ready" | "expired" | "used" | "stale";
  booking?: {
    reference: string;
    status: BookingStatus;
    version: number;
    serviceId: ServiceId;
    property: { bedrooms: number; bathrooms: number };
    start: string;
    end: string;
    timezone: string;
    customerName: string;
    email: string;
    phone: string;
    address: string;
    notes: string | null;
    estimateCents: number;
    calendarStatus: string;
  };
  review?: { name: string; rating: number; body: string; status: string };
}

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export interface ApiError {
  error: string;
  message?: string;
  fields?: Record<string, string>;
}
