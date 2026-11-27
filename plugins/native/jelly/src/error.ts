import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Jelly's own error codes, every one `jelly.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status, so Jelly keeps
 * no status table of its own: an edit over a newer revision of the same entry is 409, an entry that is not there 404, a damaged row 500.
 */
export const jellyErrors = defineErrorCodes("jelly", {
  /** The entry changed since it was read; `details` names it and its current revision. Only that entry is affected. */
  conflict: "conflict",
  /** A stored row failed its shape; nothing is written over it. */
  corrupt: "internal",
  invalid: "invalid",
  not_found: "not_found",
});

/** Whether a failure is Jelly's own (read by its code, not its class: another copy of the contracts makes another class). */
export function isJellyFailure(error: unknown): error is ActionError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("jelly.");
}

/** A check on a request or on stored data: when it fails, the failure is the raiser's (a request that cannot be done, unless the caller says otherwise). */
export function jellyAssert(condition: unknown, message: string, raise: (message: string) => ActionError = jellyErrors.invalid): asserts condition {
  if (!condition) throw raise(message);
}
