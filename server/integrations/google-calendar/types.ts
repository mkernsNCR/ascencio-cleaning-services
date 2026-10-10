export interface Interval {
  start: Date;
  end: Date;
}

export interface FreeBusyResult {
  calendars: Record<string, { busy: Interval[]; error?: string }>;
}

export interface CalendarEvent {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  start: Date;
  end: Date;
  summary?: string;
  /** extendedProperties.private written by this application. */
  privateProps?: Record<string, string>;
  updated?: string;
  transparency?: "opaque" | "transparent";
}

export interface EventInput {
  id: string;
  summary: string;
  description: string;
  location?: string;
  start: Date;
  end: Date;
  timeZone: string;
  privateProps: Record<string, string>;
}

export type CalendarErrorKind =
  | "auth_revoked"
  | "not_connected"
  | "not_found"
  | "duplicate"
  | "rate_limited"
  | "unavailable"
  | "sync_token_invalid"
  | "forbidden"
  | "bad_request"
  | "unknown";

export class CalendarError extends Error {
  constructor(
    public readonly kind: CalendarErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }

  /** Whether the outcome of a write may have happened (must be verified before retrying). */
  get outcomeUnknown() {
    return this.kind === "unavailable" || this.kind === "unknown";
  }

  get retryable() {
    return this.kind === "rate_limited" || this.kind === "unavailable" || this.kind === "unknown";
  }
}

export interface ConnectionHealth {
  status: "connected" | "disconnected" | "revoked" | "error";
  accountEmail: string | null;
  lastError: string | null;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  accessRole: string;
  primary: boolean;
}

/** Everything the booking domain needs from a calendar provider. */
export interface CalendarGateway {
  health(): Promise<ConnectionHealth>;
  freeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null>;
  insertEvent(calendarId: string, event: EventInput): Promise<CalendarEvent>;
  patchEvent(calendarId: string, eventId: string, patch: Partial<Omit<EventInput, "id">> & { status?: "confirmed" }): Promise<CalendarEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<"deleted" | "not_found">;
  listEvents(
    calendarId: string,
    options: { syncToken?: string | null; timeMin?: Date; timeMax?: Date },
  ): Promise<{ events: CalendarEvent[]; nextSyncToken: string | null }>;
  watch(
    calendarId: string,
    channel: { id: string; token: string; address: string; ttlSeconds: number },
  ): Promise<{ resourceId: string; expiration: Date }>;
  stopChannel(channelId: string, resourceId: string): Promise<void>;
  listCalendars(): Promise<CalendarListEntry[]>;
}

/** Deterministic, valid Google event ID (base32hex alphabet: 0-9, a-v) derived from a booking UUID. */
export function eventIdForBooking(bookingId: string): string {
  return `acb${bookingId.replace(/-/g, "").toLowerCase()}`;
}
