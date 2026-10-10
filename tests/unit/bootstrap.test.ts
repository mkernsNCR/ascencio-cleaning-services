import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "../../server/bootstrap";
import { loadConfig } from "../../server/config";
import { runMigrations } from "../../server/db/migrate";
import { ensureDefaults } from "../../server/modules/settings/repository";

vi.mock("../../server/db", () => ({
  createPool: vi.fn(() => ({})),
  createDb: vi.fn(() => ({})),
}));
vi.mock("../../server/db/migrate", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/modules/settings/repository", () => ({
  ensureDefaults: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => vi.clearAllMocks());

function config(env: "production" | "development" | "test") {
  return loadConfig({
    NODE_ENV: env,
    DATABASE_URL: "postgres://unused/bootstrap-test",
    PUBLIC_BASE_URL: "https://example.test",
    SESSION_SECRET: "bootstrap-test-session-secret-at-least-32-characters",
    GOOGLE_CALENDAR_MODE: "google",
    MAIL_TRANSPORT: "log",
  });
}

describe("startup schema ownership", () => {
  it("does not replay SQL migrations in production", async () => {
    const ctx = await bootstrap(config("production"));
    expect(ctx.config.production).toBe(true);
    expect(runMigrations).not.toHaveBeenCalled();
    expect(ensureDefaults).toHaveBeenCalledOnce();
  });

  it.each(["development", "test"] as const)(
    "still applies pending migrations in %s",
    async (env) => {
      await bootstrap(config(env));
      expect(runMigrations).toHaveBeenCalledOnce();
      expect(ensureDefaults).toHaveBeenCalledOnce();
      expect(vi.mocked(runMigrations).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(ensureDefaults).mock.invocationCallOrder[0],
      );
    },
  );

  it("does not hide migration failures outside production", async () => {
    vi.mocked(runMigrations).mockRejectedValueOnce(new Error("migration failed"));
    await expect(bootstrap(config("test"))).rejects.toThrow("migration failed");
    expect(ensureDefaults).not.toHaveBeenCalled();
  });
});
