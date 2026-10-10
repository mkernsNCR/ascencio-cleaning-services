// Minimal structured logger. Never pass request bodies, customer details, or credentials here;
// sensitive keys are redacted defensively in case a caller does.

const SENSITIVE_KEY = /(email|phone|address|notes|name|token|password|secret|authorization|cookie|refresh|code)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { message: value.message, code: (value as any).code };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE_KEY.test(k) ? [k, "[redacted]"] : [k, redact(v, depth + 1)],
    ),
  );
}

export type Logger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export function createLogger(silent = false): Logger {
  const write = (level: string, message: string, meta?: Record<string, unknown>) => {
    if (silent) return;
    const time = new Date().toISOString();
    const suffix = meta ? ` ${JSON.stringify(redact(meta))}` : "";
    const line = `${time} [${level}] ${message}${suffix}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    info: (m, meta) => write("info", m, meta),
    warn: (m, meta) => write("warn", m, meta),
    error: (m, meta) => write("error", m, meta),
  };
}

export { redact };
