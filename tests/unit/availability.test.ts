import { describe, expect, it } from "vitest";
import { generateCandidates, isCandidateFree, reservationInterval } from "../../server/modules/booking/availability";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "../../shared/domain";
import { wallTimeToInstants } from "../../shared/time";

const settings: BusinessSettings = DEFAULT_BUSINESS_SETTINGS;
const NOW = new Date("2026-10-12T12:00:00Z"); // Mon 08:00 EDT
const at = (date: string, time: string) => wallTimeToInstants(date, time, settings.timezone)[0];

describe("slot generation", () => {
  it("only offers starts that finish by closing time", () => {
    const { status, candidates } = generateCandidates("2026-10-14", settings, 180, NOW);
    expect(status).toBe("open");
    expect(candidates[0].localTime).toBe("08:00");
    expect(candidates[candidates.length - 1].localTime).toBe("15:00"); // 15:00 + 3h = 18:00 close
  });

  it("enforces lead time and horizon", () => {
    expect(generateCandidates("2026-10-12", settings, 180, NOW).status).toBe("outside_window");
    const tuesday = generateCandidates("2026-10-13", settings, 180, NOW);
    expect(tuesday.candidates[0].start.toISOString()).toBe("2026-10-13T12:00:00.000Z"); // exactly 24h later
    expect(generateCandidates("2026-12-12", settings, 180, NOW).status).toBe("outside_window"); // > 60 days
  });

  it("treats weekends and closed dates as closed", () => {
    expect(generateCandidates("2026-10-17", settings, 180, NOW).status).toBe("closed");
    const holiday = { ...settings, closedDates: ["2026-10-14"] };
    expect(generateCandidates("2026-10-14", holiday, 180, NOW).status).toBe("closed");
  });

  it("skips nonexistent times and keeps both repeated times on DST days", () => {
    const allDay = { ...settings, weeklyHours: { ...settings.weeklyHours, "0": [{ open: "00:00", close: "05:00" }] }, horizonDays: 400 };
    const spring = generateCandidates("2027-03-14", allDay, 60, new Date("2027-03-01T00:00:00Z"));
    expect(spring.candidates.map((c) => c.localTime)).not.toContain("02:00");
    expect(spring.candidates.map((c) => c.localTime)).not.toContain("02:30");
    const fall = generateCandidates("2026-11-01", allDay, 60, new Date("2026-10-20T00:00:00Z"));
    const repeated = fall.candidates.filter((c) => c.localTime === "01:30");
    expect(repeated.map((c) => c.zoneLabel)).toEqual(["EDT", "EST"]);
  });

  it("measures service length in elapsed time across a DST change", () => {
    const allDay = { ...settings, weeklyHours: { ...settings.weeklyHours, "0": [{ open: "00:00", close: "04:00" }] }, horizonDays: 400 };
    // 3 hours from 00:00 EDT on fall-back day ends at 02:00 EST (wall clock), within a 04:00 close.
    const fall = generateCandidates("2026-11-01", allDay, 180, new Date("2026-10-20T00:00:00Z"));
    const midnight = fall.candidates.find((c) => c.localTime === "00:00")!;
    expect(midnight.end.getTime() - midnight.start.getTime()).toBe(3 * 3600_000);
  });
});

describe("conflict detection with buffers", () => {
  const buffer = 30;
  const existing = reservationInterval(at("2026-10-14", "08:00"), at("2026-10-14", "11:00"), buffer); // 3h job + 30 min

  it("a 3-hour 08:00 job blocks every overlapping start, including the buffer", () => {
    const candidates = generateCandidates("2026-10-14", settings, 120, NOW).candidates;
    const free = candidates.filter((c) => isCandidateFree(c, buffer, [existing], [])).map((c) => c.localTime);
    for (const blocked of ["08:00", "09:00", "10:00", "11:00"]) expect(free).not.toContain(blocked);
    expect(free[0]).toBe("11:30");
  });

  it("pads candidates on both sides against external calendar events", () => {
    const external = { start: at("2026-10-14", "13:00"), end: at("2026-10-14", "14:00") };
    const candidates = generateCandidates("2026-10-14", settings, 60, NOW).candidates;
    const free = candidates.filter((c) => isCandidateFree(c, buffer, [], [external])).map((c) => c.localTime);
    expect(free).toContain("11:30"); // ends 12:30, +30 buffer = 13:00 boundary
    expect(free).not.toContain("12:00");
    expect(free).not.toContain("14:00"); // needs 30 min before
    expect(free).toContain("14:30");
  });
});
