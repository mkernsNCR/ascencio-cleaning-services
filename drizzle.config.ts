import { defineConfig } from "drizzle-kit";

// Schema changes are written as SQL files in ./migrations (range exclusion constraints and triggers
// are not expressible in drizzle-kit) and applied with `npm run db:migrate`. This config is kept for
// `drizzle-kit studio`/introspection only; do not use `drizzle-kit push` against production.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
