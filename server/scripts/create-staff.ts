// Usage: npm run staff:create -- owner@example.com "Owner Name"
// Prompts for the password on stdin (input hidden) so it never lands in shell history.
import readline from "readline";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDb, createPool } from "../db";
import { runMigrations } from "../db/migrate";
import { staffUsers } from "../db/schema";
import { hashPassword } from "../lib/crypto";

async function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const original = (rl as any)._writeToOutput;
  (rl as any)._writeToOutput = (s: string) => (s.includes(question) ? original.call(rl, s) : undefined);
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();
  if (!email || !name) {
    console.error('Usage: npm run staff:create -- <email> "<name>"');
    process.exit(1);
  }
  const password = process.env.STAFF_PASSWORD ?? (await promptHidden("Password (min 12 characters): "));
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  await runMigrations(pool, undefined, () => {});
  const db = createDb(pool);
  const passwordHash = await hashPassword(password);
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(staffUsers).where(eq(staffUsers.email, normalized));
  if (existing) {
    await db.update(staffUsers).set({ name, passwordHash, disabledAt: null }).where(eq(staffUsers.id, existing.id));
    console.log(`Updated staff account ${normalized}`);
  } else {
    await db.insert(staffUsers).values({ email: normalized, name, passwordHash, role: "owner" });
    console.log(`Created staff account ${normalized}`);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
