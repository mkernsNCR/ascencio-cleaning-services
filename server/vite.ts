import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true as const },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");
      // always reload the index.html file from disk in case it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// Client-only routes that render from the SPA shell (not prerendered, not indexed).
const CLIENT_ONLY = [/^\/booking\/manage\/?$/, /^\/action\/?$/, /^\/admin(\/.*)?$/];

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
  app.use(express.static(distPath, { index: false, redirect: false, maxAge: "1h" }));

  const shell = path.resolve(distPath, "index.html");
  app.get("*", (req, res) => {
    res.set("Cache-Control", "no-cache");
    // Prerendered marketing pages: dist/public/<route>/index.html contains initial HTML content.
    const clean = path.posix.normalize(req.path).replace(/\/+$/, "");
    if (!clean.includes("..")) {
      const prerendered = path.join(distPath, clean, "index.html");
      if (clean && fs.existsSync(prerendered)) return res.sendFile(prerendered);
    }
    if (req.path === "/" ) return res.sendFile(path.join(distPath, "index.html"));
    if (CLIENT_ONLY.some((re) => re.test(req.path))) {
      res.set("X-Robots-Tag", "noindex");
      return res.sendFile(path.join(distPath, "app.html"));
    }
    // Unknown route: SPA renders its not-found view, with an honest 404 status.
    res.status(404).sendFile(fs.existsSync(path.join(distPath, "app.html")) ? path.join(distPath, "app.html") : shell);
  });
}
