import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Jelly's own error codes, every one `jelly.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status (plugin SDK
 * `actionHttpStatus`), so Jelly keeps no status table of its own. Every status is the one the code was raised with before: an edit over a newer
 * revision, a proposal over a source that changed, and a preview that went stale are 409; a note that is not there 404; damaged data 500.
 */
export const jellyErrors = defineErrorCodes("jelly", {
  /** The model answered, but not with a plan Jelly can use. */
  ai_invalid: "invalid",
  /** No text model is configured. */
  ai_unavailable: "invalid",
  cancelled: "cancelled",
  confirmation_required: "conflict",
  conflict: "conflict",
  /** The stored workspace failed its checksum or its shape; the database is kept and nothing blank is written over it. */
  corrupt: "internal",
  import_conflict: "conflict",
  invalid: "invalid",
  linked_task: "conflict",
  no_history: "conflict",
  not_found: "not_found",
  schedule_conflict: "conflict",
  source_changed: "conflict",
  stale_preview: "conflict",
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
