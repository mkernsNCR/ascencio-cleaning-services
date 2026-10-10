import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the development server with the fake calendar and log mail transport,
// on an isolated database that is recreated for each run (see tests/e2e/reset-db.ts).
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost/ascencio_e2e";
const PORT = Number(process.env.E2E_PORT ?? 5055);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx tsx tests/e2e/reset-db.ts && npx tsx server/index.ts",
    url: `http://localhost:${PORT}/api/public-config`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      GOOGLE_CALENDAR_MODE: "fake",
      MAIL_TRANSPORT: "log",
    },
  },
});
