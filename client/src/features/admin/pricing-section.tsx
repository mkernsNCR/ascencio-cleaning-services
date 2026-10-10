import { useId, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DEFAULT_PRICING_RULES, SERVICE_CATALOG, type PricingRules, type ServiceId, type ServicePriceRule } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, LiveRegion } from "@/components/forms/field";
import { adminKeys, errorFields, errorMessage, useAdmin, useBusinessTimezone } from "./admin-api";
import { duration, fmtDateTime, money } from "./admin-format";
import type { PricingVersion } from "./types";
import { Card, ConfirmDialog, Empty, NativeSelect, Notice, Pill, tableCls } from "./ui";

const BOOKABLE = SERVICE_CATALOG.filter((s) => s.mode === "bookable");

export function PricingSection({ versions }: { versions: PricingVersion[] }) {
  const tz = useBusinessTimezone();
  const active = versions.find((v) => v.active);
  const [viewId, setViewId] = useState<number | null>(active?.id ?? versions[0]?.id ?? null);
  const viewing = versions.find((v) => v.id === viewId) ?? active ?? versions[0];
  const [activating, setActivating] = useState<PricingVersion | null>(null);
  const [approve, setApprove] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { post } = useAdmin();
  const qc = useQueryClient();
  const approveId = useId();

  return (
    <section id="pricing" aria-labelledby="pricing-h" className="flex scroll-mt-6 flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="pricing-h" className="font-sans text-xl font-semibold">Pricing</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {!active ? <Pill tone="danger">No active price version</Pill> : active.approvedAt ? (
                <Pill tone="success">Active prices approved</Pill>
              ) : (
                <Pill tone="warning">Active prices NOT approved — estimates hidden from customers</Pill>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Prices are versioned. Each booking records the version used for its estimate. Unapproved prices are never shown to customers; create a version, then activate it with “approve for publication”.
            </p>
          </div>
          {!creating && <Button variant="outline" onClick={() => setCreating(true)}>Create new version</Button>}
        </div>
      </Card>

      <LiveRegion className="empty:hidden">{notice && <Notice tone="success">{notice}</Notice>}</LiveRegion>

      {creating && (
        <CreateVersionForm
          base={active?.rules ?? DEFAULT_PRICING_RULES}
          baseLabel={active?.label}
          onCancel={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setViewId(row.id);
            setNotice(`Version “${row.label}” created. It is not active yet — activate it below.`);
          }}
        />
      )}

      <Card title="Versions">
        {versions.length === 0 ? <Empty>No price versions.</Empty> : (
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <caption className="sr-only">Price versions</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableCls.th}>Label</th>
                  <th scope="col" className={tableCls.th}>Created</th>
                  <th scope="col" className={tableCls.th}>State</th>
                  <th scope="col" className={tableCls.th}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className={v.id === viewing?.id ? "bg-primary-soft/40" : undefined}>
                    <th scope="row" className={`${tableCls.td} font-semibold`}>#{v.id} {v.label}</th>
                    <td className={tableCls.td}>{fmtDateTime(v.createdAt, tz)}</td>
                    <td className={tableCls.td}>
                      <div className="flex flex-wrap gap-1">
                        {v.active ? <Pill tone="info">Active</Pill> : <Pill>Inactive</Pill>}
                        {v.approvedAt ? <Pill tone="success">Approved {fmtDateTime(v.approvedAt, tz)}</Pill> : <Pill tone="warning">Not approved</Pill>}
                      </div>
                    </td>
                    <td className={tableCls.td}>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setViewId(v.id)} aria-pressed={v.id === viewing?.id} aria-label={`View rules for version ${v.id}`}>View rules</Button>
                        {(!v.active || !v.approvedAt) && (
                          <Button size="sm" variant="outline" onClick={() => { setApprove(!!v.approvedAt || v.active); setActivating(v); }} aria-label={`${v.active ? "Approve" : "Activate"} version ${v.id}`}>
                            {v.active ? "Approve" : "Activate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewing && <RulesTable version={viewing} />}

      <ConfirmDialog
        open={!!activating}
        onOpenChange={(o) => !o && setActivating(null)}
        title={activating?.active ? `Approve version #${activating.id}?` : `Activate version #${activating?.id}?`}
        description={activating?.active
          ? "Approving publishes these estimates to customers."
          : "The active version is used for all new estimates. The previously active version is deactivated. Existing bookings keep their recorded estimate."}
        confirmLabel={activating?.active ? "Approve prices" : approve ? "Activate and approve" : "Activate without approval"}
        onConfirm={async () => {
          if (!activating) return;
          try {
            await post(`/api/admin/pricing/${activating.id}/activate`, { approve });
            setNotice(approve ? `Version #${activating.id} is active and approved for publication.` : `Version #${activating.id} is active but NOT approved; customers will not see estimates.`);
          } finally {
            await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.settings }), qc.invalidateQueries({ queryKey: adminKeys.overview })]);
          }
        }}
      >
        {activating && !activating.approvedAt && (
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox id={approveId} checked={approve} onCheckedChange={(c) => setApprove(c === true)} disabled={activating.active} />
            <label htmlFor={approveId} className="text-sm">
              <span className="font-semibold">Approve for publication</span>
              <span className="block text-muted-foreground">I confirm these are the real prices customers should see. Leave unchecked to activate for review only.</span>
            </label>
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}

function RulesTable({ version }: { version: PricingVersion }) {
  const services = SERVICE_CATALOG.filter((s) => version.rules.services[s.id]);
  return (
    <Card title={`Rules for #${version.id} ${version.label}`} description={`Durations round up to ${version.rules.roundingMinutes} minutes. Base price covers a studio/1-bedroom, 1-bathroom home.`}>
      {services.length === 0 ? <Empty>No services priced in this version.</Empty> : (
        <div className={tableCls.wrap}>
          <table className={tableCls.table}>
            <caption className="sr-only">Price rules by service</caption>
            <thead>
              <tr>
                <th scope="col" className={tableCls.th}>Service</th>
                <th scope="col" className={tableCls.th}>Base</th>
                <th scope="col" className={tableCls.th}>Each extra bedroom</th>
                <th scope="col" className={tableCls.th}>Each extra bathroom</th>
                <th scope="col" className={tableCls.th}>Max bookable online</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const r = version.rules.services[s.id]!;
                return (
                  <tr key={s.id}>
                    <th scope="row" className={`${tableCls.td} font-semibold`}>{s.name.en}</th>
                    <td className={tableCls.td}>{money(r.basePriceCents)} · {duration(r.baseMinutes)}</td>
                    <td className={tableCls.td}>+{money(r.perExtraBedroomCents)} · +{r.perExtraBedroomMinutes} min</td>
                    <td className={tableCls.td}>+{money(r.perExtraBathroomCents)} · +{r.perExtraBathroomMinutes} min</td>
                    <td className={tableCls.td}>{duration(r.maxBookableMinutes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------

type RuleKey = keyof ServicePriceRule;
const RULE_FIELDS: { key: RuleKey; label: string; kind: "money" | "minutes"; min: number; max: number }[] = [
  { key: "basePriceCents", label: "Base price ($)", kind: "money", min: 0, max: 1_000_000 },
  { key: "baseMinutes", label: "Base minutes", kind: "minutes", min: 30, max: 960 },
  { key: "perExtraBedroomCents", label: "Per extra bedroom ($)", kind: "money", min: 0, max: 100_000 },
  { key: "perExtraBedroomMinutes", label: "Per extra bedroom (min)", kind: "minutes", min: 0, max: 240 },
  { key: "perExtraBathroomCents", label: "Per extra bathroom ($)", kind: "money", min: 0, max: 100_000 },
  { key: "perExtraBathroomMinutes", label: "Per extra bathroom (min)", kind: "minutes", min: 0, max: 240 },
  { key: "maxBookableMinutes", label: "Max bookable (min)", kind: "minutes", min: 30, max: 960 },
];

const centsToDollars = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));

function parseDollars(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

function CreateVersionForm({ base, baseLabel, onCancel, onCreated }: {
  base: PricingRules; baseLabel?: string; onCancel: () => void; onCreated: (row: PricingVersion) => void;
}) {
  const { post } = useAdmin();
  const qc = useQueryClient();
  const initialValues = useMemo(() => {
    const out = {} as Record<ServiceId, Record<RuleKey, string>>;
    for (const s of BOOKABLE) {
      const r = base.services[s.id] ?? DEFAULT_PRICING_RULES.services[s.id]!;
      const row = {} as Record<RuleKey, string>;
      for (const f of RULE_FIELDS) row[f.key] = f.kind === "money" ? centsToDollars(r[f.key]) : String(r[f.key]);
      out[s.id] = row;
    }
    return out;
  }, [base]);
  const [label, setLabel] = useState("");
  const [rounding, setRounding] = useState(String(base.roundingMinutes));
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!label.trim() || label.trim().length > 120) errs.label = "Enter a label of 1–120 characters.";
    const roundingN = Number(rounding);
    if (![15, 30, 60].includes(roundingN)) errs["rules.roundingMinutes"] = "Choose 15, 30, or 60.";
    const services: Partial<Record<ServiceId, ServicePriceRule>> = {};
    for (const s of BOOKABLE) {
      const rule = {} as ServicePriceRule;
      for (const f of RULE_FIELDS) {
        const raw = values[s.id][f.key];
        const n = f.kind === "money" ? parseDollars(raw) : /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
        const path = `rules.services.${s.id}.${f.key}`;
        if (n === null) errs[path] = f.kind === "money" ? "Enter a dollar amount like 120 or 120.50." : "Enter whole minutes.";
        else if (n < f.min || n > f.max) {
          errs[path] = f.kind === "money" ? `Between ${money(f.min)} and ${money(f.max)}.` : `Between ${f.min} and ${f.max} minutes.`;
        } else rule[f.key] = n;
      }
      if (!errs[`rules.services.${s.id}.maxBookableMinutes`] && !errs[`rules.services.${s.id}.baseMinutes`] && rule.maxBookableMinutes < rule.baseMinutes) {
        errs[`rules.services.${s.id}.maxBookableMinutes`] = "Below the base duration — this service could never be booked online.";
      }
      services[s.id] = rule;
    }
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      setFormError("Some values need fixing. Check the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      const row = await post<PricingVersion>("/api/admin/pricing", { label: label.trim(), rules: { currency: "USD", roundingMinutes: roundingN, services } });
      await qc.invalidateQueries({ queryKey: adminKeys.settings });
      onCreated(row);
    } catch (err) {
      setErrors(errorFields(err));
      setFormError(errorMessage(err));
      setPending(false);
    }
  };

  return (
    <Card title="New price version" description={baseLabel ? `Prefilled from the active version “${baseLabel}”. Enter money in dollars.` : "Enter money in dollars."}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Version label" hint="e.g. “2027 rates approved by owner”." error={errors.label}>
            <Input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Round durations up to" error={errors["rules.roundingMinutes"]}>
            <NativeSelect value={rounding} onChange={(e) => setRounding(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </NativeSelect>
          </Field>
        </div>
        {BOOKABLE.map((s) => (
          <fieldset key={s.id} className="rounded-lg border p-4">
            <legend className="px-1 font-semibold">{s.name.en}</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RULE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} error={errors[`rules.services.${s.id}.${f.key}`]}>
                  <Input
                    inputMode={f.kind === "money" ? "decimal" : "numeric"}
                    value={values[s.id][f.key]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [s.id]: { ...prev[s.id], [f.key]: e.target.value } }))}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        ))}
        <LiveRegion assertive className="empty:hidden">{formError && <Notice tone="danger">{formError}</Notice>}</LiveRegion>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending && <Loader2 aria-hidden="true" className="animate-spin" />}Create version</Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        </div>
        <p className="text-sm text-muted-foreground">Creating a version does not change what customers see. Activate it afterwards.</p>
      </form>
    </Card>
  );
}
