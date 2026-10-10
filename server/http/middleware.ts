import type { NextFunction, Request, Response, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { AppContext } from "../context";
import { staffUsers } from "../db/schema";
import { AppError, forbidden, unauthorized } from "../lib/errors";
import { randomToken, timingSafeEqualStr } from "../lib/crypto";

declare module "express-session" {
  interface SessionData {
    staffId?: number;
    csrfToken?: string;
    oauth?: { state: string; verifier: string; createdAt: number };
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: { id: number; email: string; name: string; role: string };
    }
  }
}

/** Wraps async handlers so rejections reach the error middleware. */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function requireStaff(ctx: AppContext): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const id = req.session?.staffId;
    if (!id) throw unauthorized();
    const [staff] = await ctx.db.select().from(staffUsers).where(eq(staffUsers.id, id));
    if (!staff || staff.disabledAt) {
      req.session.staffId = undefined;
      throw unauthorized();
    }
    req.staff = { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
    next();
  });
}

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = randomToken(24);
  return req.session.csrfToken;
}

/** Cookie-authenticated mutations must echo the session's CSRF token in a header. */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  const header = req.get("x-csrf-token");
  const expected = req.session?.csrfToken;
  if (!header || !expected || !timingSafeEqualStr(header, expected)) return next(forbidden("csrf_failed"));
  next();
};

/** JSON-only API mutations: blocks cross-site form posts that skip CORS preflight. */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) {
    return next(new AppError(415, "unsupported_media_type"));
  }
  next();
};

/** Extracts a scoped credential from `Authorization: Bearer`, keeping it out of URLs and logs. */
export function bearerToken(req: Request): string {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header);
  return match ? match[1] : "";
}

export function limiter(windowMinutes: number, limit: number, enabled: boolean) {
  if (!enabled) return ((_req, _res, next) => next()) as RequestHandler;
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait and try again." }),
  });
}

export function errorHandler(ctx: AppContext) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) fields[issue.path.join(".") || "_"] = issue.message;
      return res.status(400).json({ error: "validation_error", fields });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message !== err.code ? err.message : undefined, fields: err.fields });
    }
    if ((err as any)?.type === "entity.too.large") return res.status(413).json({ error: "payload_too_large" });
    if ((err as any)?.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" });
    ctx.log.error("unhandled request error", { method: req.method, path: req.path, error: err as Error });
    res.status(500).json({ error: "internal_error" });
  };
}
