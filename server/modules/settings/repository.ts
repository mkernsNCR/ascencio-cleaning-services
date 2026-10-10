import { eq, asc, desc } from "drizzle-orm";
import {
  DEFAULT_BUSINESS_SETTINGS, DEFAULT_PRICING_RULES, type BusinessSettings, type PricingRules,
} from "@shared/domain";
import { businessSettings, pricingVersions, resources, type ResourceRow } from "../../db/schema";
import type { Executor } from "../../db";

export interface LoadedSettings {
  settings: BusinessSettings;
  version: number;
  approvedAt: Date | null;
}

/** Creates proposed defaults once. Existing rows are never overwritten. */
export async function ensureDefaults(db: Executor) {
  await db.insert(businessSettings).values({ id: 1, settings: DEFAULT_BUSINESS_SETTINGS }).onConflictDoNothing();
  const existingPricing = await db.select({ id: pricingVersions.id }).from(pricingVersions).limit(1);
  if (existingPricing.length === 0) {
    await db.insert(pricingVersions).values({
      label: "Proposed defaults from original site code (not approved)",
      rules: DEFAULT_PRICING_RULES,
      active: true,
    });
  }
  const existingResources = await db.select({ id: resources.id }).from(resources).limit(1);
  if (existingResources.length === 0) {
    await db.insert(resources).values({ name: "Crew 1", sortOrder: 0 });
  }
}

export async function getSettings(db: Executor): Promise<LoadedSettings> {
  const [row] = await db.select().from(businessSettings).where(eq(businessSettings.id, 1));
  if (!row) return { settings: DEFAULT_BUSINESS_SETTINGS, version: 0, approvedAt: null };
  // Merge so settings saved before a new field existed still have a value.
  return { settings: { ...DEFAULT_BUSINESS_SETTINGS, ...row.settings }, version: row.version, approvedAt: row.approvedAt };
}

export async function getActivePricing(db: Executor): Promise<{ id: number; rules: PricingRules; approved: boolean; label: string }> {
  const [row] = await db.select().from(pricingVersions).where(eq(pricingVersions.active, true));
  if (!row) throw new Error("No active pricing version. Run migrations and start the server once to seed defaults.");
  return { id: row.id, rules: row.rules, approved: row.approvedAt !== null, label: row.label };
}

export async function listPricingVersions(db: Executor) {
  return db.select().from(pricingVersions).orderBy(desc(pricingVersions.id));
}

export async function getActiveResources(db: Executor): Promise<ResourceRow[]> {
  return db.select().from(resources).where(eq(resources.active, true)).orderBy(asc(resources.sortOrder), asc(resources.id));
}

export async function getResource(db: Executor, id: number): Promise<ResourceRow | undefined> {
  const [row] = await db.select().from(resources).where(eq(resources.id, id));
  return row;
}

/** Calendars whose busy time blocks a resource: its destination plus configured busy sources. */
export function resourceCalendars(resource: ResourceRow): string[] {
  return Array.from(new Set([resource.destinationCalendar, ...resource.busyCalendars].filter((c): c is string => !!c)));
}
