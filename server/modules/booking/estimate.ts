import { getService, PROPERTY_LIMITS, type PricingRules, type PropertyDetails, type ServiceId } from "@shared/domain";
import { badRequest } from "../../lib/errors";

export interface Estimate {
  serviceId: ServiceId;
  quoteRequired: boolean;
  durationMinutes: number | null;
  estimateCents: number | null;
}

/**
 * Authoritative price/duration calculation. Inputs are trusted only after schema validation;
 * this also enforces service/property compatibility.
 */
export function calculateEstimate(serviceId: ServiceId, property: PropertyDetails, rules: PricingRules): Estimate {
  const service = getService(serviceId);
  if (!service) throw badRequest("unknown_service");
  if (
    !Number.isInteger(property.bedrooms) || !Number.isInteger(property.bathrooms) ||
    property.bedrooms < PROPERTY_LIMITS.minBedrooms || property.bedrooms > PROPERTY_LIMITS.maxBedrooms ||
    property.bathrooms < PROPERTY_LIMITS.minBathrooms || property.bathrooms > PROPERTY_LIMITS.maxBathrooms
  ) {
    throw badRequest("invalid_property");
  }
  if (service.mode === "quote_required") {
    return { serviceId, quoteRequired: true, durationMinutes: null, estimateCents: null };
  }
  const rule = rules.services[serviceId];
  if (!rule) return { serviceId, quoteRequired: true, durationMinutes: null, estimateCents: null };

  const extraBedrooms = Math.max(0, property.bedrooms - 1);
  const extraBathrooms = Math.max(0, property.bathrooms - 1);
  const rawMinutes =
    rule.baseMinutes + extraBedrooms * rule.perExtraBedroomMinutes + extraBathrooms * rule.perExtraBathroomMinutes;
  const step = Math.max(1, rules.roundingMinutes);
  const durationMinutes = Math.ceil(rawMinutes / step) * step;
  const estimateCents =
    rule.basePriceCents + extraBedrooms * rule.perExtraBedroomCents + extraBathrooms * rule.perExtraBathroomCents;

  if (durationMinutes > rule.maxBookableMinutes) {
    return { serviceId, quoteRequired: true, durationMinutes: null, estimateCents: null };
  }
  return { serviceId, quoteRequired: false, durationMinutes, estimateCents };
}
