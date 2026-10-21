import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_MESSAGES } from "./messages.js";

type Values = Readonly<Record<string, string | number>>;
export type CodingText = (key: string, values?: Values) => string;

/**
 * Coding's stable keys in one language, `{name}` values filled in. Chinese is the default: the words that stay Chinese data
 * (the run report, the Agent's context) and a call no page made (a model's tool call, background work) use it.
 */
export function codingText(locale: ActionLocale = "zh"): CodingText {
  return (key, values = {}) => ((CODING_MESSAGES as Record<string, { zh: string; en: string }>)[key]?.[locale] ?? key)
    .replace(/\{(\w+)\}/g, (all, name: string) => name in values ? String(values[name]) : all);
}

export const codingZh = codingText("zh");

// The key each error raised through `codingError` was worded from, so the route can word it again in its caller's language.
const worded = new WeakMap<Error, { key: string; values: Values }>();

/**
 * An error worded from one of Coding's stable keys: `make` builds it (a plain `Error`, an `ActionError`, one of the declared
 * error codes) from the Chinese wording, which is what code that catches it inside Coding sees. `codingErrorIn` words it
 * again in the page's language as it leaves a route; its class, code, kind and details stay as they were.
 */
export function codingError<E extends Error>(make: (message: string) => E, key: string, values: Values = {}): E {
  const error = make(codingZh(key, values));
  worded.set(error, { key, values });
  return error;
}

/** The plain `Error` form of `codingError`. */
export const codingFailure = (key: string, values?: Values): Error => codingError(message => new Error(message), key, values);

/** A route's error in its caller's language, when Coding worded it from a key; any other error passes as it is. */
export function codingErrorIn(error: unknown, locale: ActionLocale | undefined): unknown {
  if (!(error instanceof Error) || !locale || locale === "zh") return error;
  const known = worded.get(error);
  if (known) error.message = codingText(locale)(known.key, known.values);
  return error;
}
