import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Assistant's existing business refusals; uncoded internal failures use the SDK's common internal error instead. */
export const assistantErrors = defineErrorCodes("assistant", {
  not_found: "not_found", expired: "not_found", scope: "forbidden", action_revoked: "forbidden",
  conflict: "conflict", pending_request: "conflict", busy: "conflict", stale: "conflict", state: "conflict", needs_check: "conflict",
  invalid: "invalid", authority: "invalid", empty_reply: "invalid", limit: "invalid", unsupported: "invalid", budget: "invalid", failed: "invalid",
  character_unavailable: "invalid", executor_unavailable: "invalid", model_missing: "invalid", runtime_busy: "invalid",
  cancelled: "cancelled",
});

/**
 * `read()`, or null when what it reads is not there (`assistant.not_found`: deleted, or never this person's). Any other failure,
 * such as a store that cannot be read, is thrown: it is not a deletion (BL-810).
 */
export function whenThere<T>(read: () => T): T | null {
  try { return read(); } catch (error) {
    if (error instanceof ActionError && error.code === "assistant.not_found") return null;
    throw error;
  }
}
