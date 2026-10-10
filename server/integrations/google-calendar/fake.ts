// In-memory calendar for local development and automated tests. Refused in production by config.
import crypto from "crypto";
import {
  CalendarError, type CalendarEvent, type CalendarGateway, type CalendarListEntry, type ConnectionHealth, type EventInput, type FreeBusyResult, type Interval,
} from "./types";

interface StoredEvent extends CalendarEvent {
  version: number;
}

export class FakeCalendarGateway implements CalendarGateway {
  calendars = new Map<string, Map<string, StoredEvent>>();
  /** Extra busy time on any calendar (e.g. a personal appointment), keyed by calendar ID. */
  externalBusy = new Map<string, Interval[]>();
  healthStatus: ConnectionHealth["status"] = "connected";
  /** Calendars whose FreeBusy lookups report an error. */
  failingCalendars = new Set<string>();
  /** Insert succeeds remotely but the response is lost (network timeout). */
  loseNextInsertResponse = false;
  /** Next N writes fail with this error before reaching the calendar. */
  failNextWrites: { count: number; kind: CalendarError["kind"] } = { count: 0, kind: "unavailable" };
  insertCalls = 0;
  private changeLog: { calendarId: string; eventId: string; seq: number }[] = [];
  private seq = 0;
  invalidSyncTokens = new Set<string>();
  channels = new Map<string, { calendarId: string; resourceId: string; token: string }>();

  constructor(knownCalendars: string[] = ["primary"]) {
    for (const id of knownCalendars) this.calendars.set(id, new Map());
  }

  private cal(id: string) {
    let c = this.calendars.get(id);
    if (!c) {
      c = new Map();
      this.calendars.set(id, c);
    }
    return c;
  }

  private maybeFailWrite() {
    if (this.failNextWrites.count > 0) {
      this.failNextWrites.count--;
      throw new CalendarError(this.failNextWrites.kind, `Simulated ${this.failNextWrites.kind}`);
    }
  }

  private record(calendarId: string, eventId: string) {
    this.changeLog.push({ calendarId, eventId, seq: ++this.seq });
  }

  async health(): Promise<ConnectionHealth> {
    return { status: this.healthStatus, accountEmail: "owner@example.test", lastError: null };
  }

  private ensureConnected() {
    if (this.healthStatus === "revoked") throw new CalendarError("auth_revoked", "revoked");
    if (this.healthStatus !== "connected") throw new CalendarError("not_connected", "not connected");
  }

  async freeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult> {
    this.ensureConnected();
    const calendars: FreeBusyResult["calendars"] = {};
    for (const id of calendarIds) {
      if (this.failingCalendars.has(id)) {
        calendars[id] = { busy: [], error: "backendError" };
        continue;
      }
      const busy: Interval[] = [];
      for (const ev of this.cal(id).values()) {
        if (ev.status !== "cancelled" && ev.transparency !== "transparent" && ev.start < timeMax && ev.end > timeMin) busy.push({ start: ev.start, end: ev.end });
      }
      for (const b of this.externalBusy.get(id) ?? []) if (b.start < timeMax && b.end > timeMin) busy.push(b);
      calendars[id] = { busy };
    }
    return { calendars };
  }

  async getEvent(calendarId: string, eventId: string) {
    this.ensureConnected();
    const ev = this.cal(calendarId).get(eventId);
    return ev ? { ...ev } : null;
  }

  async insertEvent(calendarId: string, input: EventInput) {
    this.ensureConnected();
    this.maybeFailWrite();
    this.insertCalls++;
    const c = this.cal(calendarId);
    if (c.has(input.id)) throw new CalendarError("duplicate", "The requested identifier already exists.", 409);
    const ev: StoredEvent = {
      id: input.id, status: "confirmed", start: input.start, end: input.end, summary: input.summary,
      privateProps: { ...input.privateProps }, updated: new Date().toISOString(), version: 1, transparency: "opaque",
    };
    c.set(input.id, ev);
    this.record(calendarId, input.id);
    if (this.loseNextInsertResponse) {
      this.loseNextInsertResponse = false;
      throw new CalendarError("unknown", "Simulated timeout after insert");
    }
    return { ...ev };
  }

