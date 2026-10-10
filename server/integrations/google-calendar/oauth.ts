import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../../config";
import type { Database } from "../../db";
import { calendarConnections } from "../../db/schema";
import { decryptSecret, encryptSecret, randomToken } from "../../lib/crypto";
import { CalendarError } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Least-privilege scopes: FreeBusy for availability, owned-calendar events for writes/sync, and
 * calendar list read-only only to power the calendar picker. Use `calendar.events` instead of
 * `calendar.events.owned` if writing to calendars shared from another account becomes necessary.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "openid",
  "email",
];

export function oauthConfigured(config: AppConfig) {
  return !!(config.google.clientId && config.google.clientSecret && config.tokenEncryptionKey);
}

export function createPkce() {
  const verifier = randomToken(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(config: AppConfig, state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: config.google.clientId!,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // ensures a refresh token is returned on reconnect
    include_granted_scopes: "false",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

type FetchLike = typeof fetch;

export async function exchangeCode(config: AppConfig, code: string, verifier: string, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId!,
      client_secret: config.google.clientSecret!,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new CalendarError("bad_request", `Token exchange failed: ${body.error ?? res.status}`, res.status);
  if (!body.refresh_token) throw new CalendarError("bad_request", "Google did not return a refresh token; remove app access and reconnect");
  const granted = String(body.scope ?? "").split(" ").filter(Boolean);
  let email: string | null = null;
  if (body.id_token) {
    try {
      // The ID token came directly from Google's token endpoint over TLS, so decoding is sufficient here.
      const payload = JSON.parse(Buffer.from(String(body.id_token).split(".")[1], "base64url").toString("utf8"));
      email = typeof payload.email === "string" ? payload.email : null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: String(body.refresh_token), accessToken: String(body.access_token), expiresIn: Number(body.expires_in ?? 3600), scopes: granted, email };
}

export async function refreshAccessToken(config: AppConfig, refreshToken: string, fetchImpl: FetchLike = fetch) {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.google.clientId!,
        client_secret: config.google.clientSecret!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    throw new CalendarError("unavailable", `Token refresh network error: ${(error as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status === 400 && body.error === "invalid_grant") throw new CalendarError("auth_revoked", "Google authorization was revoked or expired", 400);
  if (!res.ok) throw new CalendarError(res.status >= 500 ? "unavailable" : "bad_request", `Token refresh failed: ${body.error ?? res.status}`, res.status);
  return { accessToken: String(body.access_token), expiresIn: Number(body.expires_in ?? 3600) };
}

export async function revokeToken(token: string, fetchImpl: FetchLike = fetch) {
  await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Connection persistence
// ---------------------------------------------------------------------------------------------

export async function saveConnection(db: Database, config: AppConfig, params: { refreshToken: string; scopes: string[]; email: string | null }) {
  const encrypted = encryptSecret(params.refreshToken, config.tokenEncryptionKey);
  const now = new Date();
  await db.insert(calendarConnections).values({
    id: 1, accountEmail: params.email, encryptedRefreshToken: encrypted, scopes: params.scopes, status: "connected", lastError: null, connectedAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: calendarConnections.id,
    set: { accountEmail: params.email, encryptedRefreshToken: encrypted, scopes: params.scopes, status: "connected", lastError: null, connectedAt: now, updatedAt: now },
  });
}

export async function loadConnection(db: Database) {
  const [row] = await db.select().from(calendarConnections).where(eq(calendarConnections.id, 1));
  return row;
}

export function decryptRefreshToken(config: AppConfig, encrypted: string) {
  return decryptSecret(encrypted, config.tokenEncryptionKey);
}

export async function markConnection(db: Database, status: "revoked" | "error" | "disconnected" | "connected", lastError: string | null) {
  await db.update(calendarConnections).set({ status, lastError, updatedAt: new Date() }).where(eq(calendarConnections.id, 1));
}

export async function clearConnection(db: Database) {
  await db.update(calendarConnections).set({ status: "disconnected", encryptedRefreshToken: null, lastError: null, updatedAt: new Date() })
    .where(eq(calendarConnections.id, 1));
}
