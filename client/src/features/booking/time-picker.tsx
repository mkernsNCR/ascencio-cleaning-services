import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AvailabilityDay, AvailabilityResponse, AvailabilitySlot } from "@shared/api";
import { addDays, dayOfWeek } from "@shared/time";
import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/forms/field";
import { useLocale, useMessages, intlLocale } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { formatDuration, formatLocalDate, formatTime, timeZoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bookingMessages } from "./messages";

export interface SelectedSlot {
  date: string;
  slot: AvailabilitySlot;
}

interface TimePickerProps {
  /** Stable cache key for the inputs that affect availability (service, size, ZIP…). */
  queryKey: unknown[];
  fetchAvailability: (from: string, to: string) => Promise<AvailabilityResponse>;
  selected: SelectedSlot | null;
  onSelect: (value: SelectedSlot | null) => void;
  /** Called when the response status is not "ok" so the parent can show the right fallback. */
  onStatus?: (response: AvailabilityResponse) => void;
  /** Shown when a previously selected slot disappeared on refresh. */
  onStale?: () => void;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(start: string) {
  const [y, m] = start.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

function shiftMonth(start: string, delta: number) {
  const [y, m] = start.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function TimePicker({ queryKey, fetchAvailability, selected, onSelect, onStatus, onStale }: TimePickerProps) {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages).time;
  const common = useMessages(commonMessages);
  const [month, setMonth] = useState<string | null>(selected ? monthStart(selected.date) : null);
  const [activeDate, setActiveDate] = useState<string | null>(selected?.date ?? null);
  const slotsRef = useRef<HTMLFieldSetElement>(null);

  // The first request has no month: start from "today" and let the server clamp the window.
  // Browser-local calendar date (en-CA formats as YYYY-MM-DD). Only seeds the first month to query;
  // the server clamps the range to the business timezone's booking window.
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), []);
  const from = month ?? monthStart(today);
  const to = monthEnd(from);

