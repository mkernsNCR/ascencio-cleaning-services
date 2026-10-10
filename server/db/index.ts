import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the root database handle or an open transaction. */
export type Executor = Database | Tx;

export function createPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

/** Extracts a PostgreSQL SQLSTATE from a driver error, including wrapped causes. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: any = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) return current.code;
    current = current.cause;
  }
  return undefined;
}

export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
