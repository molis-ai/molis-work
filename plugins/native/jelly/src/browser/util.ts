const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
export const glyph = (name: string): string => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
export const uid = (): string => crypto.randomUUID();
export const civil = (date = new Date()): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const dayDate = (key: string): Date => new Date(`${key}T12:00:00`);
export const addDays = (key: string, days: number): string => {
  const date = dayDate(key);
  date.setDate(date.getDate() + days);
  return civil(date);
};
export const dayOffset = (from: string, to: string): number => Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / 86400000);
const lang = (): string | undefined => document.documentElement.lang || undefined;
export const dateLabel = (key: string, short = false): string =>
  dayDate(key).toLocaleDateString(lang(), short ? { month: "short", day: "numeric" } : { month: "long", day: "numeric", weekday: "short" });
export const monthLabel = (key: string): string => dayDate(key).toLocaleDateString(lang(), { year: "numeric", month: "long" });
export const clockLabel = (minutes: number | null | undefined): string =>
  minutes === null || minutes === undefined ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const parseClock = (value: string): number | null => (value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null);
/** Monday-based weekday index of a date (0 = Monday). */
export const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7;

export const TONES = ["blue", "green", "amber", "red", "purple", "teal", "gray"] as const;
export type Tone = (typeof TONES)[number];
// Stored category colours: these hex values identify a saved choice and must match existing data; the swatches draw from tokens.
export const TONE_COLORS: Record<Tone, string> = { blue: "#5E6AD2", green: "#2D7A5A", amber: "#8A5C18", red: "#B03D45", purple: "#8B5CF6", teal: "#3D6F78", gray: "#737882" };
export const toneOf = (color: unknown): Tone => TONES.find((tone) => TONE_COLORS[tone].toLowerCase() === String(color).toLowerCase()) ?? "blue";

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export const statusOf = (error: unknown): number | undefined => (error as { status?: number } | null)?.status;
export const isAbort = (error: unknown): boolean => (error as { name?: string } | null)?.name === "AbortError";
export const sleep0 = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });
