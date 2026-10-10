const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for safe interpolation into HTML element content and quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Tagged template that escapes every interpolated value unless wrapped with `raw()`. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0];
  values.forEach((value, i) => {
    out += renderValue(value) + strings[i + 1];
  });
  return out;
}

class RawHtml {
  constructor(public readonly value: string) {}
}

/** Marks already-safe markup (output of `html` or static strings) to skip escaping. */
export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

function renderValue(value: unknown): string {
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return escapeHtml(value);
}
