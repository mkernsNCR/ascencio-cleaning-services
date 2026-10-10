import { eq } from "drizzle-orm";
import { pricingVersions, type BookingRow } from "../../db/schema";
import type { Executor } from "../../db";
import type { AppContext } from "../../context";
import { customerTemplates, ownerTemplates, type BookingView, type RenderedMail } from "../../notifications/templates";
import { enqueueMail, messageKey } from "../../notifications/outbox";
import { buildIcs } from "../../notifications/ics";
import { issueToken } from "../tokens";
import { getSettings } from "../settings/repository";

const DAY = 86_400_000;

export const urls = (ctx: AppContext) => ({
  manage: (token: string) => `${ctx.config.publicBaseUrl}/booking/manage#t=${encodeURIComponent(token)}`,
  action: (token: string) => `${ctx.config.publicBaseUrl}/action#t=${encodeURIComponent(token)}`,
  admin: () => `${ctx.config.publicBaseUrl}/admin`,
  booking: (locale: string) => `${ctx.config.publicBaseUrl}/booking${locale === "es" ? "?lang=es" : ""}`,
});

export async function bookingView(db: Executor, b: BookingRow): Promise<BookingView> {
  const [pv] = await db.select({ approvedAt: pricingVersions.approvedAt }).from(pricingVersions).where(eq(pricingVersions.id, b.pricingVersionId));
  return {
    id: b.id,
    reference: b.reference,
    locale: b.locale,
    serviceId: b.serviceId,
    property: b.property,
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    phone: b.phone,
    address: b.address,
    postalCode: b.postalCode,
    notes: b.notes,
    start: b.startAt,
    end: b.endAt,
    timezone: b.timezone,
    durationMinutes: b.durationMinutes,
    estimateCents: b.estimateCents,
    pricesApproved: !!pv?.approvedAt,
  };
}

/** Customer management links stay valid until 30 days after the appointment. */
export async function issueManageToken(db: Executor, b: BookingRow) {
  return issueToken(db, { scope: "booking.manage", subjectId: b.id, expiresAt: new Date(b.endAt.getTime() + 30 * DAY) });
}

export async function issueDecisionToken(db: Executor, b: BookingRow, now: Date) {
  const expiresAt = b.expiresAt && b.expiresAt > now ? b.expiresAt : new Date(now.getTime() + DAY);
  return issueToken(db, { scope: "booking.decide", subjectId: b.id, subjectVersion: b.version, expiresAt });
}

function icsAttachment(view: BookingView, sequence: number, cancelled = false) {
  return {
    filename: cancelled ? "cancellation.ics" : "appointment.ics",
    contentType: `text/calendar; charset=utf-8; method=${cancelled ? "CANCEL" : "PUBLISH"}`,
    content: buildIcs({
      bookingId: view.id,
      sequence,
      start: view.start,
      end: view.end,
      summary: customerTemplates.icsSummary(view),
      description: `Reference ${view.reference}`,
      location: view.address,
      cancelled,
    }),
  };
}

async function toCustomer(db: Executor, b: BookingRow, type: string, mail: RenderedMail, extra: { attachments?: ReturnType<typeof icsAttachment>[]; sendAt?: Date; condition?: boolean; keySuffix?: string } = {}) {
  await enqueueMail(db, {
    messageKey: messageKey({ bookingId: b.id, version: b.version, type: type + (extra.keySuffix ?? ""), recipient: b.email }),
    bookingId: b.id,
    type,
    recipient: b.email,
    locale: b.locale,
    ...mail,
    attachments: extra.attachments,
    sendAt: extra.sendAt,
    sendCondition: extra.condition ? { bookingId: b.id, version: b.version, status: b.status } : null,
  });
}

async function toOwner(ctx: AppContext, db: Executor, b: BookingRow, type: string, mail: RenderedMail, extra: { sendAt?: Date; condition?: boolean } = {}) {
  const recipient = ctx.config.mail.ownerEmail;
  await enqueueMail(db, {
    messageKey: messageKey({ bookingId: b.id, version: b.version, type, recipient }),
    bookingId: b.id,
    type,
    recipient,
    locale: "en",
    ...mail,
    sendAt: extra.sendAt,
    sendCondition: extra.condition ? { bookingId: b.id, version: b.version, status: b.status } : null,
  });
}

