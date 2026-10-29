import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { attentionErrors, inboxErrors } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { feedErrors } from "./contract/feed.js";
import type { SourceHistoryDecision } from "./projection.js";

/** An Attention module refusal reaches callers as a declared failure: the Inbox's for a missing entry, Feed's for the rest. */
export function callAttention<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ActionError && error.code.startsWith("attention.") && Object.hasOwn(attentionErrors, error.code.slice("attention.".length))) {
      throw error.code === "attention.entry_not_found" ? inboxErrors.entry_not_found(error.message)
        : error.code === "attention.revision_conflict" ? feedErrors.revision_conflict(error.message)
          : feedErrors.invalid_transition(error.message);
    }
    throw error;
  }
}

export function assertSourceHistoryDecision(value: unknown): asserts value is SourceHistoryDecision {
  if (value !== "retain_history" && value !== "delete_local_history") {
    throw feedErrors.contract_source_history_decision_required("feed.contract_source_history_decision_required");
  }
}

export type FeedPublicErrorCategory =
  | "auth"
  | "configuration"
  | "network"
  | "provider"
  | "rate_limit"
  | "stale_cursor"
  | "conflict"
  | "not_found"
  | "invalid_state"
  | "interrupted"
  | "unknown";

export interface FeedPublicError {
  code: string;
  category: FeedPublicErrorCategory;
  retryable: boolean;
  user_action: "reconnect" | "fix_configuration" | "retry" | "refresh" | "resume" | "contact_support";
  safe_message: string;
}

export function toFeedPublicError(error: unknown): FeedPublicError {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; details?: unknown } : {};
  // A failure the provider reported carries the provider's own code in its details; that is the code a run and a source fault store.
  const reported = value.details && typeof value.details === "object" ? (value.details as { error_code?: unknown }).error_code : undefined;
  const code = typeof reported === "string" && reported ? reported : typeof value.code === "string" && value.code ? value.code : "feed.unknown";
  const message = typeof value.message === "string" && value.message
    ? value.message.slice(0, 400)
    : "信息流操作失败";
  if (code === "feed.source_connection_changed" || code.includes("needs_auth") || code.includes("credential")) {
    return { code, category: "auth", retryable: false, user_action: "reconnect", safe_message: message };
  }
  if (code.includes("stale")) {
    return { code, category: "stale_cursor", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("network")) {
    return { code, category: "network", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("rate_limited")) {
    return { code, category: "rate_limit", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("provider")) {
    return { code, category: "provider", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("interrupted")) {
    return { code, category: "interrupted", retryable: true, user_action: "retry", safe_message: message };
  }
  if (code.includes("conflict") || code === "feed.source_changed") {
    return { code, category: "conflict", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("not_found")) {
    return { code, category: "not_found", retryable: false, user_action: "refresh", safe_message: message };
  }
  if (code.includes("paused")) {
    return { code, category: "invalid_state", retryable: false, user_action: "resume", safe_message: message };
  }
  if (code.includes("invalid") || code.includes("configuration") || code.includes("wrong_sync_kind")) {
    return { code, category: "configuration", retryable: false, user_action: "fix_configuration", safe_message: message };
  }
  return { code, category: "unknown", retryable: false, user_action: "contact_support", safe_message: message };
}
