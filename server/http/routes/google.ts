import { Router } from "express";
import type { AppContext } from "../../context";
import { badRequest, unavailable } from "../../lib/errors";
import { randomToken, timingSafeEqualStr } from "../../lib/crypto";
import {
  buildAuthUrl, clearConnection, createPkce, decryptRefreshToken, exchangeCode, loadConnection, oauthConfigured, revokeToken, saveConnection,
} from "../../integrations/google-calendar/oauth";
import { GoogleCalendarGateway } from "../../integrations/google-calendar/google";
import { handleWebhook } from "../../integrations/google-calendar/sync";
import { enqueueJob } from "../../jobs/queue";
import { asyncHandler, requireCsrf, requireStaff } from "../middleware";

const STATE_TTL_MS = 10 * 60_000;

/** Staff-only OAuth lifecycle and integration controls (mounted under /api/admin/google). */
export function googleAdminRoutes(ctx: AppContext) {
  const r = Router();
  r.use(requireStaff(ctx));

  r.get("/status", asyncHandler(async (_req, res) => {
    const health = await ctx.calendar.health();
    const row = await loadConnection(ctx.db);
    res.json({ ...health, mode: ctx.config.google.mode, configured: ctx.config.google.mode === "fake" || oauthConfigured(ctx.config), scopes: row?.scopes ?? [], connectedAt: row?.connectedAt ?? null });
  }));

  r.post("/connect", requireCsrf, asyncHandler(async (req, res) => {
    if (ctx.config.google.mode !== "google") throw badRequest("fake_mode", "Calendar is in fake mode; nothing to connect.");
    if (!oauthConfigured(ctx.config)) throw unavailable("oauth_not_configured", "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY.");
    const state = randomToken(24);
    const { verifier, challenge } = createPkce();
    req.session.oauth = { state, verifier, createdAt: Date.now() };
    res.json({ url: buildAuthUrl(ctx.config, state, challenge) });
  }));

  // Google redirects the staff browser here; the session cookie (SameSite=Lax) identifies the staff member.
  r.get("/callback", asyncHandler(async (req, res) => {
    const pending = req.session.oauth;
    req.session.oauth = undefined;
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!pending || Date.now() - pending.createdAt > STATE_TTL_MS || !state || !timingSafeEqualStr(state, pending.state)) {
      return res.redirect("/admin?google=state_error");
    }
    if (!code) return res.redirect("/admin?google=denied");
    try {
      const result = await exchangeCode(ctx.config, code, pending.verifier);
      await saveConnection(ctx.db, ctx.config, { refreshToken: result.refreshToken, scopes: result.scopes, email: result.email });
      if (ctx.calendar instanceof GoogleCalendarGateway) ctx.calendar.reset();
      await enqueueJob(ctx.db, { type: "calendar.watch_renew", uniqueKey: "periodic:watch", requeueIfDone: true });
      await enqueueJob(ctx.db, { type: "calendar.reconcile", uniqueKey: "periodic:reconcile", requeueIfDone: true });
      ctx.kick();
      res.redirect("/admin?google=connected");
    } catch (error) {
      ctx.log.warn("google oauth exchange failed", { error });
      res.redirect("/admin?google=exchange_error");
    }
  }));

  r.post("/disconnect", requireCsrf, asyncHandler(async (_req, res) => {
    const row = await loadConnection(ctx.db);
    if (row?.encryptedRefreshToken) {
      try {
        await revokeToken(decryptRefreshToken(ctx.config, row.encryptedRefreshToken));
      } catch {
        // Revocation is best effort; the stored credential is removed regardless.
      }
    }
    await clearConnection(ctx.db);
    if (ctx.calendar instanceof GoogleCalendarGateway) ctx.calendar.reset();
    res.json({ ok: true });
  }));

  r.get("/calendars", asyncHandler(async (_req, res) => {
    res.json(await ctx.calendar.listCalendars());
  }));

  r.post("/sync-now", requireCsrf, asyncHandler(async (_req, res) => {
    await enqueueJob(ctx.db, { type: "calendar.reconcile", uniqueKey: "periodic:reconcile", requeueIfDone: true });
    ctx.kick();
    res.json({ ok: true });
  }));

  return r;
}

/** Push notification endpoint. Acknowledges fast and queues a sync. */
export function googleWebhookRoutes(ctx: AppContext) {
  const r = Router();
  r.post("/webhook", asyncHandler(async (req, res) => {
    const result = await handleWebhook(ctx, {
      channelId: req.get("x-goog-channel-id") ?? undefined,
      token: req.get("x-goog-channel-token") ?? undefined,
      resourceId: req.get("x-goog-resource-id") ?? undefined,
      state: req.get("x-goog-resource-state") ?? undefined,
    });
    res.status(result.accepted ? 200 : 404).end();
  }));
  return r;
}
