import express, { type Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import type { AppContext } from "../context";
import { errorHandler, requireJson } from "./middleware";
import { legacyActionRoutes, publicRoutes } from "./routes/public";
import { actionRoutes } from "./routes/actions";
import { adminRoutes } from "./routes/admin";
import { googleAdminRoutes, googleWebhookRoutes } from "./routes/google";

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  if (ctx.config.trustProxy) app.set("trust proxy", 1);

  app.use(
    helmet({
      // Vite's dev server injects inline scripts; enforce a strict CSP only for built assets.
      contentSecurityPolicy: ctx.config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              // No inline executable scripts are emitted (JSON-LD data blocks are not executed).
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              baseUri: ["'self'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // Request log: method, path, status, and duration only. Never bodies, query strings, or tokens.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api")) ctx.log.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  // Google push notifications arrive with an empty body and no JSON content type.
  app.use("/api/integrations/google", googleWebhookRoutes(ctx));

  app.use("/api", express.json({ limit: "32kb" }), requireJson);

  const PgStore = connectPgSimple(session);
  app.use(
    "/api",
    session({
      store: new PgStore({ pool: ctx.pool, tableName: "session", createTableIfMissing: false, pruneSessionInterval: 60 * 15 }),
      name: "acs.sid",
      secret: ctx.config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: ctx.config.production,
        maxAge: 8 * 3600 * 1000,
        path: "/api",
      },
    }),
  );

  app.use("/api", legacyActionRoutes());
  app.use("/api", publicRoutes(ctx));
  app.use("/api/actions", actionRoutes(ctx));
  app.use("/api/admin/google", googleAdminRoutes(ctx));
  app.use("/api/admin", adminRoutes(ctx));
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(errorHandler(ctx));
  return app;
}
