import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { BusinessSettings, OpeningWindow } from "@shared/domain";
import { isValidLocalDate, isValidTimeZone, minutesOfWallTime } from "@shared/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, LiveRegion } from "@/components/forms/field";
import { adminKeys, errorCode, errorFields, errorMessage, useAdmin } from "./admin-api";
import { fmtDateTime } from "./admin-format";
import type { LoadedSettingsResponse, SettingsResponse } from "./types";
import { Card, ConfirmDialog, NativeSelect, Notice, PageHeader, Pill, QueryState } from "./ui";
import { PricingSection } from "./pricing-section";
import { formatLocalDate } from "@/lib/format";

export default function SettingsPage() {
  const { get } = useAdmin();
  const q = useQuery({ queryKey: adminKeys.settings, queryFn: () => get<SettingsResponse>("/api/admin/settings") });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && window.location.hash === "#pricing") {
      const t = window.setTimeout(() => document.getElementById("pricing")?.scrollIntoView({ block: "start" }), 200);
      return () => window.clearTimeout(t);
    }
  }, [q.data]);

  return (
    <>
      <PageHeader title="Settings" description="Business rules that drive availability, policies and customer messaging, plus price versions." />
      <LiveRegion className="empty:hidden">
        {notice && (
          <div className="mb-6 flex items-start gap-2">
            <Notice tone="success" className="flex-1">{notice}</Notice>
            <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
          </div>
        )}
      </LiveRegion>
      <QueryState query={q} loadingLabel="Loading settings…">
        {(data) => (
          <div className="flex flex-col gap-8">
            <BusinessSettingsForm key={data.version} data={data} onReload={() => q.refetch()} onNotice={setNotice} />
            <PricingSection versions={data.pricing} />
          </div>
        )}
      </QueryState>
    </>
  );
}

// ------------------------------------------------------------------------------------------------

type DayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "1", label: "Monday" }, { key: "2", label: "Tuesday" }, { key: "3", label: "Wednesday" }, { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" }, { key: "6", label: "Saturday" }, { key: "0", label: "Sunday" },
];

const NUMBERS = {
  leadTimeHours: { label: "Minimum notice (hours)", min: 0, max: 336, hint: "How far ahead a customer must book." },
  horizonDays: { label: "Booking horizon (days)", min: 1, max: 365, hint: "How far into the future customers can book." },
  bufferMinutes: { label: "Travel / setup buffer (minutes)", min: 0, max: 240, hint: "Blocked before and after each appointment." },
  pendingExpiryHours: { label: "Pending request expiry (hours)", min: 1, max: 168, hint: "Undecided requests expire and release their slot after this." },
  ownerExpiryWarningHours: { label: "Owner expiry warning (hours before)", min: 0, max: 48, hint: "Email reminder to decide before a request expires. 0 = none." },
  reminderHoursBefore: { label: "Customer reminder (hours before)", min: 0, max: 168, hint: "0 = no reminder." },
  cancellationCutoffHours: { label: "Online cancellation cutoff (hours)", min: 0, max: 336, hint: "Customers must call inside this window." },
  rescheduleCutoffHours: { label: "Online reschedule cutoff (hours)", min: 0, max: 336, hint: "Customers must call inside this window." },
} as const;
type NumKey = keyof typeof NUMBERS;

interface FormState {
  timezone: string;
  weeklyHours: Record<DayKey, OpeningWindow[]>;
  closedDates: string[];
  numbers: Record<NumKey, string>;
  slotIncrementMinutes: string;
  postalPrefixes: string;
  postalCodes: string;
  excludedPostalCodes: string;
  promiseEn: string;
  promiseEs: string;
}

function toForm(s: BusinessSettings): FormState {
  const numbers = {} as Record<NumKey, string>;
  for (const k of Object.keys(NUMBERS) as NumKey[]) numbers[k] = String(s[k]);
  return {
    timezone: s.timezone,
    weeklyHours: { ...s.weeklyHours },
    closedDates: [...s.closedDates].sort(),
    numbers,
    slotIncrementMinutes: String(s.slotIncrementMinutes),
    postalPrefixes: s.coverage.postalPrefixes.join(", "),
    postalCodes: s.coverage.postalCodes.join(", "),
    excludedPostalCodes: s.coverage.excludedPostalCodes.join(", "),
    promiseEn: s.responsePromise?.en ?? "",
    promiseEs: s.responsePromise?.es ?? "",
  };
}

const splitList = (text: string) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

