import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, localDateOf, wallTimeToInstants, zoneAbbreviation } from "../../shared/time";
import { calculateEstimate } from "../../server/modules/booking/estimate";
import { DEFAULT_PRICING_RULES, isPostalCodeCovered, normalizeUsPhone, DEFAULT_BUSINESS_SETTINGS } from "../../shared/domain";

const NY = "America/New_York";

describe("timezone helpers", () => {
  it("converts ordinary wall time to a single UTC instant", () => {
    expect(wallTimeToInstants("2026-10-14", "08:00", NY).map((d) => d.toISOString())).toEqual(["2026-10-14T12:00:00.000Z"]);
    expect(wallTimeToInstants("2026-12-14", "08:00", NY).map((d) => d.toISOString())).toEqual(["2026-12-14T13:00:00.000Z"]);
  });

  it("returns no instant for a nonexistent spring-forward time", () => {
    expect(wallTimeToInstants("2026-03-08", "02:30", NY)).toEqual([]);
  });

  it("returns both instants for a repeated fall-back time, labelled distinctly", () => {
    const instants = wallTimeToInstants("2026-11-01", "01:30", NY);
    expect(instants.map((d) => d.toISOString())).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
    expect(zoneAbbreviation(instants[0], NY)).toBe("EDT");
    expect(zoneAbbreviation(instants[1], NY)).toBe("EST");
  });

  it("derives the business-local date rather than the UTC date", () => {
    // 01:00 UTC on Oct 15 is still Oct 14 in New York.
    expect(localDateOf(new Date("2026-10-15T01:00:00Z"), NY)).toBe("2026-10-14");
    expect(new Date("2026-10-15T01:00:00Z").toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("does date arithmetic without timezone drift", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayOfWeek("2026-10-12")).toBe(1);
  });
});

describe("authoritative estimate", () => {
  it("prices the base residential job from the rules", () => {
    expect(calculateEstimate("standard", { bedrooms: 1, bathrooms: 1 }, DEFAULT_PRICING_RULES))
      .toEqual({ serviceId: "standard", quoteRequired: false, durationMinutes: 180, estimateCents: 12000 });
  });

  it("adds rooms and rounds duration to the configured step", () => {
    const e = calculateEstimate("standard", { bedrooms: 3, bathrooms: 2 }, DEFAULT_PRICING_RULES);
    // 180 + 2*45 + 30 = 300 minutes; 12000 + 2*3600 + 2000 cents
    expect(e.durationMinutes).toBe(300);
    expect(e.estimateCents).toBe(21200);
  });

  it("routes quote-only services and oversized jobs to a quote", () => {
    expect(calculateEstimate("commercial", { bedrooms: 1, bathrooms: 1 }, DEFAULT_PRICING_RULES).quoteRequired).toBe(true);
    expect(calculateEstimate("post_construction", { bedrooms: 1, bathrooms: 1 }, DEFAULT_PRICING_RULES).quoteRequired).toBe(true);
    expect(calculateEstimate("move", { bedrooms: 6, bathrooms: 5 }, DEFAULT_PRICING_RULES).quoteRequired).toBe(true);
  });

  it("rejects out-of-range property inputs", () => {
    expect(() => calculateEstimate("standard", { bedrooms: 99, bathrooms: 1 }, DEFAULT_PRICING_RULES)).toThrow();
    expect(() => calculateEstimate("standard", { bedrooms: 1.5, bathrooms: 1 }, DEFAULT_PRICING_RULES)).toThrow();
  });
});

describe("input normalization", () => {
  it("normalizes US phone numbers and rejects invalid ones", () => {
    expect(normalizeUsPhone("(240) 355-3108")).toBe("+12403553108");
    expect(normalizeUsPhone("1-240-355-3108")).toBe("+12403553108");
    expect(normalizeUsPhone("555-1234")).toBeNull();
    expect(normalizeUsPhone("(040) 355-3108")).toBeNull();
  });

  it("checks coverage by ZIP prefix with explicit exclusions", () => {
    const coverage = { ...DEFAULT_BUSINESS_SETTINGS.coverage, excludedPostalCodes: ["20001"] };
    expect(isPostalCodeCovered("20910", coverage)).toBe(true);
    expect(isPostalCodeCovered("20001", coverage)).toBe(false);
    expect(isPostalCodeCovered("10001", coverage)).toBe(false);
  });
});
