export type AttrValue = string | number | boolean | undefined | null;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function renderAttrs(attrs?: Record<string, AttrValue>): string {
  if (!attrs) return "";
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
    .join("");
}