/** Mirrors businessSettingsSchema. Returns field errors keyed like the server's zod paths. */
function build(f: FormState): { settings?: BusinessSettings; errors: Record<string, string> } {
  const e: Record<string, string> = {};
  const tz = f.timezone.trim();
  if (!tz || !isValidTimeZone(tz)) e.timezone = "Enter a valid IANA time zone, e.g. America/New_York.";

  for (const { key, label } of DAYS) {
    const windows = f.weeklyHours[key];
    if (windows.length > 3) e[`weeklyHours.${key}`] = `${label}: at most 3 windows.`;
    windows.forEach((w, i) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.close)) {
        e[`weeklyHours.${key}.${i}`] = "Enter both opening and closing times.";
      } else if (minutesOfWallTime(w.close) <= minutesOfWallTime(w.open)) {
        e[`weeklyHours.${key}.${i}`] = "Closing time must be after opening time.";
      }
    });
    const sorted = [...windows].filter((w) => w.open && w.close).sort((a, b) => a.open.localeCompare(b.open));
    for (let i = 1; i < sorted.length; i++) {
      if (minutesOfWallTime(sorted[i].open) < minutesOfWallTime(sorted[i - 1].close) && !e[`weeklyHours.${key}`]) {
        e[`weeklyHours.${key}`] = `${label}: windows overlap.`;
      }
    }
  }

  if (f.closedDates.length > 400) e.closedDates = "At most 400 closed dates.";
  if (f.closedDates.some((d) => !isValidLocalDate(d))) e.closedDates = "Closed dates must be valid YYYY-MM-DD dates.";

  const nums = {} as Record<NumKey, number>;
  for (const k of Object.keys(NUMBERS) as NumKey[]) {
    const { min, max } = NUMBERS[k];
    const raw = f.numbers[k].trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < min || n > max) e[k] = `Enter a whole number from ${min} to ${max}.`;
    nums[k] = n;
  }
  const slot = Number(f.slotIncrementMinutes);
  if (![15, 30, 60].includes(slot)) e.slotIncrementMinutes = "Choose 15, 30, or 60.";

  const prefixes = splitList(f.postalPrefixes);
  const codes = splitList(f.postalCodes);
  const excluded = splitList(f.excludedPostalCodes);
  const badPrefix = prefixes.filter((p) => !/^\d{1,5}$/.test(p));
  if (badPrefix.length) e["coverage.postalPrefixes"] = `Prefixes must be 1–5 digits. Invalid: ${badPrefix.slice(0, 5).join(", ")}`;
  else if (prefixes.length > 500) e["coverage.postalPrefixes"] = "At most 500 prefixes.";
  const badCode = codes.filter((p) => !/^\d{5}$/.test(p));
  if (badCode.length) e["coverage.postalCodes"] = `ZIP codes must be exactly 5 digits. Invalid: ${badCode.slice(0, 5).join(", ")}`;
  else if (codes.length > 2000) e["coverage.postalCodes"] = "At most 2000 ZIP codes.";
  const badEx = excluded.filter((p) => !/^\d{5}$/.test(p));
  if (badEx.length) e["coverage.excludedPostalCodes"] = `ZIP codes must be exactly 5 digits. Invalid: ${badEx.slice(0, 5).join(", ")}`;
  else if (excluded.length > 2000) e["coverage.excludedPostalCodes"] = "At most 2000 ZIP codes.";

  const en = f.promiseEn.trim();
  const es = f.promiseEs.trim();
  if ((en && !es) || (!en && es)) e.responsePromise = "Provide both English and Spanish text, or leave both empty.";
  if (en.length > 300) e["responsePromise.en"] = "At most 300 characters.";
  if (es.length > 300) e["responsePromise.es"] = "At most 300 characters.";

  if (Object.keys(e).length) return { errors: e };
  const weeklyHours = {} as Record<DayKey, OpeningWindow[]>;
  for (const { key } of DAYS) weeklyHours[key] = [...f.weeklyHours[key]].sort((a, b) => a.open.localeCompare(b.open));
  return {
    errors: e,
    settings: {
      timezone: tz,
      weeklyHours,
      closedDates: Array.from(new Set(f.closedDates)).sort(),
      ...nums,
      slotIncrementMinutes: slot,
      coverage: { postalPrefixes: Array.from(new Set(prefixes)), postalCodes: Array.from(new Set(codes)), excludedPostalCodes: Array.from(new Set(excluded)) },
      responsePromise: en && es ? { en, es } : null,
    },
  };
}

function useTimeZones() {
  return useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [];
    }
  }, []);
}

