import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Assistant's existing business refusals; uncoded internal failures use the SDK's common internal error instead. */
export const assistantErrors = defineErrorCodes("assistant", {
  not_found: "not_found", expired: "not_found", scope: "forbidden",
  conflict: "conflict", pending_request: "conflict", busy: "conflict", stale: "conflict", state: "conflict", needs_check: "conflict",
  invalid: "invalid", authority: "invalid", empty_reply: "invalid", limit: "invalid", unsupported: "invalid", budget: "invalid", action_revoked: "invalid", failed: "invalid",
  character_unavailable: "invalid", executor_unavailable: "invalid", model_missing: "invalid", runtime_busy: "invalid",
  cancelled: "cancelled",
});
