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