function BusinessSettingsForm({ data, onReload, onNotice }: { data: SettingsResponse; onReload: () => void; onNotice: (text: string) => void }) {
  const { post } = useAdmin();
  const qc = useQueryClient();
  const initial = useMemo(() => toForm(data.settings), [data.settings]);
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "danger" | "warning"; text: string; stale?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const zones = useTimeZones();
  const errBase = useId();
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const err = (key: string) => errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1];
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const setNum = (k: NumKey, v: string) => setF((prev) => ({ ...prev, numbers: { ...prev.numbers, [k]: v } }));
  const setDay = (day: DayKey, windows: OpeningWindow[]) => setF((prev) => ({ ...prev, weeklyHours: { ...prev.weeklyHours, [day]: windows } }));

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: adminKeys.settings }), qc.invalidateQueries({ queryKey: adminKeys.overview })]);

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    const { settings, errors: e } = build(f);
    setErrors(e);
    if (!settings) {
      setStatus({ tone: "danger", text: "Some values need fixing before saving. Check the highlighted fields." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await post<LoadedSettingsResponse>("/api/admin/settings", { settings, version: data.version });
      onNotice("Settings saved. They are now proposed and need owner approval.");
      await refresh();
    } catch (e2) {
      const fields = errorFields(e2);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) mapped[k.replace(/^settings\./, "")] = v;
      setErrors(mapped);
      const stale = errorCode(e2) === "stale_version";
      setStatus({
        tone: stale ? "warning" : "danger",
        text: stale ? "Settings were changed in another session since you opened this page. Load the latest version (your unsaved edits will be discarded) and re-apply your changes." : errorMessage(e2),
        stale,
      });
      setSaving(false);
    }
  };

  const addDate = () => {
    if (!isValidLocalDate(newDate)) {
      setErrors((prev) => ({ ...prev, closedDates: "Pick a valid date." }));
      return;
    }
    if (!f.closedDates.includes(newDate)) set("closedDates", [...f.closedDates, newDate].sort());
    setNewDate("");
    setErrors(({ closedDates: _c, ...rest }) => rest);
  };

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6" aria-labelledby="biz-h">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="biz-h" className="font-sans text-xl font-semibold">Business settings</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.approvedAt ? (
                <Pill tone="success">Approved {fmtDateTime(data.approvedAt, data.settings.timezone)}</Pill>
              ) : (
                <Pill tone="warning">PROPOSED — not approved by the owner</Pill>
              )}
              <span className="text-sm text-muted-foreground">Version {data.version}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Values are proposed until the owner approves them. Saving any change clears the approval, so the owner must approve again.
            </p>
          </div>
          <Button type="button" size="lg" onClick={() => setApproveOpen(true)} disabled={dirty || !!data.approvedAt}>
            {data.approvedAt ? "Current settings approved" : "Approve current settings"}
          </Button>
        </div>
        {dirty && !data.approvedAt && <p className="mt-2 text-sm text-warning">Save your changes before approving.</p>}
      </Card>

      <Card title="Time zone">
        <Field label="Business time zone (IANA)" hint="All hours, dates and appointment times use this zone." error={err("timezone")} className="max-w-md">
          <Input list="tz-options" value={f.timezone} onChange={(e) => set("timezone", e.target.value)} autoComplete="off" />
        </Field>
        <datalist id="tz-options">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      </Card>

      <Card title="Weekly hours" description="Up to three open windows per day, in local time. A day with no windows is closed.">
        <div className="flex flex-col divide-y">
          {DAYS.map(({ key, label }) => {
            const windows = f.weeklyHours[key];
            return (
              <fieldset key={key} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr]">
                <legend className="sr-only">{label} hours</legend>
                <p aria-hidden="true" className="pt-2 font-semibold">{label}</p>
                <div className="flex flex-col gap-2">
                  {windows.length === 0 && <p className="pt-2 text-muted-foreground">Closed</p>}
                  {windows.map((w, i) => {
                    const wErr = errors[`weeklyHours.${key}.${i}`];
                    return (
                      <div key={i} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold">
                          {label} window {i + 1} opens
                          <Input type="time" step={900} className="w-36" value={w.open} aria-invalid={!!wErr || undefined} aria-describedby={wErr ? `${errBase}-${key}-${i}` : undefined}
                            onChange={(e) => setDay(key, windows.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold">
                          closes
                          <Input type="time" step={900} className="w-36" value={w.close} aria-invalid={!!wErr || undefined} aria-describedby={wErr ? `${errBase}-${key}-${i}` : undefined}
                            onChange={(e) => setDay(key, windows.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                        </label>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setDay(key, windows.filter((_, j) => j !== i))}>
                          <Trash2 aria-hidden="true" /><span className="sr-only">Remove {label} window {i + 1}</span>
                        </Button>
                        {wErr && <p id={`${errBase}-${key}-${i}`} className="w-full text-sm font-medium text-destructive">{wErr}</p>}
                      </div>
                    );
                  })}
                  {errors[`weeklyHours.${key}`] && <p className="text-sm font-medium text-destructive">{errors[`weeklyHours.${key}`]}</p>}
                  {windows.length < 3 && (
                    <Button type="button" variant="link" className="self-start px-0" onClick={() => setDay(key, [...windows, windows.length ? { open: "13:00", close: "17:00" } : { open: "08:00", close: "18:00" }])}>
                      <Plus aria-hidden="true" /> Add {label} window
                    </Button>
                  )}
                </div>
              </fieldset>
            );
          })}
        </div>
      </Card>

      <Card title="Closed dates" description="Holidays and closures (local dates). No appointments are offered on these days.">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Date to close" error={err("closedDates")}>
            <Input type="date" className="w-48" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDate(); } }} />
          </Field>
          <Button type="button" variant="outline" onClick={addDate} disabled={!newDate}>Add date</Button>
        </div>
        {f.closedDates.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No closed dates.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {f.closedDates.map((d) => (
              <li key={d} className="flex items-center gap-1 rounded-full border bg-surface-sunken py-0.5 pl-3 pr-1 text-sm">
                {isValidLocalDate(d) ? formatLocalDate(d, "en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : d}
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => set("closedDates", f.closedDates.filter((x) => x !== d))}>
                  <Trash2 aria-hidden="true" className="!size-4" /><span className="sr-only">Remove {d}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Scheduling and policy">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(NUMBERS) as NumKey[]).map((k) => (
            <Field key={k} label={NUMBERS[k].label} hint={NUMBERS[k].hint} error={err(k)}>
              <Input type="number" inputMode="numeric" min={NUMBERS[k].min} max={NUMBERS[k].max} value={f.numbers[k]} onChange={(e) => setNum(k, e.target.value)} />
            </Field>
          ))}
          <Field label="Start-time increment" hint="Spacing between offered start times." error={err("slotIncrementMinutes")}>
            <NativeSelect value={f.slotIncrementMinutes} onChange={(e) => set("slotIncrementMinutes", e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </NativeSelect>
          </Field>
        </div>
      </Card>

      <Card title="Service area" description="A ZIP is covered if it is listed explicitly or starts with a listed prefix, and is not excluded. Separate entries with commas, spaces, or new lines.">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="ZIP prefixes" hint="1–5 digits, e.g. 200 covers 200xx." error={err("coverage.postalPrefixes")}>
            <Textarea rows={4} value={f.postalPrefixes} onChange={(e) => set("postalPrefixes", e.target.value)} />
          </Field>
          <Field label="Additional ZIP codes" hint="Exactly 5 digits." error={err("coverage.postalCodes")}>
            <Textarea rows={4} value={f.postalCodes} onChange={(e) => set("postalCodes", e.target.value)} />
          </Field>
          <Field label="Excluded ZIP codes" hint="Never covered, even if a prefix matches." error={err("coverage.excludedPostalCodes")}>
            <Textarea rows={4} value={f.excludedPostalCodes} onChange={(e) => set("excludedPostalCodes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Response promise" description="Optional text shown to customers after they submit a request, e.g. “We reply within one business day.” Leave both empty to show no promise. Must match real operations.">
        {err("responsePromise") && !errors["responsePromise.en"] && !errors["responsePromise.es"] && (
          <p className="mb-3 text-sm font-medium text-destructive">{err("responsePromise")}</p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="English" optionalLabel="optional" error={errors["responsePromise.en"]}>
            <Textarea rows={2} maxLength={300} value={f.promiseEn} onChange={(e) => set("promiseEn", e.target.value)} />
          </Field>
          <Field label="Spanish" optionalLabel="optional" error={errors["responsePromise.es"]}>
            <Textarea rows={2} maxLength={300} value={f.promiseEs} onChange={(e) => set("promiseEs", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" size="lg" disabled={saving || !dirty}>
          {saving && <Loader2 aria-hidden="true" className="animate-spin" />} Save settings
        </Button>
        <Button type="button" variant="outline" disabled={saving || !dirty} onClick={() => { setF(initial); setErrors({}); setStatus(null); }}>
          Discard changes
        </Button>
        <span className="text-sm text-muted-foreground">{dirty ? "Unsaved changes. Saving clears owner approval." : "No unsaved changes."}</span>
        <LiveRegion className="w-full empty:hidden">
          {status && (
            <Notice tone={status.tone}>
              {status.text}
              {status.stale && (
                <Button type="button" size="sm" variant="outline" className="ml-2 mt-2" onClick={onReload}>Load latest settings</Button>
              )}
            </Notice>
          )}
        </LiveRegion>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve current settings?"
        description="Confirm that the hours, time zone, notice and cutoff policies, service area and response promise shown on this page are correct for real customers."
        confirmLabel="Approve settings"
        errorOverrides={{ stale_version: "Settings changed since this page loaded. Reload to review the latest values before approving." }}
        onConfirm={async () => {
          try {
            await post<LoadedSettingsResponse>("/api/admin/settings/approve", { version: data.version });
            onNotice("Settings approved. Customers will see availability based on these values.");
          } finally {
            await refresh();
          }
        }}
      />
    </form>
  );
}
