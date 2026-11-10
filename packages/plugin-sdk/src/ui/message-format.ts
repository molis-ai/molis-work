import { TEXT_REF_LIMITS, type TextArg, type TextDateOptions, type TextDateStyle, type TextNumberStyle, type UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import { fillMessage } from "../message-text.js";

// One sentence, formatted (specs/font-and-skin-system/a-section-contract.md §3.5). The plural form is chosen and the values are written with
// `Intl`; `fillMessage` still does the replacing, so there is one way of filling a message. Nothing here escapes: the callers do that once, on the whole text.

export interface MessageFormatOptions {
  /** The moment `relative` counts from; tests fix it. */
  readonly now?: number;
  /** Told when an argument cannot be shown as asked: a bad date, a plural whose argument is not a number. */
  readonly problem?: (code: string) => void;
}

type Locale = string | undefined;

/** Intl is the authority on the zones this runtime can actually display. */
export function isTextTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.length || value.length > TEXT_REF_LIMITS.arg_time_zone) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

const NUMBER_OPTIONS: Readonly<Record<TextNumberStyle, Intl.NumberFormatOptions>> = {
  decimal: {},
  percent: { style: "percent" },
  compact: { notation: "compact" },
};

const DATE_OPTIONS: Readonly<Record<Exclude<TextDateStyle, "relative">, Intl.DateTimeFormatOptions>> = {
  date: { dateStyle: "medium" },
  time: { timeStyle: "short" },
  datetime: { dateStyle: "medium", timeStyle: "short" },
  "time-with-seconds": { hour: "numeric", minute: "numeric", second: "numeric" },
  "datetime-with-seconds": { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" },
  weekday: { weekday: "long" },
  "weekday-narrow": { weekday: "narrow" },
  "month-day": { month: "long", day: "numeric" },
  "weekday-month-day": { weekday: "short", month: "long", day: "numeric" },
  "year-month": { year: "numeric", month: "long" },
};

const SECONDS_IN: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [["year", 31_536_000], ["month", 2_592_000], ["day", 86_400], ["hour", 3_600], ["minute", 60]];

/** ISO 8601 only, so the runtime's own guesses at other spellings cannot differ between a server and a browser. */
const ISO_AT = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u;

interface Moment { readonly ms: number; readonly dateOnly: boolean }

function momentOf(at: string): Moment | null {
  const match = ISO_AT.exec(at);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  if (match[4] === undefined) return { ms: calendar.getTime(), dateOnly: true };
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? null : { ms, dateOnly: false };
}

function relativeText(moment: Moment, locale: Locale, now: number): string {
  const today = new Date(now);
  // A date without a time counts whole days from today's date where the reader is: it has no moment to count from.
  const seconds = (moment.dateOnly ? moment.ms - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) : moment.ms - now) / 1000;
  const size = Math.abs(seconds);
  const smallest: readonly [Intl.RelativeTimeFormatUnit, number] = moment.dateOnly ? ["day", 86_400] : ["second", 1];
  const [unit, length] = SECONDS_IN.find(([, inUnit]) => size >= inUnit) ?? smallest;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(seconds / length), unit);
}

function dateText(moment: Moment, style: TextDateStyle, locale: Locale, now: number, timeZone?: string): string {
  if (style === "relative") return relativeText(moment, locale, now);
  const options = DATE_OPTIONS[style];
  // A date without a time is shown as it is written: no zone can move it to another day, and it has no time to show.
  if (moment.dateOnly) return new Intl.DateTimeFormat(locale, { ...(options.hour || options.timeStyle ? DATE_OPTIONS.date : options), timeZone: "UTC" }).format(moment.ms);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(moment.ms);
}

/** A date in the language. A value that cannot be read is shown as written and reported: one bad row does not fail a whole render. */
export function formatDate(at: string, style: TextDateStyle, locale: Locale, options: MessageFormatOptions & TextDateOptions = {}): string {
  const timeZone = options.time_zone;
  if (timeZone !== undefined && !isTextTimeZone(timeZone)) { options.problem?.("ui.text_bad_time_zone"); return at; }
  try {
    const moment = momentOf(at);
    // With an explicit zone, a time must be an instant, not an unqualified local wall time.
    if (moment !== null && (timeZone === undefined || moment.dateOnly || /(?:Z|[+-]\d{2}:\d{2})$/u.test(at))) {
      return dateText(moment, style, locale, options.now ?? Date.now(), timeZone);
    }
  } catch {
    // `Intl` refusing it (a year out of its range) is the same bad value as one that does not parse: reported below.
  }
  options.problem?.("ui.text_bad_date");
  return at;
}

/** A number in the language. No style means `decimal`, which groups digits. */
export function formatNumber(value: number, locale: Locale, style: TextNumberStyle = "decimal"): string {
  return new Intl.NumberFormat(locale, NUMBER_OPTIONS[style]).format(value);
}

function argText(arg: TextArg, locale: Locale, options: MessageFormatOptions): string {
  if (arg.kind === "text") return arg.text;
  if (arg.kind === "date") return formatDate(arg.at, arg.style, locale, { ...options, time_zone: arg.time_zone });
  // A plain number may be a year, a port or a version, and none of those are grouped: grouping is asked for by a style.
  return arg.style === undefined ? new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(arg.number) : formatNumber(arg.number, locale, arg.style);
}

function pluralText(message: Exclude<UiMessage, string>, args: readonly TextArg[], locale: Locale, options: MessageFormatOptions): string {
  const arg = args.find((candidate) => candidate.name === message.plural_arg);
  if (arg?.kind !== "number") {
    options.problem?.("ui.text_plural_arg");
    return message.forms.other;
  }
  return message.forms[new Intl.PluralRules(locale).select(arg.number)] ?? message.forms.other;
}

/** The text of a message in a language: the plural form chosen by the number's value, then every argument written in. */
export function formatMessage(message: UiMessage, args: readonly TextArg[] = [], locale?: string, options: MessageFormatOptions = {}): string {
  const text = typeof message === "string" ? message : pluralText(message, args, locale, options);
  return fillMessage(text, Object.fromEntries(args.map((arg) => [arg.name, argText(arg, locale, options)])));
}
