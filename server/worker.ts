// Standalone worker process for deployments that run web and background work separately
// (set RUN_WORKER=false on web instances).
import { bootstrap } from "./bootstrap";
import { startWorker } from "./jobs/worker";

(async () => {
  const ctx = await bootstrap();
  const worker = startWorker(ctx);
  ctx.kick = worker.kick;
  const shutdown = async () => {
    await worker.stop();
    await ctx.pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})().catch((error) => {
  console.error("Fatal worker error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
