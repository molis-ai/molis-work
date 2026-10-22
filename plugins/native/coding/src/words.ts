import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { CODING_MESSAGES } from "./messages.js";

/** A value is a word or number as it is, or another of Coding's keys worded in the same language (a field's name). */
type Values = Readonly<Record<string, string | number | { readonly key: string }>>;
export type CodingText = (key: string, values?: Values) => string;

/**
 * Coding's stable keys in one language, `{name}` values filled in by the SDK's `fillMessage`. Chinese is the default: the words that stay Chinese data
 * (the run report, the Agent's context) and a call no page made (a model's tool call, background work) use it.
 */
export function codingText(locale: ActionLocale = "zh"): CodingText {
  const say: CodingText = (key, values = {}) => fillMessage((CODING_MESSAGES as Record<string, { zh: string; en: string }>)[key]?.[locale] ?? key,
    Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([name, value]) => [name, typeof value === "object" ? say(value.key) : value])));
  return say;
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

/** A route's error in its caller's language, when Coding worded it from a key; any other error passes as it is, and a throw that is not an error becomes Coding's plain failure. */
export function codingErrorIn(error: unknown, locale: ActionLocale | undefined): unknown {
  if (!(error instanceof Error)) return codingErrorIn(codingFailure("coding.server.failed"), locale);
  if (!locale || locale === "zh") return error;
  const known = worded.get(error) ?? ((error as Error & { codingKey?: string; codingValues?: Values }).codingKey
    ? { key: (error as Error & { codingKey: string }).codingKey, values: (error as Error & { codingValues?: Values }).codingValues ?? {} } : null);
  if (known) error.message = codingText(locale)(known.key, known.values);
  return error;
}
