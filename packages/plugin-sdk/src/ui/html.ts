export type AttrValue = string | number | boolean | undefined | null;

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
export const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, char => ENTITIES[char]!);

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
