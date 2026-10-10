import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, LiveRegion } from "@/components/forms/field";
import { adminKeys, errorMessage, useAdmin, useBusinessTimezone } from "./admin-api";
import { contactKindLabel, fmtDateTime, serviceName } from "./admin-format";
import type { ContactRequest } from "./types";
import { DataList, Empty, NativeSelect, Notice, PageHeader, Pill, QueryState } from "./ui";

type Filter = "new" | "all" | ContactRequest["kind"];

export default function InquiriesPage() {
  const { get, post } = useAdmin();
  const qc = useQueryClient();
  const tz = useBusinessTimezone();
  const q = useQuery({ queryKey: adminKeys.contacts, queryFn: () => get<ContactRequest[]>("/api/admin/contacts") });
  const [filter, setFilter] = useState<Filter>("new");
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const rows = useMemo(() => (q.data ?? []).filter((c) => filter === "all" || (filter === "new" ? c.status === "new" : c.kind === filter)), [q.data, filter]);

  const markHandled = async (c: ContactRequest) => {
    setBusy(c.id);
    try {
      await post(`/api/admin/contacts/${c.id}/handled`);
      setStatus({ tone: "success", text: `Inquiry from ${c.firstName} ${c.lastName} marked handled.` });
    } catch (e) {
      setStatus({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: adminKeys.contacts });
    }
  };

  return (
    <>
      <PageHeader title="Inquiries" description={`Contact messages, commercial quote requests, and customers who could not book online. Times in ${tz}.`} />
      <div className="mb-6 max-w-sm">
        <Field label="Show">
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="new">New (not yet handled)</option>
            <option value="all">All inquiries</option>
            <option value="contact">{contactKindLabel.contact}</option>
            <option value="commercial_quote">{contactKindLabel.commercial_quote}</option>
            <option value="booking_fallback">{contactKindLabel.booking_fallback}</option>
          </NativeSelect>
        </Field>
      </div>
      <LiveRegion className="empty:hidden">{status && <Notice tone={status.tone} className="mb-6">{status.text}</Notice>}</LiveRegion>
      <QueryState query={q} loadingLabel="Loading inquiries…">
        {() => rows.length === 0 ? <Empty>{filter === "new" ? "No new inquiries." : "No inquiries match this filter."}</Empty> : (
          <ul className="flex flex-col gap-4">
            {rows.map((c) => (
              <li key={c.id} className="rounded-xl border bg-surface p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sans text-lg font-semibold">{c.firstName} {c.lastName}{c.company ? <span className="font-normal text-muted-foreground"> · {c.company}</span> : null}</h2>
                    <p className="text-sm text-muted-foreground">{contactKindLabel[c.kind] ?? c.kind} · received {fmtDateTime(c.createdAt, tz)}</p>
                  </div>
                  <Pill tone={c.status === "new" ? "warning" : "neutral"}>{c.status === "new" ? "New" : "Handled"}</Pill>
                </div>
                <DataList className="mt-4 text-sm" items={[
                  ["Phone", <a className="text-primary underline" href={`tel:${c.phone}`}>{c.phone}</a>],
                  ["Email", <a className="break-all text-primary underline" href={`mailto:${c.email}`}>{c.email}</a>],
                  ["Language", c.locale === "es" ? "Spanish" : "English"],
                  ...(c.serviceId ? [["Service", serviceName(c.serviceId)] as [string, string]] : []),
                  ...(c.postalCode ? [["ZIP", c.postalCode] as [string, string]] : []),
                  ...(c.businessType ? [["Business type", c.businessType] as [string, string]] : []),
                  ...(c.squareFeet != null ? [["Square feet", c.squareFeet.toLocaleString("en-US")] as [string, string]] : []),
                  ...(c.frequency ? [["Frequency", c.frequency] as [string, string]] : []),
                  ...(c.contactWindow ? [["Best time to contact", c.contactWindow] as [string, string]] : []),
                  ["Message", c.message ? <span className="whitespace-pre-line">{c.message}</span> : "—"],
                ]} />
                {c.status === "new" && (
                  <div className="mt-4">
                    <Button variant="outline" disabled={busy !== null} onClick={() => markHandled(c)} aria-label={`Mark inquiry from ${c.firstName} ${c.lastName} handled`}>
                      {busy === c.id && <Loader2 aria-hidden="true" className="animate-spin" />} Mark handled
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
