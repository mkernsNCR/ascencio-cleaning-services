import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { actionTokens, type TokenScope } from "../db/schema";
import type { Executor } from "../db";
import { randomToken, sha256 } from "../lib/crypto";

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/** Issues a random credential; only its hash is stored. */
export async function issueToken(
  db: Executor,
  params: { scope: TokenScope; subjectId: string; subjectVersion?: number | null; expiresAt: Date },
): Promise<IssuedToken> {
  const token = randomToken();
  await db.insert(actionTokens).values({
    tokenHash: sha256(token),
    scope: params.scope,
    subjectId: params.subjectId,
    subjectVersion: params.subjectVersion ?? null,
    expiresAt: params.expiresAt,
  });
  return { token, expiresAt: params.expiresAt };
}

export type TokenLookup =
  | { state: "valid"; id: number; scope: TokenScope; subjectId: string; subjectVersion: number | null; expiresAt: Date }
  | { state: "expired" | "used" | "revoked"; scope: TokenScope; subjectId: string; subjectVersion: number | null }
  | { state: "invalid" };

/** Read-only lookup. Never consumes, so GET screens and email scanners cause no changes. */
export async function lookupToken(db: Executor, token: string, scopes: TokenScope[], now: Date): Promise<TokenLookup> {
  if (!token || token.length > 200) return { state: "invalid" };
  const [row] = await db.select().from(actionTokens).where(eq(actionTokens.tokenHash, sha256(token)));
  if (!row || !scopes.includes(row.scope)) return { state: "invalid" };
  const base = { scope: row.scope, subjectId: row.subjectId, subjectVersion: row.subjectVersion };
  if (row.revokedAt) return { state: "revoked", ...base };
  if (row.consumedAt) return { state: "used", ...base };
  if (row.expiresAt.getTime() <= now.getTime()) return { state: "expired", ...base };
  return { state: "valid", id: row.id, expiresAt: row.expiresAt, ...base };
}

/**
 * Atomically consumes a single-use token inside the caller's transaction. Returns false if another
 * request already consumed it (replay) or it expired meanwhile.
 */
export async function consumeToken(db: Executor, id: number, now: Date): Promise<boolean> {
  const rows = await db
    .update(actionTokens)
    .set({ consumedAt: now })
    .where(and(eq(actionTokens.id, id), isNull(actionTokens.consumedAt), isNull(actionTokens.revokedAt), gt(actionTokens.expiresAt, now)))
    .returning({ id: actionTokens.id });
  return rows.length === 1;
}

export async function revokeTokens(db: Executor, scope: TokenScope, subjectId: string, now: Date) {
  await db
    .update(actionTokens)
    .set({ revokedAt: now })
    .where(and(eq(actionTokens.scope, scope), eq(actionTokens.subjectId, subjectId), isNull(actionTokens.revokedAt), isNull(actionTokens.consumedAt)));
}

export async function purgeExpiredTokens(db: Executor, olderThan: Date) {
  await db.execute(sql`DELETE FROM action_tokens WHERE expires_at < ${olderThan}`);
}
