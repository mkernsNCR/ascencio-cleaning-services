import fs from "fs";
import path from "path";
import type pg from "pg";

// Works from source (server/db/) and from the bundled server (dist/).
const MIGRATIONS_DIR =
  [path.resolve(import.meta.dirname, "..", "..", "migrations"), path.resolve(import.meta.dirname, "..", "migrations")]
    .find((dir) => fs.existsSync(dir)) ?? path.resolve(process.cwd(), "migrations");

/**
 * Applies pending SQL migrations in filename order, each in its own transaction.
 * An advisory lock keeps concurrently starting processes from racing.
 */
export async function runMigrations(pool: pg.Pool, dir = MIGRATIONS_DIR, log: (msg: string) => void = console.log) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    );
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sqlText = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        log(`applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}
