import type { RowTime } from "./taskboard-types.js";

/** An icon of the page's sprite. */
export const svg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

export const clip = (text: string, max: number) => text.length > max ? text.slice(0, max - 1) + "…" : text;
export const firstLine = (text: string | undefined) => (text || "").trim().split("\n")[0] ?? "";
export const oneLine = (text: string | undefined) => (text || "").replace(/\s+/g, " ").trim();

/** A name's colour on the colour wheel, so the same name is always the same colour. */
export function hue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return value;
}

/** A moment as a row shows it: the time today, the day otherwise; none when it is unknown. */
export function when(at: string | number | null | undefined): RowTime | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
  const text = date.toDateString() === now.toDateString() ? pad(date.getHours()) + ":" + pad(date.getMinutes()) : new Intl.DateTimeFormat(document.documentElement.lang || "zh-CN", { month: "short", day: "numeric" }).format(date);
  return { text, title: date.toLocaleString() };
}
