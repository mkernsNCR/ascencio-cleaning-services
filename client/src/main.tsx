import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { createQueryClient } from "./lib/queryClient";
import { captureAttribution } from "./lib/analytics";
import "./index.css";

captureAttribution();
const container = document.getElementById("root")!;
const queryClient = createQueryClient();

if (container.hasChildNodes() && document.documentElement.dataset.prerendered === "true") {
  // Prerendered marketing HTML: hydrate in English, then the locale provider applies the visitor's choice.
  hydrateRoot(container, <App queryClient={queryClient} initialLocale="en" />);
} else {
  createRoot(container).render(<App queryClient={queryClient} />);
}
