// Development-only demo fixtures. Demo reviews are flagged is_demo and are never shown in production.
import { loadConfig } from "../config";
import { createDb, createPool } from "../db";
import { runMigrations } from "../db/migrate";
import { reviews } from "../db/schema";
import { ensureDefaults } from "../modules/settings/repository";

async function main() {
  const config = loadConfig();
  if (config.production) throw new Error("Refusing to seed demo data in production");
  const pool = createPool(config.databaseUrl);
  await runMigrations(pool, undefined, () => {});
  const db = createDb(pool);
  await ensureDefaults(db);
  await db.insert(reviews).values([
    { name: "Demo Customer A", email: "demo-a@example.test", rating: 5, body: "Demo review for local development only.", status: "approved", isDemo: true },
    { name: "Demo Customer B", email: "demo-b@example.test", rating: 4, body: "Another placeholder review. Not a real customer.", status: "approved", isDemo: true },
  ]);
  console.log("Seeded demo reviews (is_demo = true).");
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
