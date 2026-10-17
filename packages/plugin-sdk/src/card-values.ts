/**
 * What an action card's controls hold, read back as the strings its input takes (specs/ai-interaction-experience H2, D26):
 * kept once, for every keeper of cards and the card that draws them.
 */

/** A moment's wall clock in a zone (the process's own when none is set): its day, its time and the zone's offset. */
export function wallClockIn(at: number, zone: string | undefined): { day: string; time: string; offset: string; utc: number } {
  const part = Object.fromEntries(new Intl.DateTimeFormat("en-US", { ...(zone ? { timeZone: zone } : {}), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).formatToParts(at).map(item => [item.type, item.value]));
  return { day: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}`, offset: String(part.timeZoneName ?? ""),
    utc: Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute)) };
}

/** The instant a day and a time name in a zone, or null when they name none (a malformed value, or a time the clock skips). */
export function instantIn(day: string, time: string, zone: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim()), clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match || !clock) return null;
  const wanted = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  // Date.UTC rolls a 25th hour or a 32nd day over into the next one: a value that does not read back as written names nothing.
  if (new Date(wanted).toISOString().slice(0, 16) !== `${match[1]}-${match[2]}-${match[3]}T${clock[1]!.padStart(2, "0")}:${clock[2]}`) return null;
  let at = wanted;
  for (let step = 0; step < 2; step += 1) at += wanted - wallClockIn(at, zone).utc;
  return Number.isFinite(at) && wallClockIn(at, zone).utc === wanted ? new Date(at).toISOString() : null;
}

/**
 * What a card's controls hold, as the strings its input takes: a pick by its value, a day as it is, a moment as the exact
 * instant it names in the person's zone. A moment that names none is sent as written, so the input's check says what is wrong.
 */
export function cardInputValues(values: unknown, zone: string | undefined): Record<string, string> {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(Object.entries(values as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === "string") return [key, value];
    if (Array.isArray(value)) return [key, String(value[0] ?? "")];
    const held = (value ?? {}) as { date?: unknown; time?: unknown; picked?: unknown };
    if (typeof held.date === "string" && typeof held.time === "string") {
      return [key, held.date.trim() || held.time.trim() ? instantIn(held.date, held.time, zone) ?? `${held.date} ${held.time}`.trim() : ""];
    }
    return [key, Array.isArray(held.picked) ? String(held.picked[0] ?? "") : ""];
  }));
}
