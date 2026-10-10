import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import type { contactRequestSchema, PublicReviewSummary, reviewRequestSchema } from "@shared/api";
import type { AppContext } from "../context";
import { contactRequests, reviews, type ReviewRow } from "../db/schema";
import { conflict, notFound } from "../lib/errors";
import { enqueueMail, messageKey } from "../notifications/outbox";
import { ownerTemplates } from "../notifications/templates";
import { issueToken } from "./tokens";
import { urls } from "./booking/notify";

const DAY = 86_400_000;

export async function createContactRequest(ctx: AppContext, input: z.output<typeof contactRequestSchema>) {
  const row = await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(contactRequests).values({
      kind: input.kind,
      locale: input.locale,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      company: input.company ?? null,
      businessType: input.businessType ?? null,
      squareFeet: input.squareFeet ?? null,
      frequency: input.frequency ?? null,
      contactWindow: input.contactWindow ?? null,
      serviceId: input.serviceId ?? null,
      postalCode: input.postalCode ?? null,
      message: input.message ?? null,
    }).returning();
    const mail = ownerTemplates.contactRequest(created, urls(ctx).admin());
    const recipient = ctx.config.mail.ownerEmail;
    await enqueueMail(tx, {
      messageKey: messageKey({ bookingId: `contact-${created.id}`, type: "owner.contact", recipient }),
      type: "owner.contact", recipient, locale: "en", ...mail,
    });
    return created;
  });
  ctx.kick();
  return { id: row.id };
}

export async function createReview(ctx: AppContext, input: z.output<typeof reviewRequestSchema>) {
  await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(reviews).values({
      name: input.name, email: input.email, rating: input.rating, body: input.body, locale: input.locale,
    }).returning();
    const token = await issueToken(tx, { scope: "review.moderate", subjectId: String(created.id), expiresAt: new Date(ctx.now().getTime() + 30 * DAY) });
    const mail = ownerTemplates.reviewSubmitted(created, urls(ctx).action(token.token));
    const recipient = ctx.config.mail.ownerEmail;
    await enqueueMail(tx, {
      messageKey: messageKey({ bookingId: `review-${created.id}`, type: "owner.review", recipient }),
      type: "owner.review", recipient, locale: "en", ...mail,
    });
  });
  ctx.kick();
}

/** Published reviews only. Demo fixtures are excluded in production. */
export async function publicReviews(ctx: AppContext): Promise<PublicReviewSummary> {
  const conditions = [eq(reviews.status, "approved")];
  if (ctx.config.production) conditions.push(eq(reviews.isDemo, false));
  const rows = await ctx.db.select().from(reviews).where(and(...conditions)).orderBy(desc(reviews.createdAt)).limit(24);
  const count = rows.length;
  const averageRating = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  return {
    reviews: rows.map((r) => ({ id: r.id, name: displayName(r.name), rating: r.rating, body: r.body, createdAt: r.createdAt.toISOString() })),
    averageRating,
    count,
  };
}

/** "Maria Gonzalez" → "Maria G." to limit personal data on the public site. */
function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
}

export async function moderateReview(ctx: AppContext, reviewId: number, decision: "approved" | "declined"): Promise<ReviewRow> {
  const [row] = await ctx.db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!row) throw notFound("review_not_found");
  if (row.status !== "pending" && row.status !== decision) throw conflict("already_moderated", `Review is already ${row.status}.`);
  const [updated] = await ctx.db.update(reviews).set({ status: decision, moderatedAt: ctx.now() }).where(eq(reviews.id, reviewId)).returning();
  return updated;
}
