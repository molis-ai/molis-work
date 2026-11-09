import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `PPT page is missing ${selector}`);

export { textCell } from "@molis-ai/molis-work-plugin-sdk/browser";

/** The first line of a text, or `fallback` when it has none. */
export function firstLine(value: string | null | undefined, fallback = ""): string {
  const line = String(value || "").trim().split("\n")[0]!.trim();
  return line || fallback;
}
