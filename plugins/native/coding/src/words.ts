import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

/** A value is a word or number as it is, or another of Coding's keys worded in the same language (a field's name). */
type Values = Readonly<Record<string, string | number | { readonly key: string }>>;
export type CodingText = (key: string, values?: Values) => string;

/** Use the calling activation's SDK context; nested field labels are read in the same language. */
export const codingText: CodingText = (key, values = {}) => t.text(key,
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([name, value]) => [name, typeof value === "object" ? codingText(value.key) : value])));

/**
 * An error worded from one of Coding's stable keys: `make` builds it (a plain `Error`, an `ActionError`, one of the declared
 * error codes) from the Chinese wording, which is what code that catches it inside Coding sees. `codingErrorIn` words it
 * again in the page's language as it leaves a route; its class, code, kind and details stay as they were.
 */
export function codingError<E extends Error>(make: (message: string) => E, key: string, values: Values = {}): E {
  return make(codingText(key, values));
}

/** The plain `Error` form of `codingError`. */
export const codingFailure = (key: string, values?: Values): Error => codingError(message => new Error(message), key, values);

/** A route's error in its caller's language, when Coding worded it from a key; any other error passes as it is, and a throw that is not an error becomes Coding's plain failure. */
export function codingErrorIn(error: unknown): unknown {
  if (!(error instanceof Error)) return codingFailure("coding.server.failed");
  const reported = error as Error & { codingKey?: string; codingValues?: Values };
  if (reported.codingKey) error.message = codingText(reported.codingKey, reported.codingValues);
  return error;
}
