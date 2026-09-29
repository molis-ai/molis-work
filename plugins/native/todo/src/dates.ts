/** Calendar dates are YYYY-MM-DD in the person's own time zone (this computer's). */
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/u;

export function isTodoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isTodoTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

/** An instant must carry its offset so "09:00" never silently means another zone's morning. */
export function isTodoInstant(value: unknown): value is string {
  return typeof value === "string" && OFFSET.test(value.trim()) && Number.isFinite(Date.parse(value));
}

export function localDate(at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}
