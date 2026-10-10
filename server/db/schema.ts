// Typed table definitions mirroring migrations/*.sql. The SQL files are the source of truth for
// constraints (range exclusion, transition trigger, CHECKs); keep both in sync.
import {
  pgTable, serial, bigserial, integer, text, boolean, timestamp, jsonb, uuid,
} from "drizzle-orm/pg-core";
import type { BusinessSettings, PricingRules, PropertyDetails } from "@shared/domain";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const staffUsers = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  disabledAt: tz("disabled_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const businessSettings = pgTable("business_settings", {
  id: integer("id").primaryKey().default(1),
  settings: jsonb("settings").$type<BusinessSettings>().notNull(),
  version: integer("version").notNull().default(1),
  approvedAt: tz("approved_at"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  updatedBy: integer("updated_by"),
});

export const pricingVersions = pgTable("pricing_versions", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  rules: jsonb("rules").$type<PricingRules>().notNull(),
  approvedAt: tz("approved_at"),
  active: boolean("active").notNull().default(false),
  createdAt: tz("created_at").notNull().defaultNow(),
  createdBy: integer("created_by"),
});

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  destinationCalendar: text("destination_calendar"),
  busyCalendars: text("busy_calendars").array().notNull().default([]),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type PendingChange = {
  kind: "reschedule";
  startAt: string;
  endAt: string;
  reservationId: number;
  requestedAt: string;
};

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  legacyId: integer("legacy_id"),
  locale: text("locale").$type<"en" | "es">().notNull(),
  serviceId: text("service_id").notNull(),
  property: jsonb("property").$type<PropertyDetails>().notNull(),
  postalCode: text("postal_code").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  notes: text("notes"),
  policyAckAt: tz("policy_ack_at").notNull(),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  startAt: tz("start_at").notNull(),
  endAt: tz("end_at").notNull(),
  timezone: text("timezone").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  estimateCents: integer("estimate_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  pricingVersionId: integer("pricing_version_id").notNull(),
  resourceId: integer("resource_id").notNull(),
  status: text("status").$type<BookingStatus>().notNull().default("pending_approval"),
  version: integer("version").notNull().default(1),
  calendarStatus: text("calendar_status").$type<CalendarStatus>().notNull().default("not_created"),
  calendarId: text("calendar_id"),
  calendarEventId: text("calendar_event_id"),
  pendingChange: jsonb("pending_change").$type<PendingChange | null>(),
  decisionReason: text("decision_reason"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestHash: text("request_hash").notNull(),
  expiresAt: tz("expires_at"),
  decidedAt: tz("decided_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export type BookingStatus = "pending_approval" | "confirmed" | "rejected" | "cancelled" | "expired" | "completed";
export type CalendarStatus =
  | "not_created" | "creating" | "synced" | "retrying" | "conflict" | "disconnected" | "delete_pending";

export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  bookingId: uuid("booking_id").notNull(),
  resourceId: integer("resource_id").notNull(),
  kind: text("kind").$type<"booking" | "reschedule_target">().notNull(),
  startsAt: tz("starts_at").notNull(),
  endsAt: tz("ends_at").notNull(),
  releasedAt: tz("released_at"),
  releaseReason: text("release_reason"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const bookingAudit = pgTable("booking_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: uuid("booking_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  details: jsonb("details"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type TokenScope = "booking.decide" | "booking.manage" | "review.moderate";

export const actionTokens = pgTable("action_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  scope: text("scope").$type<TokenScope>().notNull(),
  subjectId: text("subject_id").notNull(),
  subjectVersion: integer("subject_version"),
  expiresAt: tz("expires_at").notNull(),
  consumedAt: tz("consumed_at"),
  revokedAt: tz("revoked_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const calendarConnections = pgTable("calendar_connections", {
  id: integer("id").primaryKey().default(1),
  accountEmail: text("account_email"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  scopes: text("scopes").array().notNull().default([]),
  status: text("status").$type<"connected" | "revoked" | "error" | "disconnected">().notNull(),
  lastError: text("last_error"),
  connectedAt: tz("connected_at"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const calendarSyncState = pgTable("calendar_sync_state", {
  calendarId: text("calendar_id").primaryKey(),
  syncToken: text("sync_token"),
  channelId: text("channel_id").unique(),
  channelResource: text("channel_resource"),
  channelTokenHash: text("channel_token_hash"),
  channelExpiresAt: tz("channel_expires_at"),
  lastSyncAt: tz("last_sync_at"),
  lastError: text("last_error"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export type DiscrepancyKind =
  | "event_moved" | "event_deleted" | "event_collision" | "approval_conflict" | "reschedule_conflict" | "unmapped_event";

export const calendarDiscrepancies = pgTable("calendar_discrepancies", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: uuid("booking_id"),
  kind: text("kind").$type<DiscrepancyKind>().notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  dedupeKey: text("dedupe_key").unique(),
  resolvedAt: tz("resolved_at"),
  resolvedBy: integer("resolved_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  uniqueKey: text("unique_key").unique(),
  status: text("status").$type<"queued" | "running" | "succeeded" | "failed" | "dead">().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  runAt: tz("run_at").notNull().defaultNow(),
  lockedAt: tz("locked_at"),
  lastError: text("last_error"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export type SendCondition = { bookingId: string; version: number; status: BookingStatus };
export type MailAttachment = { filename: string; contentType: string; content: string };

export const outbox = pgTable("outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageKey: text("message_key").notNull().unique(),
  bookingId: uuid("booking_id"),
  type: text("type").notNull(),
  recipient: text("recipient").notNull(),
  locale: text("locale").notNull().default("en"),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  textBody: text("text_body").notNull(),
  attachments: jsonb("attachments").$type<MailAttachment[]>().notNull().default([]),
  sendCondition: jsonb("send_condition").$type<SendCondition | null>(),
  status: text("status").$type<"queued" | "sending" | "sent" | "failed" | "dead" | "suppressed">().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(6),
  nextAttemptAt: tz("next_attempt_at").notNull().defaultNow(),
  lockedAt: tz("locked_at"),
  lastError: text("last_error"),
  sentAt: tz("sent_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const contactRequests = pgTable("contact_requests", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"contact" | "commercial_quote" | "booking_fallback">().notNull(),
  locale: text("locale").notNull().default("en"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"),
  businessType: text("business_type"),
  squareFeet: integer("square_feet"),
  frequency: text("frequency"),
  contactWindow: text("contact_window"),
  serviceId: text("service_id"),
  postalCode: text("postal_code"),
  message: text("message"),
  status: text("status").$type<"new" | "handled">().notNull().default("new"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  locale: text("locale").notNull().default("en"),
  status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
  isDemo: boolean("is_demo").notNull().default(false),
  moderatedAt: tz("moderated_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  path: text("path"),
  locale: text("locale"),
  serviceId: text("service_id"),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type BookingRow = typeof bookings.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type ContactRequestRow = typeof contactRequests.$inferSelect;
