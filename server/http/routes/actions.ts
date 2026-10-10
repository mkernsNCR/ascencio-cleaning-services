// Email-linked owner actions. The emailed URL opens a client screen that reads the credential from
// the URL fragment. GET here is read-only (safe for mail scanners); POST consumes the credential.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { actionDecisionSchema, type ActionPreview } from "@shared/api";
import type { ServiceId } from "@shared/domain";
import type { AppContext } from "../../context";
import { reviews } from "../../db/schema";
import { AppError, badRequest, conflict } from "../../lib/errors";
import { consumeToken, lookupToken } from "../../modules/tokens";
import { getBooking, rejectBooking, requestApproval } from "../../modules/booking/service";
import { moderateReview } from "../../modules/inquiries";
import { runJobNowOrWait } from "../../jobs/worker";
import { asyncHandler, bearerToken, limiter } from "../middleware";

export function decisionOutcome(b: { status: string; calendarStatus: string }) {
  if (b.status === "confirmed") return "confirmed";
  if (b.status === "rejected") return "rejected";
  if (b.calendarStatus === "conflict") return "conflict";
  if (b.calendarStatus === "disconnected") return "calendar_disconnected";
  if (b.status !== "pending_approval") return b.status;
  return "processing";
}

export function actionRoutes(ctx: AppContext) {
  const r = Router();
  const tokenLimit = limiter(10, 40, ctx.config.env !== "test");

  r.get("/", tokenLimit, asyncHandler(async (req, res) => {
    const lookup = await lookupToken(ctx.db, bearerToken(req), ["booking.decide", "review.moderate"], ctx.now());
    if (lookup.state === "invalid") throw new AppError(404, "invalid_link");
    res.set("Cache-Control", "no-store");
    const state: ActionPreview["state"] = lookup.state === "valid" ? "ready" : lookup.state === "used" ? "used" : "expired";

    if (lookup.scope === "review.moderate") {
      const [review] = await ctx.db.select().from(reviews).where(eq(reviews.id, Number(lookup.subjectId)));
      if (!review) throw new AppError(404, "invalid_link");
      const preview: ActionPreview = {
        scope: "review.moderate",
        state: state === "ready" && review.status !== "pending" ? "used" : state,
        review: { name: review.name, rating: review.rating, body: review.body, status: review.status },
      };
      return res.json(preview);
    }

    const b = await getBooking(ctx.db, lookup.subjectId);
    if (!b) throw new AppError(404, "invalid_link");
    const stale = b.version !== lookup.subjectVersion;
    const preview: ActionPreview = {
      scope: "booking.decide",
      state: state === "ready" && (stale || b.status !== "pending_approval") ? "stale" : state,
      booking: {
        reference: b.reference,
        status: b.status,
        version: b.version,
        serviceId: b.serviceId as ServiceId,
        property: b.property,
        start: b.startAt.toISOString(),
        end: b.endAt.toISOString(),
        timezone: b.timezone,
        customerName: `${b.firstName} ${b.lastName}`,
        email: b.email,
        phone: b.phone,
        address: b.address,
        notes: b.notes,
        estimateCents: b.estimateCents,
        calendarStatus: b.calendarStatus,
      },
    };
    res.json(preview);
  }));

  r.post("/", tokenLimit, asyncHandler(async (req, res) => {
    const input = actionDecisionSchema.parse(req.body);
    const lookup = await lookupToken(ctx.db, bearerToken(req), ["booking.decide", "review.moderate"], ctx.now());
    if (lookup.state === "invalid") throw new AppError(404, "invalid_link");
    if (lookup.state === "used") throw conflict("token_used", "This link was already used.");
    if (lookup.state !== "valid") throw new AppError(410, "expired_link");

    if (lookup.scope === "review.moderate") {
      if (input.action !== "publish" && input.action !== "decline") throw badRequest("invalid_action");
      const ok = await ctx.db.transaction((tx) => consumeToken(tx, lookup.id, ctx.now()));
      if (!ok) throw conflict("token_used");
      const review = await moderateReview(ctx, Number(lookup.subjectId), input.action === "publish" ? "approved" : "declined");
      return res.json({ outcome: review.status });
    }

    if (input.action !== "approve" && input.action !== "reject") throw badRequest("invalid_action");
    if (!input.version || input.version !== lookup.subjectVersion) throw conflict("stale_version", "This request changed since the email was sent.");
    const actor = { kind: "email_link" as const };
    if (input.action === "reject") {
      const b = await rejectBooking(ctx, { bookingId: lookup.subjectId, version: input.version, reason: input.reason, actor, tokenId: lookup.id });
      return res.json({ outcome: decisionOutcome(b) });
    }
    const { jobId } = await requestApproval(ctx, { bookingId: lookup.subjectId, version: input.version, actor, tokenId: lookup.id });
    if (jobId) await runJobNowOrWait(ctx, jobId);
    const b = await getBooking(ctx.db, lookup.subjectId);
    res.json({ outcome: decisionOutcome(b!) });
  }));

  return r;
}
