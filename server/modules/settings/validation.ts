import { z } from "zod";
import { SERVICE_IDS } from "@shared/domain";
import { isValidLocalDate, isValidTimeZone, minutesOfWallTime } from "@shared/time";

const wall = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const window = z.object({ open: wall, close: wall }).refine((w) => minutesOfWallTime(w.close) > minutesOfWallTime(w.open), "close must be after open");
const day = z.array(window).max(3);

export const businessSettingsSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "unknown IANA timezone"),
  weeklyHours: z.object({ "0": day, "1": day, "2": day, "3": day, "4": day, "5": day, "6": day }),
  closedDates: z.array(z.string().refine(isValidLocalDate)).max(400),
  leadTimeHours: z.number().int().min(0).max(24 * 14),
  horizonDays: z.number().int().min(1).max(365),
  bufferMinutes: z.number().int().min(0).max(240),
  slotIncrementMinutes: z.number().int().refine((n) => [15, 30, 60].includes(n), "15, 30, or 60"),
  pendingExpiryHours: z.number().int().min(1).max(24 * 7),
  ownerExpiryWarningHours: z.number().int().min(0).max(48),
  reminderHoursBefore: z.number().int().min(0).max(24 * 7),
  cancellationCutoffHours: z.number().int().min(0).max(24 * 14),
  rescheduleCutoffHours: z.number().int().min(0).max(24 * 14),
  coverage: z.object({
    postalPrefixes: z.array(z.string().regex(/^\d{1,5}$/)).max(500),
    postalCodes: z.array(z.string().regex(/^\d{5}$/)).max(2000),
    excludedPostalCodes: z.array(z.string().regex(/^\d{5}$/)).max(2000),
  }),
  responsePromise: z.object({ en: z.string().trim().min(1).max(300), es: z.string().trim().min(1).max(300) }).nullable(),
});

const rule = z.object({
  basePriceCents: z.number().int().min(0).max(1_000_000),
  baseMinutes: z.number().int().min(30).max(960),
  perExtraBedroomCents: z.number().int().min(0).max(100_000),
  perExtraBedroomMinutes: z.number().int().min(0).max(240),
  perExtraBathroomCents: z.number().int().min(0).max(100_000),
  perExtraBathroomMinutes: z.number().int().min(0).max(240),
  maxBookableMinutes: z.number().int().min(30).max(960),
});

export const pricingRulesSchema = z.object({
  currency: z.literal("USD"),
  roundingMinutes: z.number().int().refine((n) => [15, 30, 60].includes(n)),
  services: z.record(z.enum(SERVICE_IDS), rule),
});

export const resourceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(100),
  destinationCalendar: z.string().trim().max(300).nullable(),
  busyCalendars: z.array(z.string().trim().min(1).max(300)).max(10),
});
