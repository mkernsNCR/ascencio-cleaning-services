import { createServer } from "http";
import { bootstrap } from "./bootstrap";
import { createApp } from "./http/app";
import { startWorker } from "./jobs/worker";
import { setupVite, serveStatic } from "./vite";

(async () => {
  const ctx = await bootstrap();
  const app = createApp(ctx);
  const server = createServer(app);

  // Vite/static serving goes last so the SPA catch-all doesn't shadow API routes.
  if (!ctx.config.production) await setupVite(app, server);
  else serveStatic(app);

  const worker = ctx.config.runWorker ? startWorker(ctx) : null;
  if (worker) ctx.kick = worker.kick;
  else ctx.log.warn("RUN_WORKER=false: run `npm run worker` separately so jobs and mail are processed.");

  server.listen({ port: ctx.config.port, host: "0.0.0.0" }, () => ctx.log.info(`serving on port ${ctx.config.port}`));

  const shutdown = async () => {
    ctx.log.info("shutting down");
    server.close();
    await worker?.stop();
    await ctx.pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})().catch((error) => {
  console.error("Fatal startup error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
