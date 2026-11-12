import { safePagesTone } from "./tone.js";

/** Marks a callout can wear, drawn from the design-system sprite rather than emoji. */
export const PAGES_CALLOUT_ICONS = [
  { id: "info", label: "pages.editor.note-2" },
  { id: "idea", label: "pages.editor.idea" },
  { id: "alert", label: "pages.editor.heads-up" },
  { id: "risk", label: "pages.editor.risks" },
  { id: "check", label: "pages.editor.done" },
  { id: "star", label: "pages.editor.key-point" },
  { id: "flag", label: "pages.editor.flag" },
  { id: "target", label: "pages.editor.goal" },
  { id: "question", label: "pages.editor.question" },
  { id: "book", label: "pages.editor.reference" },
  { id: "zap", label: "pages.editor.action" },
  { id: "pin", label: "pages.editor.pinned" },
] as const;

const ICON_IDS = new Set<string>(PAGES_CALLOUT_ICONS.map((item) => item.id));

/** The mark four hues imply when no icon was chosen. */
const TONE_ICON: Record<string, string> = {
  cyan: "info",
  orange: "alert",
  green: "check",
  gray: "idea",
};

/** Resolve a callout tone to a palette hue; anything else is the default cyan. */
export function safePagesCalloutTone(value: unknown): string {
  return safePagesTone(String(value ?? "").trim().toLowerCase()) || "cyan";
}

/** Allowlist for an explicitly chosen icon; "" means "let the tone decide". */
export function safePagesCalloutIcon(value: unknown): string {
  const id = String(value ?? "").trim();
  return ICON_IDS.has(id) ? id : "";
}

/** The icon actually drawn: the chosen one, else the one this tone has always implied. */
export function calloutIconFor(icon: unknown, tone: unknown): string {
  return safePagesCalloutIcon(icon) || TONE_ICON[safePagesCalloutTone(tone)] || "info";
}
