import { defineConfig } from "drizzle-kit";

// The database schema is managed by the SQL files in ./migrations, applied automatically on startup
// (or with `npm run db:migrate`). Drizzle cannot represent the reservation overlap constraint, its
// generated range column, the booking status trigger, or several indexes and foreign keys, so
// commands that sync from the TypeScript schema would silently DROP them. Those commands are blocked.
// Read-only tooling (`drizzle-kit studio`, `introspect`) still works.
const BLOCKED = ["push", "generate", "migrate", "drop", "up"];
const command = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (command && BLOCKED.includes(command)) {
  throw new Error(
    `drizzle-kit ${command} is disabled for this project: it would remove the reservation overlap ` +
      "constraint and other safeguards that Drizzle cannot represent. Add a SQL file under ./migrations " +
      "and run `npm run db:migrate` instead.",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./drizzle-introspect",
  schema: "./server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
