// Thin fetch wrapper that surfaces the server's stable error codes so the UI can show specific,
// localized messages (e.g. slot_unavailable, expired_link) instead of generic failures.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message ?? code);
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Scoped credential sent as a Bearer header (never placed in the URL). */
  token?: string;
  csrf?: string;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.csrf) headers["X-CSRF-Token"] = options.csrf;
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "network_error");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `http_${res.status}`, data?.message, data?.fields);
  }
  return data as T;
}

/** Reads a credential from the URL fragment (`#t=...`), which browsers never send to servers. */
export function tokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("t") ?? "";
}
