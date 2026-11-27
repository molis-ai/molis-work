import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { NoteEditor } from "./types.js";

const t = globalThis.t;

export const civil = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const dayDate = (key: string): Date => new Date(`${key}T12:00:00`);
export const addDays = (key: string, days: number): string => {
  const date = dayDate(key);
  date.setDate(date.getDate() + days);
  return civil(date);
};
export const dayOffset = (from: string, to: string): number =>
  Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / 86400000);
/** Monday of the week `key` is in. */
export const weekStart = (key: string): string => addDays(key, -((dayDate(key).getDay() + 6) % 7));
const formatted = (key: string, style: Parameters<typeof dateArg>[1]): string =>
  t.text("common.generated.formatted", { value: dateArg(key, style) });
export const dateLabel = (key: string): string => formatted(key, "weekday-month-day");
export const shortDate = (key: string): string => formatted(key, "month-day");
export const monthLabel = (key: string): string => formatted(key, "year-month");
export const weekdayLabel = (key: string, narrow = false): string =>
  formatted(key, narrow ? "weekday-narrow" : "weekday");
/** 今天 / 明天 / 昨天, or nothing. */
export const relativeDay = (key: string): string => {
  const offset = dayOffset(civil(), key);
  return offset === 0
    ? t.text("jelly.day.today")
    : offset === 1
      ? t.text("jelly.day.tomorrow")
      : offset === -1
        ? t.text("jelly.day.yesterday")
        : "";
};
export const clockLabel = (minutes: number | null): string =>
  minutes === null
    ? ""
    : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const parseClock = (value: string): number | null =>
  /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
export const homeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const TONES = ["blue", "green", "amber", "red", "purple", "teal", "gray"] as const;
export type Tone = (typeof TONES)[number];
// Stored category colours: these hex values identify a saved choice and must match existing data; the swatches draw from tokens.
export const TONE_COLORS: Record<Tone, string> = {
  blue: "#5E6AD2",
  green: "#2D7A5A",
  amber: "#8A5C18",
  red: "#B03D45",
  purple: "#8B5CF6",
  teal: "#3D6F78",
  gray: "#8E8E93",
};
export const toneOf = (color: unknown): Tone =>
  TONES.find((tone) => TONE_COLORS[tone].toLowerCase() === String(color).toLowerCase()) ?? "blue";

/** A note editor with nothing open: for the chosen day's note, or the notes tab. */
export const blankNote = (day: string | null = null): NoteEditor => ({
  note: null,
  day,
  body: "",
  dirty: false,
  saving: false,
  conflict: false,
  timer: 0,
});
