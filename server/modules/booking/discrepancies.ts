import { calendarDiscrepancies } from "../../db/schema";
import type { Executor } from "../../db";

/** Records a calendar discrepancy for staff review. Deduplicated by key, so repeat detection is a no-op. */
export async function flagDiscrepancy(
  db: Executor,
  params: { bookingId: string | null; kind: typeof calendarDiscrepancies.$inferInsert["kind"]; details: Record<string, unknown>; dedupeKey: string },
) {
  await db.insert(calendarDiscrepancies).values(params).onConflictDoNothing({ target: calendarDiscrepancies.dedupeKey });
}
