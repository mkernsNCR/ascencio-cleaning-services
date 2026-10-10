import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, LiveRegion } from "@/components/forms/field";
import { adminKeys, errorFields, errorMessage, useAdmin, useBusinessTimezone } from "./admin-api";
import { fmtDateTime } from "./admin-format";
import type { CalendarListEntry, GoogleStatus, Resource, SettingsResponse } from "./types";
import { Card, ConfirmDialog, DataList, Empty, NativeSelect, Notice, PageHeader, Pill, QueryState } from "./ui";

type Status = { tone: "success" | "danger" | "info"; text: string } | null;

export default function IntegrationsPage() {
  const [status, setStatus] = useState<Status>(null);
  return (
    <>
      <PageHeader title="Integrations" description="Google Calendar connection and the calendars each crew uses." />
      <LiveRegion className="empty:hidden">{status && <Notice tone={status.tone} className="mb-6">{status.text}</Notice>}</LiveRegion>
      <div className="flex flex-col gap-8">
        <GoogleCard onStatus={setStatus} />
        <Crews onStatus={setStatus} />
      </div>
    </>
  );
}

function GoogleCard({ onStatus }: { onStatus: (s: Status) => void }) {
  const { get, post } = useAdmin();
  const qc = useQueryClient();
  const tz = useBusinessTimezone();
  const q = useQuery({ queryKey: adminKeys.googleStatus, queryFn: () => get<GoogleStatus>("/api/admin/google/status") });
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: adminKeys.googleStatus }),
    qc.invalidateQueries({ queryKey: adminKeys.googleCalendars }),
    qc.invalidateQueries({ queryKey: adminKeys.overview }),
  ]);

  const connect = async () => {
    setBusy("connect");
    try {
      const { url } = await post<{ url: string }>("/api/admin/google/connect");
      onStatus({ tone: "info", text: "Redirecting to Google…" });
      window.location.assign(url);
    } catch (e) {
      onStatus({ tone: "danger", text: errorMessage(e) });
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    try {
      await post("/api/admin/google/sync-now");
      onStatus({ tone: "success", text: "Sync queued. Results appear on the Overview and Attention pages in a minute or two." });
    } catch (e) {
      onStatus({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  return (
    <Card title="Google Calendar" description="Bookings are confirmed only after their event is created in Google Calendar. Busy times on configured calendars block availability.">
      <QueryState query={q}>
        {(g) => {
          const connected = g.status === "connected";
          return (
            <>
              {g.mode === "fake" && (
                <Notice tone="danger" role="alert" title="Fake calendar mode" className="mb-4">
                  The server is using a simulated calendar (development). No real Google events are created and real busy times are ignored. Set GOOGLE_CALENDAR_MODE=google for production.
                </Notice>
              )}
              {g.mode === "google" && !g.configured && (
                <Notice tone="danger" title="OAuth not configured" className="mb-4">
                  Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY on the server before connecting.
                </Notice>
              )}
              {g.mode === "google" && g.configured && !connected && (
                <Notice tone="warning" title="Not connected" className="mb-4">
                  New approvals cannot be confirmed until a Google account is connected.
                </Notice>
              )}
              <DataList items={[
                ["Status", <Pill tone={connected ? "success" : "danger"}>{g.status}</Pill>],
                ["Mode", g.mode === "fake" ? "Fake (development)" : "Google"],
                ["Account", g.accountEmail ?? "—"],
                ["Connected", g.connectedAt ? fmtDateTime(g.connectedAt, tz) : "—"],
                ["Permissions", g.scopes.length ? <ul className="text-sm">{g.scopes.map((s) => <li key={s} className="break-all">{s.replace("https://www.googleapis.com/auth/", "")}</li>)}</ul> : "—"],
                ...(g.lastError ? [["Last error", <span className="text-destructive">{g.lastError}</span>] as [string, ReactNode]] : []),
              ]} />
              <div className="mt-5 flex flex-wrap gap-2">
                {g.mode === "google" && (
                  <Button onClick={connect} disabled={busy !== null || !g.configured}>
                    {busy === "connect" && <Loader2 aria-hidden="true" className="animate-spin" />}
                    {connected ? "Reconnect Google account" : "Connect Google account"}
                  </Button>
                )}
                <Button variant="outline" onClick={syncNow} disabled={busy !== null || !connected}>
                  {busy === "sync" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />} Sync now
                </Button>
                {g.mode === "google" && connected && (
                  <Button variant="destructive" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}>Disconnect</Button>
                )}
              </div>
            </>
          );
        }}
      </QueryState>
      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Google Calendar?"
        description="The stored Google credential is revoked and deleted. Until you reconnect, new requests cannot be confirmed, availability that depends on Google busy times is blocked, and calendar changes are not synced. Existing bookings are not changed."
        confirmLabel="Disconnect"
        destructive
        onConfirm={async () => {
          try {
            await post("/api/admin/google/disconnect");
            onStatus({ tone: "success", text: "Google Calendar disconnected." });
          } finally {
            void refresh();
          }
        }}
      />
    </Card>
  );
}

function Crews({ onStatus }: { onStatus: (s: Status) => void }) {
  const { get } = useAdmin();
  const settings = useQuery({ queryKey: adminKeys.settings, queryFn: () => get<SettingsResponse>("/api/admin/settings") });
  const calendars = useQuery({ queryKey: adminKeys.googleCalendars, queryFn: () => get<CalendarListEntry[]>("/api/admin/google/calendars"), retry: false });
  const [adding, setAdding] = useState(false);

  return (
    <Card
      title="Crews"
      description="Each crew is scheduled independently: it has its own destination calendar (where confirmed bookings are written) and busy calendars (whose events block that crew's availability). Customers see a time if any active crew is free."
      actions={!adding && <Button variant="outline" onClick={() => setAdding(true)}>Add crew</Button>}
    >
      {calendars.isError && (
        <Notice tone="warning" className="mb-4" title="Could not list Google calendars">
          {errorMessage(calendars.error)} You can still type calendar IDs manually (find them in Google Calendar → Settings → Integrate calendar).{" "}
          <button type="button" className="font-semibold text-primary underline" onClick={() => calendars.refetch()}>Try listing again</button>
        </Notice>
      )}
      {adding && (
        <div className="mb-6 rounded-lg border-2 border-primary/30 p-4">
          <h3 className="mb-3 font-sans font-semibold">New crew</h3>
          <CrewForm
            calendars={calendars.data}
            initial={{ name: "", active: true, sortOrder: (settings.data?.resources.length ?? 0), destinationCalendar: null, busyCalendars: [] }}
            submitLabel="Create crew"
            onCancel={() => setAdding(false)}
            onDone={(name) => { setAdding(false); onStatus({ tone: "success", text: `Crew “${name}” created.` }); }}
          />
        </div>
      )}
      <QueryState query={settings}>
        {(s) => s.resources.length === 0 ? <Empty>No crews yet. Add one to start taking bookings.</Empty> : (
          <ul className="flex flex-col gap-4">
            {s.resources.map((r) => <CrewItem key={r.id} resource={r} calendars={calendars.data} onStatus={onStatus} />)}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

function calendarName(id: string | null, calendars?: CalendarListEntry[]) {
  if (!id) return "None";
  const c = calendars?.find((x) => x.id === id);
  return c ? `${c.summary}${c.primary ? " (primary)" : ""}` : id;
}

function CrewItem({ resource: r, calendars, onStatus }: { resource: Resource; calendars?: CalendarListEntry[]; onStatus: (s: Status) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-semibold">{r.name}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            <Pill tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Inactive"}</Pill>
            {!r.destinationCalendar && <Pill tone="warning">No destination calendar</Pill>}
          </div>
        </div>
        {!editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${r.name}`}>Edit</Button>}
      </div>
      {editing ? (
        <div className="mt-4">
          <CrewForm
            id={r.id}
            calendars={calendars}
            initial={r}
            submitLabel="Save crew"
            onCancel={() => setEditing(false)}
            onDone={(name) => { setEditing(false); onStatus({ tone: "success", text: `Crew “${name}” saved. Calendar watches will be renewed.` }); }}
          />
        </div>
      ) : (
        <DataList className="mt-3 text-sm" items={[
          ["Destination calendar", <span className="break-all">{calendarName(r.destinationCalendar, calendars)}</span>],
          ["Busy calendars", r.busyCalendars.length ? <ul>{r.busyCalendars.map((c) => <li key={c} className="break-all">{calendarName(c, calendars)}</li>)}</ul> : "Destination only"],
          ["Sort order", String(r.sortOrder)],
        ]} />
      )}
    </li>
  );
}

type CrewValues = Pick<Resource, "name" | "active" | "sortOrder" | "destinationCalendar" | "busyCalendars">;
const MANUAL = "__manual__";
const writable = (c: CalendarListEntry) => c.accessRole === "owner" || c.accessRole === "writer";

function splitIds(text: string) {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

function CrewForm({ id, initial, calendars, submitLabel, onCancel, onDone }: {
  id?: number; initial: CrewValues; calendars?: CalendarListEntry[]; submitLabel: string; onCancel: () => void; onDone: (name: string) => void;
}) {
  const { post } = useAdmin();
  const qc = useQueryClient();
  const formId = useId();
  const listed = new Set(calendars?.map((c) => c.id) ?? []);
  const [name, setName] = useState(initial.name);
  const [active, setActive] = useState(initial.active);
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder));
  const initialManual = !calendars || (!!initial.destinationCalendar && !listed.has(initial.destinationCalendar));
  const [destMode, setDestMode] = useState<"list" | "manual">(initialManual ? "manual" : "list");
  const [dest, setDest] = useState(initial.destinationCalendar ?? "");
  const [busy, setBusy] = useState<string[]>(initial.busyCalendars.filter((c) => listed.has(c)));
  const [extraBusy, setExtraBusy] = useState(initial.busyCalendars.filter((c) => !listed.has(c)).join("\n"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const useList = !!calendars && destMode === "list";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const busyCalendars = Array.from(new Set([...busy, ...splitIds(extraBusy)]));
    const order = Number(sortOrder);
    const v: Record<string, string> = {};
    if (!name.trim() || name.trim().length > 80) v.name = "Enter a name of 1–80 characters.";
    if (!Number.isInteger(order) || order < 0 || order > 100) v.sortOrder = "Use a whole number from 0 to 100.";
    if (dest.trim().length > 300) v.destinationCalendar = "Calendar ID is too long.";
    if (busyCalendars.length > 10) v.busyCalendars = "Choose at most 10 busy calendars.";
    if (busyCalendars.some((c) => c.length > 300)) v.busyCalendars = "A calendar ID is too long.";
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setPending(true);
    try {
      const body = { name: name.trim(), active, sortOrder: order, destinationCalendar: dest.trim() || null, busyCalendars };
      await post(id ? `/api/admin/resources/${id}` : "/api/admin/resources", body);
      await qc.invalidateQueries({ queryKey: adminKeys.settings });
      onDone(body.name);
    } catch (err) {
      const f = errorFields(err);
      const mapped: Record<string, string> = {};
      for (const [k, msg] of Object.entries(f)) mapped[k.split(".")[0]] = msg;
      setErrors(mapped);
      setFormError(errorMessage(err));
      setPending(false);
    }
  };

  const destSelected = calendars?.find((c) => c.id === dest);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
      <Field label="Crew name" error={errors.name}>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Sort order" hint="Lower numbers are offered first (0–100)." error={errors.sortOrder}>
        <Input type="number" inputMode="numeric" min={0} max={100} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3 md:col-span-2">
        <Checkbox id={`${formId}-active`} checked={active} onCheckedChange={(c) => setActive(c === true)} />
        <label htmlFor={`${formId}-active`} className="font-semibold">Active (available for new bookings)</label>
      </div>

      <div className="md:col-span-2">
        {useList ? (
          <Field
            label="Destination calendar"
            hint="Confirmed bookings for this crew are written here. Requires owner or writer access."
            error={errors.destinationCalendar}
          >
            <NativeSelect
              value={dest}
              onChange={(e) => {
                if (e.target.value === MANUAL) setDestMode("manual");
                else setDest(e.target.value);
              }}
            >
              <option value="">— None (crew cannot be confirmed) —</option>
              {calendars!.map((c) => (
                <option key={c.id} value={c.id} disabled={!writable(c)}>
                  {c.summary}{c.primary ? " (primary)" : ""}{writable(c) ? "" : ` — ${c.accessRole}, cannot write`}
                </option>
              ))}
              <option value={MANUAL}>Enter a calendar ID manually…</option>
            </NativeSelect>
          </Field>
        ) : (
          <Field
            label="Destination calendar ID"
            hint="Confirmed bookings are written here; the connected account needs owner or writer access. Leave empty for none."
            error={errors.destinationCalendar}
          >
            <Input value={dest} maxLength={300} onChange={(e) => setDest(e.target.value)} placeholder="name@group.calendar.google.com" />
          </Field>
        )}
        {calendars && destMode === "manual" && (
          <button type="button" className="mt-1 text-sm font-semibold text-primary underline" onClick={() => { setDestMode("list"); if (!listed.has(dest)) setDest(""); }}>
            Choose from the calendar list instead
          </button>
        )}
        {destSelected && !writable(destSelected) && <p className="mt-1 text-sm text-destructive">This calendar is read-only for the connected account.</p>}
      </div>

      <fieldset className="md:col-span-2" aria-describedby={`${formId}-busy-hint`}>
        <legend className="text-sm font-semibold">Busy calendars</legend>
        <p id={`${formId}-busy-hint`} className="text-sm text-muted-foreground">
          Events on these calendars block this crew's availability. The destination calendar always counts as busy. Up to 10.
        </p>
        {calendars && calendars.length > 0 && (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {calendars.map((c) => {
              const cid = `${formId}-busy-${c.id}`;
              return (
                <li key={c.id} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={cid}
                    checked={busy.includes(c.id)}
                    onCheckedChange={(on) => setBusy((prev) => (on === true ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                  />
                  <label htmlFor={cid} className="text-sm">{c.summary}{c.primary ? " (primary)" : ""} <span className="text-muted-foreground">· {c.accessRole}</span></label>
                </li>
              );
            })}
          </ul>
        )}
        <Field
          className="mt-3"
          label={calendars?.length ? "Other busy calendar IDs" : "Busy calendar IDs"}
          optionalLabel="optional"
          hint="One per line or comma-separated."
          error={errors.busyCalendars}
        >
          <Textarea rows={2} value={extraBusy} onChange={(e) => setExtraBusy(e.target.value)} />
        </Field>
      </fieldset>

      <LiveRegion assertive className="md:col-span-2 empty:hidden">{formError && <Notice tone="danger">{formError}</Notice>}</LiveRegion>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 aria-hidden="true" className="animate-spin" />}{submitLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}
