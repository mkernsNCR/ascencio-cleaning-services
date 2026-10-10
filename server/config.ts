import { z } from "zod";

// Validated runtime configuration. No placeholder credentials: features that need a secret
// stay disabled (and say so) until it is provided.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:5000"),
  SESSION_SECRET: z.string().min(32).optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),

  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: z.enum(["true", "false"]).default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // "smtp" sends real mail; "log" records messages without sending (development/test mail sink).
  MAIL_TRANSPORT: z.enum(["smtp", "log"]).optional(),
  MAIL_FROM: z.string().default("Ascencio Cleaning Services <ascenciocleaning@gmail.com>"),
  OWNER_NOTIFICATION_EMAIL: z.string().email().default("ascenciocleaning@gmail.com"),
  STAFF_ALERT_EMAIL: z.string().email().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // "google" uses the real API. "fake" is an in-memory calendar for local development and tests only.
  GOOGLE_CALENDAR_MODE: z.enum(["google", "fake"]).optional(),
  GOOGLE_WEBHOOK_ENABLED: z.enum(["true", "false"]).default("false"),

  RUN_WORKER: z.enum(["true", "false"]).default("true"),
  BOOKING_ENABLED: z.enum(["true", "false"]).default("true"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === "production";

  if (production && !e.SESSION_SECRET) {
    throw new Error("SESSION_SECRET (32+ characters) is required in production");
  }
  if (production && e.GOOGLE_CALENDAR_MODE === "fake") {
    throw new Error("GOOGLE_CALENDAR_MODE=fake is not allowed in production");
  }
  if (production && !e.PUBLIC_BASE_URL.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL must use https in production");
  }

  const mailTransport = e.MAIL_TRANSPORT ?? (production ? "smtp" : "log");
  const calendarMode = e.GOOGLE_CALENDAR_MODE ?? (production ? "google" : "fake");

  return {
    env: e.NODE_ENV,
    production,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    publicBaseUrl: e.PUBLIC_BASE_URL.replace(/\/$/, ""),
    sessionSecret: e.SESSION_SECRET ?? "development-only-session-secret-change-me",
    tokenEncryptionKey: e.TOKEN_ENCRYPTION_KEY,
    trustProxy: e.TRUST_PROXY === "true",
    mail: {
      transport: mailTransport,
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE === "true",
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.MAIL_FROM,
      ownerEmail: e.OWNER_NOTIFICATION_EMAIL,
      staffAlertEmail: e.STAFF_ALERT_EMAIL ?? e.OWNER_NOTIFICATION_EMAIL,
    },
    google: {
      mode: calendarMode,
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      webhookEnabled: e.GOOGLE_WEBHOOK_ENABLED === "true",
      redirectUri: `${e.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/admin/google/callback`,
      webhookUrl: `${e.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/integrations/google/webhook`,
    },
    runWorker: e.RUN_WORKER === "true",
    bookingEnabled: e.BOOKING_ENABLED === "true",
  };
}
