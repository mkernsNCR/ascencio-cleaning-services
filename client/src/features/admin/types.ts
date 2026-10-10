// Response shapes for /api/admin/*. Mirrors server/db/schema.ts with Date columns serialized as ISO strings.
import type { BusinessSettings, PricingRules, PropertyDetails, ServiceId } from "@shared/domain";

export type BookingStatus = "pending_approval" | "confirmed" | "rejected" | "cancelled" | "expired" | "completed";
export type CalendarStatus = "not_created" | "creating" | "synced" | "retrying" | "conflict" | "disconnected" | "delete_pending";
export type DecisionOutcome = "confirmed" | "rejected" | "conflict" | "calendar_disconnected" | "processing" | BookingStatus;

export interface Staff {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface SessionResponse {
  staff: Staff;
  csrfToken: string;
}

export interface PendingChange {
  kind: "reschedule";
  startAt: string;
  endAt: string;
  reservationId: number;
  requestedAt: string;
}

export interface Booking {
  id: string;
  reference: string;
  legacyId: number | null;
  locale: "en" | "es";
  serviceId: ServiceId | string;
  property: PropertyDetails;
  postalCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string | null;
  policyAckAt: string;
  marketingOptIn: boolean;
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
  estimateCents: number;
  currency: string;
  pricingVersionId: number;
  resourceId: number;
  status: BookingStatus;
  version: number;
  calendarStatus: CalendarStatus;
  calendarId: string | null;
  calendarEventId: string | null;
  pendingChange: PendingChange | null;
  decisionReason: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: number;
  bookingId: string;
  actor: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: unknown;
  createdAt: string;
}

export type MailStatus = "queued" | "sending" | "sent" | "failed" | "dead" | "suppressed";

export interface BookingMail {
  id: number;
  type: string;
  status: MailStatus;
  recipient: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  nextAttemptAt: string;
}

export interface BookingDetailResponse {
  booking: Booking;
  history: AuditEntry[];
  mail: BookingMail[];
}

export interface DecisionResponse {
  outcome: DecisionOutcome;
  booking: Booking;
}

export interface OverviewResponse {
  counts: { pending: number; upcoming: number; discrepancies: number; mailFailed: number; jobsDead: number; jobsRetrying: number };
  calendar: {
    status: "connected" | "disconnected" | "revoked" | "error";
    accountEmail: string | null;
    lastError: string | null;
    mode: "fake" | "google";
    sync: { calendarId: string; lastSyncAt: string | null; lastError: string | null; channelExpiresAt: string | null }[];
  };
  launchChecklist: { settingsApproved: boolean; pricesApproved: boolean; mail: "smtp" | "log"; bookingEnabled: boolean; databaseSafeguardsMissing: string[] };
}

export type DiscrepancyKind = "event_moved" | "event_deleted" | "event_collision" | "approval_conflict" | "reschedule_conflict" | "unmapped_event";

export interface Discrepancy {
  id: number;
  bookingId: string | null;
  kind: DiscrepancyKind;
  details: Record<string, unknown>;
  dedupeKey: string | null;
  resolvedAt: string | null;
  resolvedBy: number | null;
  createdAt: string;
  reference: string | null;
  startAt: string | null;
}

export interface OutboxItem {
  id: number;
  type: string;
  recipient: string;
  subject: string;
  status: MailStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  createdAt: string;
  bookingId: string | null;
}

export interface Job {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  uniqueKey: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: number;
  name: string;
  email: string;
  rating: number;
  body: string;
  locale: string;
  status: "pending" | "approved" | "declined";
  isDemo: boolean;
  moderatedAt: string | null;
  createdAt: string;
}

export interface ContactRequest {
  id: number;
  kind: "contact" | "commercial_quote" | "booking_fallback";
  locale: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string | null;
  businessType: string | null;
  squareFeet: number | null;
  frequency: string | null;
  contactWindow: string | null;
  serviceId: string | null;
  postalCode: string | null;
  message: string | null;
  status: "new" | "handled";
  createdAt: string;
}

export interface GoogleStatus {
  status: "connected" | "disconnected" | "revoked" | "error";
  accountEmail: string | null;
  lastError: string | null;
  mode: "fake" | "google";
  configured: boolean;
  scopes: string[];
  connectedAt: string | null;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  accessRole: string;
  primary: boolean;
}

export interface Resource {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
  destinationCalendar: string | null;
  busyCalendars: string[];
  createdAt: string;
}

export interface PricingVersion {
  id: number;
  label: string;
  rules: PricingRules;
  approvedAt: string | null;
  active: boolean;
  createdAt: string;
  createdBy: number | null;
}

export interface SettingsResponse {
  settings: BusinessSettings;
  version: number;
  approvedAt: string | null;
  pricing: PricingVersion[];
  resources: Resource[];
}

export interface LoadedSettingsResponse {
  settings: BusinessSettings;
  version: number;
  approvedAt: string | null;
}
