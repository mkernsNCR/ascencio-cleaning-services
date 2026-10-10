// Applies pending SQL migrations: npm run db:migrate
import { loadConfig } from "../config";
import { createPool } from "../db";
import { runMigrations } from "../db/migrate";

const pool = createPool(loadConfig().databaseUrl);
runMigrations(pool)
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  });