  const query = useQuery({
    queryKey: [...queryKey, "availability", from],
    queryFn: () => fetchAvailability(from, to),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;

  useEffect(() => {
    if (data && data.status !== "ok") onStatus?.(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status]);

  // Jump to the first month with bookable dates on first load.
  useEffect(() => {
    if (!month && data?.status === "ok") {
      const first = data.days.find((d) => d.slots.length > 0);
      setMonth(monthStart(first?.date ?? data.earliestDate));
    }
  }, [data, month]);

  const daysByDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);

  // Detect a stale selection after refresh (slot taken by someone else, or inputs changed).
  useEffect(() => {
    if (!selected || !data || data.status !== "ok") return;
    const day = daysByDate.get(selected.date);
    if (!day) return; // different month loaded
    if (!day.slots.some((s) => s.start === selected.slot.start)) {
      onSelect(null);
      onStale?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const deviceZone = browserTimeZone();
  const showLocal = !!data && !!deviceZone && deviceZone !== data.timezone;
  const activeDay: AvailabilityDay | undefined = activeDate ? daysByDate.get(activeDate) : undefined;

  const canPrev = !!data && month !== null && monthStart(data.earliestDate) < from;
  const canNext = !!data && monthEnd(from) < data.latestDate;

  // Calendar grid for the visible month.
  const grid = useMemo(() => {
    const cells: (string | null)[] = [];
    const lead = dayOfWeek(from);
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [from, to]);

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" });
    // 2023-01-01 was a Sunday
    return Array.from({ length: 7 }, (_, i) => ({ short: fmt.format(new Date(Date.UTC(2023, 0, 1 + i))), long: long.format(new Date(Date.UTC(2023, 0, 1 + i))) }));
  }, [locale]);

  const monthLabel = formatLocalDate(from, locale, { month: "long", year: "numeric" });
  const hasOpenDays = data?.days.some((d) => d.slots.length > 0);

  const chooseDay = (date: string) => {
    setActiveDate(date);
    requestAnimationFrame(() => slotsRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  };

  if (query.isError) {
    return (
      <LiveRegion assertive className="rounded-lg border border-destructive/40 bg-destructive-soft p-4">
        <p className="font-medium">{t.loadError}</p>
        <Button variant="outline" className="mt-3" onClick={() => query.refetch()}>{common.errors.retry}</Button>
      </LiveRegion>
    );
  }

  if (data && data.status !== "ok") return null; // parent renders the fallback

  return (
    <div className="space-y-6">
      {data && (
        <p className="text-sm text-muted-foreground">
          {t.timezoneNote(timeZoneLabel(data.timezone, locale))}{" "}
          {data.durationMinutes ? t.duration(formatDuration(data.durationMinutes, locale)) : null}
          {showLocal && <> {t.yourTime(deviceZone!)}</>}
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(from, -1))} disabled={!canPrev} aria-label={t.prevMonth}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h3 className="font-sans text-lg font-semibold capitalize" aria-live="polite">{monthLabel}</h3>
          <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(from, 1))} disabled={!canNext} aria-label={t.nextMonth}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <LiveRegion className="sr-only">{query.isFetching ? t.loading : ""}</LiveRegion>
        {query.isPending ? (
          <p className="py-10 text-center text-muted-foreground">{t.loading}</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-center">
            <caption className="sr-only">{monthLabel}</caption>
            <thead>
              <tr>
                {weekdayNames.map((w) => (
                  <th key={w.long} scope="col" className="pb-2 text-xs font-semibold uppercase text-muted-foreground">
                    <abbr title={w.long} className="no-underline">{w.short}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, wi) => (
                <tr key={wi}>
                  {week.map((date, di) => {
                    if (!date) return <td key={di} />;
                    const day = daysByDate.get(date);
                    const bookable = !!day && day.slots.length > 0;
                    const dayNum = Number(date.slice(8));
                    const isActive = activeDate === date;
                    const isSelected = selected?.date === date;
                    const statusText = !day || day.status === "outside_window" ? t.unavailable : day.status === "closed" ? t.closed : day.status === "full" ? t.fullShort : t.available;
                    const fullLabel = `${formatLocalDate(date, locale)}, ${statusText}`;
                    return (
                      <td key={di} className="p-0.5">
                        {bookable ? (
                          <button
                            type="button"
                            onClick={() => chooseDay(date)}
                            aria-pressed={isActive}
                            aria-label={fullLabel}
                            className={cn(
                              "relative mx-auto flex h-11 w-full max-w-12 items-center justify-center rounded-lg text-base font-semibold transition-colors",
                              isActive ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
                            )}
                          >
                            {dayNum}
                            {isSelected && !isActive && <span aria-hidden="true" className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-accent" />}
                          </button>
                        ) : (
                          <span
                            aria-label={fullLabel}
                            role="img"
                            className={cn(
                              "mx-auto flex h-11 w-full max-w-12 items-center justify-center rounded-lg text-base text-muted-foreground/70",
                              day?.status === "full" && "line-through",
                            )}
                          >
                            {dayNum}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && !hasOpenDays && !query.isPending && (
          <p className="mt-4 rounded-lg bg-surface-sunken p-3 text-sm">{t.noDates}</p>
        )}
      </div>

      <div aria-live="polite">
        {!activeDate || !activeDay ? (
          hasOpenDays ? <p className="text-muted-foreground">{t.selectDay}</p> : null
        ) : activeDay.slots.length === 0 ? (
          <p className="rounded-lg bg-warning-soft p-3 text-warning">{t.full}</p>
        ) : (
          <fieldset ref={slotsRef}>
            <legend className="mb-3 font-semibold">{t.slotsLegend(formatLocalDate(activeDate, locale))}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {activeDay.slots.map((slot) => {
                const checked = selected?.slot.start === slot.start;
                const repeated = activeDay.slots.filter((s) => s.localTime === slot.localTime).length > 1;
                return (
                  <label
                    key={slot.start}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface hover:border-primary",
                    )}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot.start}
                      checked={checked}
                      onChange={() => onSelect({ date: activeDate, slot })}
                      className="sr-only"
                    />
                    <span className="font-semibold">
                      {formatTime(slot.start, data!.timezone, locale)}
                      {repeated && <span className="ml-1 text-xs">{slot.zoneLabel}</span>}
                    </span>
                    {showLocal && (
                      <span className={cn("text-xs", checked ? "text-primary-foreground/90" : "text-muted-foreground")}>
                        {formatTime(slot.start, deviceZone!, locale, true)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
