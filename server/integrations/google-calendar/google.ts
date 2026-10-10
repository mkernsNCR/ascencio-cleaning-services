import type { AppConfig } from "../../config";
import type { Database } from "../../db";
import type { Logger } from "../../lib/logger";
import { decryptRefreshToken, loadConnection, markConnection, oauthConfigured, refreshAccessToken } from "./oauth";
import {
  CalendarError, type CalendarEvent, type CalendarGateway, type CalendarListEntry, type ConnectionHealth, type EventInput, type FreeBusyResult,
} from "./types";

const API = "https://www.googleapis.com/calendar/v3";
const REQUEST_TIMEOUT_MS = 15_000;

type FetchLike = typeof fetch;

/** Google Calendar REST adapter using the stored business OAuth connection. */
export class GoogleCalendarGateway implements CalendarGateway {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private db: Database,
    private config: AppConfig,
    private log: Logger,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async health(): Promise<ConnectionHealth> {
    if (!oauthConfigured(this.config)) return { status: "disconnected", accountEmail: null, lastError: "Google OAuth is not configured" };
    const row = await loadConnection(this.db);
    if (!row || !row.encryptedRefreshToken) return { status: row?.status === "revoked" ? "revoked" : "disconnected", accountEmail: row?.accountEmail ?? null, lastError: row?.lastError ?? null };
    return { status: row.status === "connected" ? "connected" : row.status === "revoked" ? "revoked" : row.status === "error" ? "error" : "disconnected", accountEmail: row.accountEmail, lastError: row.lastError };
  }

