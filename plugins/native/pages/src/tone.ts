/** Writing tones, each backed by a design-system hue so both themes stay correct. */
export const PAGES_TONES = [
  { id: "gray", label: "灰" },
  { id: "brown", label: "棕" },
  { id: "orange", label: "橙" },
  { id: "yellow", label: "黄" },
  { id: "green", label: "绿" },
  { id: "blue", label: "蓝" },
  { id: "purple", label: "紫" },
  { id: "pink", label: "粉" },
  { id: "red", label: "红" },
] as const;

const TONE_IDS = new Set<string>(PAGES_TONES.map((tone) => tone.id));

/** Keep tone attributes on the allowlist so a stored document can never inject its own colour. */
export function safePagesTone(value: unknown): string {
  const id = String(value ?? "").trim().toLowerCase();
  return TONE_IDS.has(id) ? id : "";
}

const CSS_TONES: Record<string, string> = {
  red: "red",
  blue: "blue",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  purple: "purple",
  pink: "pink",
  gray: "gray",
  grey: "gray",
  brown: "brown",
  "rgb(255,0,0)": "red",
  "#ff0000": "red",
  "#f00": "red",
  "rgb(0,0,255)": "blue",
  "#0000ff": "blue",
  "rgb(255,255,0)": "yellow",
  "#ffff00": "yellow",
  "rgb(0,128,0)": "green",
  "#008000": "green",
};

/** Map a CSS colour name or a few common values onto the design-system tones. Anything else is dropped. */
export function toneFromCssColor(value: unknown): string {
  const named = safePagesTone(value);
  if (named) return named;
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/gu, "");
  return CSS_TONES[raw] ?? "";
}
