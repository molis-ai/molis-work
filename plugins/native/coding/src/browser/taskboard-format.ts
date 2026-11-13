import { format } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { RowTime } from "./taskboard-types.js";

/** An icon of the page's sprite. */
export const svg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

export { cutWithEllipsis as clip } from "@molis-ai/molis-work-plugin-sdk/whole-units";
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
  const now = new Date(), stamp = date.toISOString();
  const text = format.date(stamp, date.toDateString() === now.toDateString() ? "time" : "month-day");
  return { text, title: format.date(stamp, "datetime-with-seconds") };
}
