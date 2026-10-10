// Staff session + API access. Holds the CSRF token in context, sends it on every POST, and routes
// 401s back to the login screen and 403 csrf_failed to a session refresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { SessionResponse, SettingsResponse, Staff } from "./types";

export const SESSION_KEY = ["admin-session"] as const;

/** All dashboard data queries live under this prefix so logout/401 can drop them in one call. */
export const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  bookings: (params: Record<string, string>) => ["admin", "bookings", params] as const,
  bookingsAll: ["admin", "bookings"] as const,
  booking: (id: string) => ["admin", "booking", id] as const,
  bookingAll: ["admin", "booking"] as const,
  discrepancies: ["admin", "discrepancies"] as const,
  outbox: ["admin", "outbox"] as const,
  jobs: ["admin", "jobs"] as const,
  reviews: ["admin", "reviews"] as const,
  contacts: ["admin", "contacts"] as const,
  settings: ["admin", "settings"] as const,
  googleStatus: ["admin", "google", "status"] as const,
  googleCalendars: ["admin", "google", "calendars"] as const,
};

export async function fetchSession(): Promise<SessionResponse | null> {
  try {
    return await api<SessionResponse>("/api/admin/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function clearAdminData(qc: QueryClient) {
  qc.removeQueries({ queryKey: adminKeys.all });
}

interface AdminContextValue {
  staff: Staff;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  logout(): Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminSessionProvider({ session, children }: { session: SessionResponse; children: ReactNode }) {
  const qc = useQueryClient();
  const tokenRef = useRef(session.csrfToken);
  useEffect(() => {
    tokenRef.current = session.csrfToken;
  }, [session.csrfToken]);

  const handle = useCallback(async (error: unknown): Promise<never> => {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        qc.setQueryData(SESSION_KEY, null);
        clearAdminData(qc);
      } else if (error.status === 403 && error.code === "csrf_failed") {
        const fresh = await fetchSession().catch(() => undefined);
        if (fresh) {
          tokenRef.current = fresh.csrfToken;
          qc.setQueryData(SESSION_KEY, fresh);
        } else if (fresh === null) {
          qc.setQueryData(SESSION_KEY, null);
          clearAdminData(qc);
        }
      }
    }
    throw error;
  }, [qc]);

  const value = useMemo<AdminContextValue>(() => ({
    staff: session.staff,
    get: <T,>(path: string) => api<T>(path).catch(handle),
    post: <T,>(path: string, body: unknown = {}) => api<T>(path, { body, csrf: tokenRef.current }).catch(handle),
    logout: async () => {
      try {
        await api("/api/admin/logout", { body: {}, csrf: tokenRef.current });
      } finally {
        qc.setQueryData(SESSION_KEY, null);
        clearAdminData(qc);
      }
    },
  }), [session.staff, handle, qc]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminSessionProvider");
  return ctx;
}

const GENERIC: Record<string, string> = {
  network_error: "Could not reach the server. Check your connection and try again.",
  csrf_failed: "Your security token was refreshed. Please try that again.",
  unauthorized: "Your session ended. Please sign in again.",
  validation_error: "Some values are not valid. Check the highlighted fields.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  internal_error: "Something went wrong on the server. Try again; if it keeps happening, check the server logs.",
  not_found: "That record no longer exists.",
  not_retryable: "This item is no longer in a failed state, so there is nothing to retry. The list has been refreshed.",
  stale_version: "This record changed in another session. The latest version has been loaded; review it and try again.",
  not_pending: "This request is no longer pending — it was already decided, expired, or cancelled. The list has been refreshed.",
  start_passed: "The requested start time has already passed, so this request can't be approved. Decline it or contact the customer.",
  calendar_operation_in_progress: "A calendar operation for this booking is still being resolved. Wait a moment and try again.",
  calendar_disconnected: "Google Calendar is not connected, so bookings cannot be confirmed. Reconnect it on the Integrations page.",
  not_confirmed: "Only confirmed bookings can be marked completed.",
  not_started: "An appointment can be marked completed only after its start time.",
  fake_mode: "The calendar is running in fake (development) mode, so there is no Google account to connect.",
  oauth_not_configured: "Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY.",
};

/** Human-readable message for an API failure. Specific overrides win over generic code messages. */
export function errorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    return overrides[error.code] ?? GENERIC[error.code] ?? error.message ?? `Request failed (${error.status}).`;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function errorFields(error: unknown): Record<string, string> {
  return error instanceof ApiError && error.fields ? error.fields : {};
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Business IANA zone from settings (shared query with the Settings page); device zone until loaded. */
export function useBusinessTimezone(): string {
  const { get } = useAdmin();
  const q = useQuery({ queryKey: adminKeys.settings, queryFn: () => get<SettingsResponse>("/api/admin/settings") });
  return q.data?.settings.timezone ?? deviceZone;
}
