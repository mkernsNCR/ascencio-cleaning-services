import pg from "pg";

/** Recreates the e2e database so every run starts clean (runs before the e2e web server starts). */
async function resetDatabase() {
  const url = new URL(process.env.E2E_DATABASE_URL ?? "postgres://localhost/ascencio_e2e");
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.includes("e2e")) throw new Error(`Refusing to recreate non-e2e database "${dbName}"`);
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${dbName}`);
  await client.end();
}

resetDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
