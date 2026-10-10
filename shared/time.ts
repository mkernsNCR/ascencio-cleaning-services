// IANA-timezone helpers built on Intl. Business hours are local wall-clock rules; appointments are
// UTC instants. Never derive a local calendar day from toISOString().

export type LocalDate = string; // YYYY-MM-DD in the business timezone
export type WallTime = string; // HH:MM, 24-hour

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(instant: Date, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of the zone from UTC at the given instant, in minutes (e.g. -240 for EDT). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

function parseDate(date: LocalDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseTime(time: WallTime) {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Invalid wall time: ${time}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function isValidLocalDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { year, month, day } = parseDate(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * All instants at which the zone's wall clock reads `date time`.
 * Returns [] for nonexistent times (spring-forward gap) and two instants, earliest first,
 * for repeated times (fall-back overlap).
 */
export function wallTimeToInstants(date: LocalDate, time: WallTime, timeZone: string): Date[] {
  const { year, month, day } = parseDate(date);
  const { hour, minute } = parseTime(time);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set<number>();
  for (const probe of [naive - 86_400_000, naive, naive + 86_400_000]) {
    offsets.add(offsetMinutes(new Date(probe), timeZone));
  }
  const results: number[] = [];
  for (const off of offsets) {
    const candidate = naive - off * 60_000;
    const p = zonedParts(new Date(candidate), timeZone);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      if (!results.includes(candidate)) results.push(candidate);
    }
  }
  return results.sort((a, b) => a - b).map((t) => new Date(t));
}

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function localTimeOf(instant: Date, timeZone: string): WallTime {
  const p = zonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10); // safe: constructed at UTC midnight from a pure date
}

/** 0 = Sunday … 6 = Saturday, for a calendar date (independent of any timezone). */
export function dayOfWeek(date: LocalDate): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000,
  );
}

export function minutesOfWallTime(time: WallTime): number {
  const { hour, minute } = parseTime(time);
  return hour * 60 + minute;
}

export function wallTimeFromMinutes(total: number): WallTime {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Short zone label at an instant, e.g. "EDT"/"EST", to disambiguate repeated wall times. */
export function zoneAbbreviation(instant: Date, timeZone: string, locale = "en-US"): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}
