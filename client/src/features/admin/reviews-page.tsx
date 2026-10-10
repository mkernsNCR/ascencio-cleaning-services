import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/forms/field";
import { adminKeys, errorMessage, useAdmin, useBusinessTimezone } from "./admin-api";
import { fmtDateTime } from "./admin-format";
import type { Review } from "./types";
import { Empty, Notice, PageHeader, Pill, QueryState } from "./ui";

const statusOrder = { pending: 0, approved: 1, declined: 2 } as const;
const statusPill = {
  pending: { tone: "warning", label: "Pending moderation" },
  approved: { tone: "success", label: "Published" },
  declined: { tone: "neutral", label: "Declined" },
} as const;

export default function ReviewsPage() {
  const { get, post } = useAdmin();
  const qc = useQueryClient();
  const tz = useBusinessTimezone();
  const q = useQuery({ queryKey: adminKeys.reviews, queryFn: () => get<Review[]>("/api/admin/reviews") });
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const sorted = useMemo(
    () => (q.data ? [...q.data].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.createdAt.localeCompare(a.createdAt)) : []),
    [q.data],
  );

  const moderate = async (r: Review, decision: "approved" | "declined") => {
    setBusy(`${r.id}:${decision}`);
    try {
      await post(`/api/admin/reviews/${r.id}/moderate`, { decision });
      setStatus({ tone: "success", text: decision === "approved" ? `Review from ${r.name} published.` : `Review from ${r.name} declined.` });
    } catch (e) {
      setStatus({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: adminKeys.reviews });
    }
  };

  return (
    <>
      <PageHeader title="Reviews" description={`Customer reviews appear on the website only after approval. Pending reviews are listed first. Times in ${tz}.`} />
      <LiveRegion className="empty:hidden">{status && <Notice tone={status.tone} className="mb-6">{status.text}</Notice>}</LiveRegion>
      <QueryState query={q} loadingLabel="Loading reviews…">
        {() => sorted.length === 0 ? <Empty>No reviews yet.</Empty> : (
          <ul className="flex flex-col gap-4">
            {sorted.map((r) => (
              <li key={r.id} className="rounded-xl border bg-surface p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sans text-lg font-semibold">{r.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      <a href={`mailto:${r.email}`} className="text-primary underline">{r.email}</a> · {fmtDateTime(r.createdAt, tz)} · {r.locale === "es" ? "Spanish" : "English"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={statusPill[r.status].tone}>{statusPill[r.status].label}</Pill>
                    {r.isDemo && <Pill tone="danger">Demo / seeded — not a real customer</Pill>}
                  </div>
                </div>
                <p className="mt-2 font-semibold" aria-label={`Rating ${r.rating} out of 5`}>
                  <span aria-hidden="true" className="text-warning">{"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))}</span>
                  <span aria-hidden="true" className="ml-2 text-sm text-muted-foreground">{r.rating}/5</span>
                </p>
                <p className="mt-2 whitespace-pre-line">{r.body}</p>
                {r.moderatedAt && <p className="mt-2 text-sm text-muted-foreground">Moderated {fmtDateTime(r.moderatedAt, tz)}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {r.status !== "approved" && (
                    <Button size="sm" disabled={busy !== null} onClick={() => moderate(r, "approved")} aria-label={`Publish review from ${r.name}`}>
                      {busy === `${r.id}:approved` && <Loader2 aria-hidden="true" className="animate-spin" />} Approve & publish
                    </Button>
                  )}
                  {r.status !== "declined" && (
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => moderate(r, "declined")} aria-label={`Decline review from ${r.name}`}>
                      {busy === `${r.id}:declined` && <Loader2 aria-hidden="true" className="animate-spin" />} {r.status === "approved" ? "Unpublish (decline)" : "Decline"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