export const bookingMail = {
  /** Request stored: customer receipt (pending) + owner review link + pre-expiry owner warning. */
  async requested(ctx: AppContext, db: Executor, b: BookingRow, manageToken: string) {
    const view = await bookingView(db, b);
    const { settings } = await getSettings(db);
    const decision = await issueDecisionToken(db, b, ctx.now());
    const u = urls(ctx);
    await toCustomer(db, b, "customer.request_received",
      customerTemplates.requestReceived(view, u.manage(manageToken), settings.responsePromise?.[b.locale] ?? null));
    await toOwner(ctx, db, b, "owner.booking_request", ownerTemplates.bookingRequest(view, u.action(decision.token), b.expiresAt));
    if (b.expiresAt) {
      const warnAt = new Date(b.expiresAt.getTime() - settings.ownerExpiryWarningHours * 3_600_000);
      if (warnAt > ctx.now()) {
        const warnToken = await issueDecisionToken(db, b, ctx.now());
        await toOwner(ctx, db, b, "owner.expiry_warning", ownerTemplates.expiryWarning(view, u.action(warnToken.token), b.expiresAt),
          { sendAt: warnAt, condition: true });
      }
    }
  },

  /** A pending request's time changed: fresh owner decision link and customer receipt. */
  async pendingUpdated(ctx: AppContext, db: Executor, b: BookingRow) {
    const view = await bookingView(db, b);
    const { settings } = await getSettings(db);
    const decision = await issueDecisionToken(db, b, ctx.now());
    const manage = await issueManageToken(db, b);
    const u = urls(ctx);
    await toCustomer(db, b, "customer.request_received",
      customerTemplates.requestReceived(view, u.manage(manage.token), settings.responsePromise?.[b.locale] ?? null));
    await toOwner(ctx, db, b, "owner.booking_request", ownerTemplates.bookingRequest(view, u.action(decision.token), b.expiresAt));
  },

  async confirmed(ctx: AppContext, db: Executor, b: BookingRow) {
    const view = await bookingView(db, b);
    const { settings } = await getSettings(db);
    const manage = await issueManageToken(db, b);
    const u = urls(ctx);
    await toCustomer(db, b, "customer.confirmed", customerTemplates.confirmed(view, u.manage(manage.token)),
      { attachments: [icsAttachment(view, b.version)] });
    await toOwner(ctx, db, b, "owner.confirmed", ownerTemplates.lifecycle(view, "confirmed", u.admin()));
    await this.reminder(ctx, db, b, settings.reminderHoursBefore);
  },

  /** Reminder only for the current confirmed version; rechecked at dispatch. */
  async reminder(ctx: AppContext, db: Executor, b: BookingRow, hoursBefore: number) {
    const sendAt = new Date(b.startAt.getTime() - hoursBefore * 3_600_000);
    if (sendAt <= ctx.now()) return;
    const view = await bookingView(db, b);
    const manage = await issueManageToken(db, b);
    await toCustomer(db, b, "customer.reminder", customerTemplates.reminder(view, urls(ctx).manage(manage.token)),
      { sendAt, condition: true });
  },

  async rejected(ctx: AppContext, db: Executor, b: BookingRow) {
    const view = await bookingView(db, b);
    const u = urls(ctx);
    await toCustomer(db, b, "customer.rejected", customerTemplates.rejected(view, b.decisionReason, u.booking(b.locale)));
    await toOwner(ctx, db, b, "owner.rejected", ownerTemplates.lifecycle(view, "rejected", u.admin()));
  },

  async expired(ctx: AppContext, db: Executor, b: BookingRow) {
    const view = await bookingView(db, b);
    const u = urls(ctx);
    await toCustomer(db, b, "customer.expired", customerTemplates.expired(view, u.booking(b.locale)));
    await toOwner(ctx, db, b, "owner.expired", ownerTemplates.lifecycle(view, "expired", u.admin()));
  },

  async cancelled(ctx: AppContext, db: Executor, b: BookingRow, wasConfirmed: boolean) {
    const view = await bookingView(db, b);
    await toCustomer(db, b, "customer.cancelled", customerTemplates.cancelled(view),
      { attachments: wasConfirmed ? [icsAttachment(view, b.version, true)] : [] });
    await toOwner(ctx, db, b, "owner.cancelled", ownerTemplates.lifecycle(view, "cancelled", urls(ctx).admin()));
  },

  async rescheduled(ctx: AppContext, db: Executor, b: BookingRow) {
    const view = await bookingView(db, b);
    const { settings } = await getSettings(db);
    const manage = await issueManageToken(db, b);
    const u = urls(ctx);
    await toCustomer(db, b, "customer.rescheduled", customerTemplates.rescheduled(view, u.manage(manage.token)),
      { attachments: [icsAttachment(view, b.version)] });
    await toOwner(ctx, db, b, "owner.rescheduled", ownerTemplates.lifecycle(view, "rescheduled", u.admin()));
    await this.reminder(ctx, db, b, settings.reminderHoursBefore);
  },

  async rescheduleFailed(ctx: AppContext, db: Executor, b: BookingRow, attemptKey: string) {
    const view = await bookingView(db, b);
    const manage = await issueManageToken(db, b);
    await toCustomer(db, b, "customer.reschedule_failed", customerTemplates.rescheduleFailed(view, urls(ctx).manage(manage.token)),
      { keySuffix: `:${attemptKey}` });
  },
};

/** Staff alert for integration or delivery failures (deduplicated by key). */
export async function enqueueStaffAlert(ctx: AppContext, db: Executor, key: string, subject: string, detail: string) {
  const recipient = ctx.config.mail.staffAlertEmail;
  const mail = ownerTemplates.staffAlert(subject, detail, urls(ctx).admin());
  await enqueueMail(db, {
    messageKey: `alert:${key}:${recipient}`,
    type: "staff.alert",
    recipient,
    locale: "en",
    ...mail,
  });
}
