// Build-time renderer used by scripts/prerender.ts to emit initial HTML for marketing routes.
import { renderToString } from "react-dom/server";
import App from "./App";
import { createQueryClient } from "./lib/queryClient";
import { SsrMetaContext, type PageMeta } from "./lib/seo";

export function render(path: string): { html: string; meta?: PageMeta } {
  const collected: { meta?: PageMeta } = {};
  const html = renderToString(
    <SsrMetaContext.Provider value={collected}>
      <App queryClient={createQueryClient()} ssrPath={path} initialLocale="en" />
    </SsrMetaContext.Provider>,
  );
  return { html, meta: collected.meta };
}

export { PRERENDER_ROUTES } from "./routes";
