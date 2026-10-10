// Emits static HTML for public marketing routes so key content is in the initial response,
// plus sitemap.xml and robots.txt. Runs after `vite build` (client) and the SSR build.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "dist", "public");
const ssrEntry = path.join(root, "dist", "ssr", "entry-server.js");
const baseUrl = (process.env.PUBLIC_BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
const SITE_NAME = "Ascencio Cleaning Services";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// JSON-LD inside <script>: prevent "</script>" breakouts.
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

async function main() {
  const template = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  if (!template.includes("<!--app-html-->")) throw new Error("index.html is missing the <!--app-html--> placeholder");

  // Client-only shell for routes that should not be prerendered (admin, action links, manage page).
  fs.writeFileSync(path.join(publicDir, "app.html"), template.replace("<!--app-head-->", '<meta name="robots" content="noindex, nofollow" />').replace("<!--app-html-->", ""));

  const { render, PRERENDER_ROUTES } = (await import(pathToFileURL(ssrEntry).href)) as {
    render: (p: string) => { html: string; meta?: { title: string; description: string; path: string; noindex?: boolean; jsonLd?: Record<string, unknown>[] } };
    PRERENDER_ROUTES: string[];
  };

  for (const route of PRERENDER_ROUTES) {
    const { html, meta } = render(route);
    if (!meta) throw new Error(`Route ${route} did not call usePageMeta`);
    const fullTitle = meta.path === "/" ? meta.title : `${meta.title} | ${SITE_NAME}`;
    const canonical = `${baseUrl}${meta.path === "/" ? "/" : meta.path}`;
    const jsonLd = (meta.jsonLd ?? []).map((obj) => {
      const withUrls = JSON.parse(JSON.stringify(obj).replace(/"url":"\//g, `"url":"${baseUrl}/`));
      return `<script type="application/ld+json">${safeJson({ "@context": "https://schema.org", ...withUrls })}</script>`;
    });
    const head = [
      `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
      `<meta property="og:title" content="${escapeAttr(fullTitle)}" />`,
      `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
      `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
      `<meta name="robots" content="${meta.noindex ? "noindex, nofollow" : "index, follow"}" />`,
      ...jsonLd,
    ].join("\n    ");

    const page = template
      .replace(/<html lang="en">/, '<html lang="en" data-prerendered="true">')
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(fullTitle)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttr(meta.description)}" />`)
      .replace("<!--app-head-->", head)
      .replace("<!--app-html-->", html);

    const outDir = route === "/" ? publicDir : path.join(publicDir, route);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), page);
    console.log(`prerendered ${route}`);
  }

  const indexable = PRERENDER_ROUTES;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((r) => `  <url><loc>${baseUrl}${r === "/" ? "/" : r}</loc></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemap);
  fs.writeFileSync(
    path.join(publicDir, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /action\nDisallow: /booking/manage\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`,
  );
  console.log(`wrote sitemap.xml and robots.txt for ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
