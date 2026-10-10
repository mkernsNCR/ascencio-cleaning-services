// Applies pending SQL migrations and restores any missing database safeguards: npm run db:migrate
import { loadConfig } from "../config";
import { createPool } from "../db";
import { runMigrations } from "../db/migrate";
import { ensureSafeguards } from "../db/safeguards";

const pool = createPool(loadConfig().databaseUrl);
(async () => {
  await runMigrations(pool);
  const report = await ensureSafeguards(pool);
  if (report.repaired.length) console.log(`restored safeguards: ${report.repaired.join(", ")}`);
  for (const f of report.failed) console.error(`could not restore ${f.name}: ${f.error}`);
  await pool.end();
  if (report.failed.length) process.exit(1);
})().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
