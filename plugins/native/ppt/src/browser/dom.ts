import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";

const uiText = globalThis.t;

/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `PPT page is missing ${selector}`);

export { textCell } from "@molis-ai/molis-work-plugin-sdk/browser";

/** The first line of a text, or `fallback` when it has none. */
export function firstLine(value: string | null | undefined, fallback = ""): string {
  const line = String(value || "").trim().split("\n")[0]!.trim();
  return line || fallback;
}

/** A date as a short local day (with the year when it is not this one); empty when there is none to show. */
export function whenOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return uiText.text("common.generated.formatted", { value: dateArg(date.toISOString(), sameYear ? "month-day" : "date") });
}
