import { Router } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  analyticsEventSchema, availabilityQuerySchema, bookingRequestSchema, contactRequestSchema, estimateRequestSchema,
  rescheduleRequestSchema, reviewRequestSchema, type EstimateResponse,
} from "@shared/api";
import { SERVICE_CATALOG, getService, type ServiceId } from "@shared/domain";
import { addDays, localDateOf } from "@shared/time";
import type { AppContext } from "../../context";
import { analyticsEvents, reservations } from "../../db/schema";
import { getActivePricing, getSettings } from "../../modules/settings/repository";
import { calculateEstimate } from "../../modules/booking/estimate";
import { getAvailability } from "../../modules/booking/availability";
import {
  cancelByCustomer, createBookingRequest, presentManagedBooking, rescheduleByCustomer, resolveManageToken,
} from "../../modules/booking/service";
import { createContactRequest, createReview, publicReviews } from "../../modules/inquiries";
import { runOneJob } from "../../jobs/worker";
import { jobs } from "../../db/schema";
import { asyncHandler, bearerToken, limiter } from "../middleware";

export function publicRoutes(ctx: AppContext) {
  const r = Router();
  const limits = ctx.config.env !== "test";
  const formLimit = limiter(10, 10, limits);
  const readLimit = limiter(1, 60, limits);
  const tokenLimit = limiter(10, 40, limits);

  r.get("/public-config", asyncHandler(async (_req, res) => {
    const { settings, approvedAt } = await getSettings(ctx.db);
    const pricing = await getActivePricing(ctx.db);
    const health = await ctx.calendar.health();
    res.json({
      bookingEnabled: ctx.config.bookingEnabled,
      calendarConnected: health.status === "connected",
      timezone: settings.timezone,
      weeklyHours: settings.weeklyHours,
      responsePromise: settings.responsePromise,
      settingsApproved: !!approvedAt,
      pricesApproved: pricing.approved,
      cancellationCutoffHours: settings.cancellationCutoffHours,
      rescheduleCutoffHours: settings.rescheduleCutoffHours,
    });
  }));

  r.get("/services", asyncHandler(async (_req, res) => {
    const pricing = await getActivePricing(ctx.db);
    res.json({
      pricesApproved: pricing.approved,
      services: SERVICE_CATALOG.map((s) => {
        const rule = pricing.rules.services[s.id];
        return {
          ...s,
          fromPriceCents: pricing.approved && rule && s.mode === "bookable" ? rule.basePriceCents : null,
          baseDurationMinutes: rule && s.mode === "bookable" ? rule.baseMinutes : null,
        };
      }),
    });
  }));

  r.post("/booking-estimates", readLimit, asyncHandler(async (req, res) => {
    const input = estimateRequestSchema.parse(req.body);
    const pricing = await getActivePricing(ctx.db);
    const estimate = calculateEstimate(input.serviceId, input.property, pricing.rules);
    const body: EstimateResponse = {
      serviceId: input.serviceId,
      mode: getService(input.serviceId)!.mode,
      quoteRequired: estimate.quoteRequired,
      durationMinutes: estimate.durationMinutes,
      estimateCents: pricing.approved ? estimate.estimateCents : null,
      currency: "USD",
      pricingVersionId: pricing.id,
      pricesApproved: pricing.approved,
    };
    res.json(body);
  }));

  r.get("/availability", readLimit, asyncHandler(async (req, res) => {
    const query = availabilityQuerySchema.parse(req.query);
    res.set("Cache-Control", "no-store");
    res.json(await getAvailability(ctx, query));
  }));

  r.post("/bookings", formLimit, asyncHandler(async (req, res) => {
    const input = bookingRequestSchema.parse(req.body);
    const { receipt, replayed } = await createBookingRequest(ctx, input);
    res.status(replayed ? 200 : 201).json(receipt);
  }));

  // --- Customer self-service with a scoped credential (Authorization: Bearer) -------------------

  r.get("/booking-management", tokenLimit, asyncHandler(async (req, res) => {
    const booking = await resolveManageToken(ctx, bearerToken(req));
    res.set("Cache-Control", "no-store");
    res.json(await presentManagedBooking(ctx, booking));
  }));

  r.get("/booking-management/availability", tokenLimit, asyncHandler(async (req, res) => {
    const booking = await resolveManageToken(ctx, bearerToken(req));
    const { settings } = await getSettings(ctx.db);
    const today = localDateOf(ctx.now(), settings.timezone);
    const from = typeof req.query.from === "string" ? req.query.from : today;
    const to = typeof req.query.to === "string" ? req.query.to : addDays(today, 13);
    const query = availabilityQuerySchema.parse({
      serviceId: booking.serviceId, bedrooms: booking.property.bedrooms, bathrooms: booking.property.bathrooms,
      postalCode: booking.postalCode, from, to,
    });
    const own = (await ctx.db.select({ id: reservations.id }).from(reservations)
      .where(and(eq(reservations.bookingId, booking.id), isNull(reservations.releasedAt)))).map((x) => x.id);
    res.set("Cache-Control", "no-store");
    res.json(await getAvailability(ctx, query, {
      excludeReservationIds: own,
      excludeEventId: booking.calendarEventId,
      onlyResourceId: booking.status === "confirmed" ? booking.resourceId : undefined,
    }));
  }));

  r.post("/booking-management/cancel", tokenLimit, asyncHandler(async (req, res) => {
    const booking = await resolveManageToken(ctx, bearerToken(req));
    const updated = await cancelByCustomer(ctx, booking.id);
    res.json(await presentManagedBooking(ctx, updated));
  }));

  r.post("/booking-management/reschedule", tokenLimit, asyncHandler(async (req, res) => {
    const booking = await resolveManageToken(ctx, bearerToken(req));
    const { start } = rescheduleRequestSchema.parse(req.body);
    let updated = await rescheduleByCustomer(ctx, booking.id, start);
    if (updated.pendingChange) {
      // Try to resolve the calendar move now so the customer sees the outcome; otherwise it stays "processing".
      const key = `reschedule:${updated.id}:${updated.version}:${updated.pendingChange.reservationId}`;
      const [job] = await ctx.db.select({ id: jobs.id }).from(jobs).where(eq(jobs.uniqueKey, key));
      if (job) await runOneJob(ctx, job.id).catch((error) => ctx.log.warn("inline reschedule attempt failed", { error }));
      updated = (await resolveManageToken(ctx, bearerToken(req)));
    }
    res.json(await presentManagedBooking(ctx, updated));
  }));

  // --- Inquiries and reviews ---------------------------------------------------------------------

  r.post("/contact", formLimit, asyncHandler(async (req, res) => {
    const input = contactRequestSchema.parse(req.body);
    await createContactRequest(ctx, input);
    res.status(201).json({ ok: true });
  }));

  r.get("/reviews", asyncHandler(async (_req, res) => {
    res.json(await publicReviews(ctx));
  }));

  r.post("/reviews", formLimit, asyncHandler(async (req, res) => {
    const input = reviewRequestSchema.parse(req.body);
    await createReview(ctx, input);
    res.status(201).json({ ok: true });
  }));

  r.post("/analytics", limiter(1, 120, limits), asyncHandler(async (req, res) => {
    const parsed = analyticsEventSchema.safeParse(req.body);
    if (parsed.success) {
      await ctx.db.insert(analyticsEvents).values({ ...parsed.data, serviceId: parsed.data.serviceId as ServiceId | undefined });
    }
    res.status(204).end();
  }));

  return r;
}

/**
 * The original site mutated bookings and reviews through predictable GET links. Those links now
 * do nothing and explain where to act instead.
 */
export function legacyActionRoutes() {
  const r = Router();
  const gone = (_req: unknown, res: import("express").Response) =>
    res.status(410).type("html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link no longer valid</title></head>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#182B25">
<h1 style="font-size:22px">This link is no longer valid</h1>
<p>Older approval links have been retired for security. Nothing was changed. Please use the review link in a newer email or sign in to the dashboard.</p>
<p><a href="/admin" style="color:#214F42">Open the dashboard</a></p></body></html>`,
    );
  r.get("/reviews/:id/approve", gone);
  r.get("/reviews/:id/decline", gone);
  r.get("/bookings/:id/approve", gone);
  r.get("/bookings/:id/reject", gone);
  return r;
}
