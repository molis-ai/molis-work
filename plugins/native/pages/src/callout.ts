import { safePagesTone } from "./tone.js";

/** Marks a callout can wear, drawn from the design-system sprite rather than emoji. */
export const PAGES_CALLOUT_ICONS = [
  { id: "info", label: "提示" },
  { id: "idea", label: "想法" },
  { id: "alert", label: "注意" },
  { id: "risk", label: "风险" },
  { id: "check", label: "完成" },
  { id: "star", label: "重点" },
  { id: "flag", label: "标记" },
  { id: "target", label: "目标" },
  { id: "question", label: "疑问" },
  { id: "book", label: "参考" },
  { id: "zap", label: "行动" },
  { id: "pin", label: "钉住" },
] as const;

const ICON_IDS = new Set<string>(PAGES_CALLOUT_ICONS.map((item) => item.id));

/** Tones written before callouts used the shared palette; they must keep rendering the same. */
const LEGACY_TONES: Record<string, string> = {
  info: "cyan",
  warn: "orange",
  success: "green",
  plain: "gray",
};

/** The mark a legacy tone used to imply, kept as the default when no icon was chosen. */
const TONE_ICON: Record<string, string> = {
  cyan: "info",
  orange: "alert",
  green: "check",
  gray: "idea",
};

/** Resolve a callout tone to a palette hue, folding the four legacy names in. */
export function safePagesCalloutTone(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return safePagesTone(LEGACY_TONES[raw] ?? raw) || "cyan";
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
