import type { SourceHistoryDecision } from "./projection.js";
export class FeedStoreError extends Error {
  constructor(
    readonly code:
      | "feed_item_not_found"
      | "inbox_entry_not_found"
      | "feed_source_not_found"
      | "feed_revision_conflict"
      | "feed_invalid_transition"
      | "feed_read_not_supported"
      | "feed_out_rule_not_found",
    message: string,
  ) {
    super(message);
    this.name = "FeedStoreError";
  }
}

export function assertSourceHistoryDecision(value: unknown): asserts value is SourceHistoryDecision {
  if (value !== "retain_history" && value !== "delete_local_history") {
    throw new Error("feed_contract_source_history_decision_required");
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
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof value.code === "string" && value.code ? value.code : "feed_unknown";
  const message = typeof value.message === "string" && value.message
    ? value.message.slice(0, 400)
    : "信息流操作失败";
  if (code.includes("needs_auth") || code.includes("credential")) {
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
  if (code.includes("conflict")) {
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