  async patchEvent(calendarId: string, eventId: string, patch: Partial<Omit<EventInput, "id">> & { status?: "confirmed" }) {
    this.ensureConnected();
    this.maybeFailWrite();
    const ev = this.cal(calendarId).get(eventId);
    if (!ev) throw new CalendarError("not_found", "Not found", 404);
    if (patch.start) ev.start = patch.start;
    if (patch.end) ev.end = patch.end;
    if (patch.summary) ev.summary = patch.summary;
    if (patch.privateProps) ev.privateProps = { ...patch.privateProps };
    if (patch.status) ev.status = patch.status;
    ev.version++;
    ev.updated = new Date().toISOString();
    this.record(calendarId, eventId);
    return { ...ev };
  }

  async deleteEvent(calendarId: string, eventId: string) {
    this.ensureConnected();
    this.maybeFailWrite();
    const ev = this.cal(calendarId).get(eventId);
    if (!ev || ev.status === "cancelled") return "not_found" as const;
    ev.status = "cancelled";
    this.record(calendarId, eventId);
    return "deleted" as const;
  }

  /** Simulates someone editing the calendar directly in Google. */
  externalEdit(calendarId: string, eventId: string, change: { start?: Date; end?: Date; delete?: boolean }) {
    const ev = this.cal(calendarId).get(eventId);
    if (!ev) return;
    if (change.delete) ev.status = "cancelled";
    if (change.start) ev.start = change.start;
    if (change.end) ev.end = change.end;
    this.record(calendarId, eventId);
  }

  /** Simulates an unrelated event created directly in Google. */
  externalInsert(calendarId: string, start: Date, end: Date) {
    const id = `ext${crypto.randomUUID().replace(/-/g, "")}`;
    this.cal(calendarId).set(id, { id, status: "confirmed", start, end, version: 1, transparency: "opaque" });
    this.record(calendarId, id);
    return id;
  }

  async listEvents(calendarId: string, options: { syncToken?: string | null; timeMin?: Date; timeMax?: Date }) {
    this.ensureConnected();
    if (options.syncToken && this.invalidSyncTokens.has(options.syncToken)) {
      throw new CalendarError("sync_token_invalid", "Sync token is no longer valid", 410);
    }
    const since = options.syncToken ? Number(options.syncToken.split(":")[1] ?? 0) : 0;
    const changedIds = new Set(
      this.changeLog.filter((c) => c.calendarId === calendarId && c.seq > since).map((c) => c.eventId),
    );
    const events = [...this.cal(calendarId).values()].filter((ev) => {
      if (options.syncToken) return changedIds.has(ev.id);
      if (ev.status === "cancelled") return false;
      if (options.timeMin && ev.end <= options.timeMin) return false;
      if (options.timeMax && ev.start >= options.timeMax) return false;
      return true;
    });
    return { events: events.map((e) => ({ ...e })), nextSyncToken: `${calendarId}:${this.seq}` };
  }

  async watch(calendarId: string, channel: { id: string; token: string; address: string; ttlSeconds: number }) {
    this.ensureConnected();
    const resourceId = `res-${crypto.randomUUID()}`;
    this.channels.set(channel.id, { calendarId, resourceId, token: channel.token });
    return { resourceId, expiration: new Date(Date.now() + channel.ttlSeconds * 1000) };
  }

  async stopChannel(channelId: string) {
    this.channels.delete(channelId);
  }

  async listCalendars(): Promise<CalendarListEntry[]> {
    return [...this.calendars.keys()].map((id) => ({ id, summary: id === "primary" ? "Business calendar (fake)" : id, accessRole: "owner", primary: id === "primary" }));
  }
}