  /** Drops the cached access token (after reconnect/disconnect). */
  reset() {
    this.accessToken = null;
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const row = await loadConnection(this.db);
    if (!row?.encryptedRefreshToken || row.status === "disconnected" || row.status === "revoked") {
      throw new CalendarError("not_connected", "Google Calendar is not connected");
    }
    try {
      const refreshed = await refreshAccessToken(this.config, decryptRefreshToken(this.config, row.encryptedRefreshToken), this.fetchImpl);
      this.accessToken = { value: refreshed.accessToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 };
      if (row.status !== "connected") await markConnection(this.db, "connected", null);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof CalendarError && error.kind === "auth_revoked") {
        await markConnection(this.db, "revoked", error.message);
        this.log.warn("google authorization revoked");
      }
      throw error;
    }
  }

  private async request<T>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown; allow404?: boolean } = {}): Promise<T | null> {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const doFetch = async (token: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await this.fetchImpl(url, {
          method,
          headers: { authorization: `Bearer ${token}`, ...(opts.body ? { "content-type": "application/json" } : {}) },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        // Timeouts and resets leave the outcome unknown for writes.
        throw new CalendarError("unknown", `Network error calling Google Calendar: ${(error as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    };
    let res = await doFetch(await this.token());
    if (res.status === 401) {
      this.accessToken = null;
      res = await doFetch(await this.token());
    }
    if (res.status === 204) return null;
    if ((res.status === 404 || res.status === 410) && opts.allow404) return null;
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw classify(res.status, body);
    return body as T;
  }

  async freeBusy(calendarIds: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult> {
    const body = await this.request<any>("POST", "/freeBusy", {
      body: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: calendarIds.map((id) => ({ id })) },
    });
    const calendars: FreeBusyResult["calendars"] = {};
    for (const id of calendarIds) {
      const entry = body?.calendars?.[id];
      if (!entry) calendars[id] = { busy: [], error: "missing" };
      else if (entry.errors?.length) calendars[id] = { busy: [], error: entry.errors.map((e: any) => e.reason).join(",") };
      else calendars[id] = { busy: (entry.busy ?? []).map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) })) };
    }
    return { calendars };
  }

  async getEvent(calendarId: string, eventId: string) {
    const body = await this.request<any>("GET", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { allow404: true });
    return body ? toEvent(body) : null;
  }

  async insertEvent(calendarId: string, event: EventInput) {
    const body = await this.request<any>("POST", `/calendars/${enc(calendarId)}/events`, {
      // Owner-only event: no attendees, so no guest notifications are involved.
      query: { sendUpdates: "none" },
      body: toGoogleEvent(event),
    });
    return toEvent(body);
  }

  async patchEvent(calendarId: string, eventId: string, patch: Partial<Omit<EventInput, "id">> & { status?: "confirmed" }) {
    const partial: Record<string, unknown> = {};
    if (patch.summary !== undefined) partial.summary = patch.summary;
    if (patch.description !== undefined) partial.description = patch.description;
    if (patch.location !== undefined) partial.location = patch.location;
    if (patch.start) partial.start = { dateTime: patch.start.toISOString(), timeZone: patch.timeZone };
    if (patch.end) partial.end = { dateTime: patch.end.toISOString(), timeZone: patch.timeZone };
    if (patch.privateProps) partial.extendedProperties = { private: patch.privateProps };
    if (patch.status) partial.status = patch.status;
    const body = await this.request<any>("PATCH", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
      query: { sendUpdates: "none" }, body: partial,
    });
    return toEvent(body);
  }

  async deleteEvent(calendarId: string, eventId: string) {
    try {
      await this.request("DELETE", `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { query: { sendUpdates: "none" } });
      return "deleted" as const;
    } catch (error) {
      if (error instanceof CalendarError && (error.status === 404 || error.status === 410)) return "not_found" as const;
      throw error;
    }
  }

  async listEvents(calendarId: string, options: { syncToken?: string | null; timeMin?: Date; timeMax?: Date }) {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    do {
      const query: Record<string, string> = { singleEvents: "true", showDeleted: "true", maxResults: "250" };
      if (options.syncToken) query.syncToken = options.syncToken;
      else {
        if (options.timeMin) query.timeMin = options.timeMin.toISOString();
        if (options.timeMax) query.timeMax = options.timeMax.toISOString();
      }
      if (pageToken) query.pageToken = pageToken;
      const body = await this.request<any>("GET", `/calendars/${enc(calendarId)}/events`, { query });
      for (const item of body?.items ?? []) {
        const ev = toEvent(item, true);
        if (ev) events.push(ev);
      }
      pageToken = body?.nextPageToken;
      nextSyncToken = body?.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  }

  async watch(calendarId: string, channel: { id: string; token: string; address: string; ttlSeconds: number }) {
    const body = await this.request<any>("POST", `/calendars/${enc(calendarId)}/events/watch`, {
      body: { id: channel.id, type: "web_hook", address: channel.address, token: channel.token, params: { ttl: String(channel.ttlSeconds) } },
    });
    return { resourceId: String(body.resourceId), expiration: new Date(Number(body.expiration)) };
  }

  async stopChannel(channelId: string, resourceId: string) {
    await this.request("POST", "/channels/stop", { body: { id: channelId, resourceId }, allow404: true });
  }

  async listCalendars(): Promise<CalendarListEntry[]> {
    const body = await this.request<any>("GET", "/users/me/calendarList", { query: { minAccessRole: "reader", maxResults: "250" } });
    return (body?.items ?? []).map((c: any) => ({ id: c.id, summary: c.summaryOverride ?? c.summary ?? c.id, accessRole: c.accessRole, primary: !!c.primary }));
  }
}

const enc = encodeURIComponent;

function classify(status: number, body: any): CalendarError {
  const reason: string = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
  const message = body?.error?.message ?? `Google Calendar HTTP ${status}`;
  if (status === 401) return new CalendarError("auth_revoked", message, status);
  if (status === 403 && /rateLimit|quota/i.test(reason)) return new CalendarError("rate_limited", message, status);
  if (status === 403) return new CalendarError("forbidden", message, status);
  if (status === 404) return new CalendarError("not_found", message, status);
  if (status === 409) return new CalendarError("duplicate", message, status);
  if (status === 410) return new CalendarError("sync_token_invalid", message, status);
  if (status === 429) return new CalendarError("rate_limited", message, status);
  if (status >= 500) return new CalendarError("unavailable", message, status);
  return new CalendarError("bad_request", message, status);
}

function toGoogleEvent(e: EventInput) {
  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: { dateTime: e.start.toISOString(), timeZone: e.timeZone },
    end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
    transparency: "opaque",
    visibility: "private",
    reminders: { useDefault: true },
    extendedProperties: { private: e.privateProps },
  };
}

function toEvent(item: any, lenient = false): CalendarEvent {
  const start = item?.start?.dateTime ?? (item?.start?.date ? `${item.start.date}T00:00:00Z` : null);
  const end = item?.end?.dateTime ?? (item?.end?.date ? `${item.end.date}T00:00:00Z` : null);
  if ((!start || !end) && !lenient && item?.status !== "cancelled") throw new CalendarError("unknown", "Event missing start/end");
  return {
    id: String(item.id),
    status: item.status ?? "confirmed",
    start: start ? new Date(start) : new Date(0),
    end: end ? new Date(end) : new Date(0),
    summary: item.summary,
    privateProps: item.extendedProperties?.private,
    updated: item.updated,
    transparency: item.transparency ?? "opaque",
  };
}
