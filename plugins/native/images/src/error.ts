import type { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Images' own error codes, every one `images.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status (plugin SDK
 * `actionHttpStatus`), so Images keeps no status table of its own. Every status is the one the code was raised with before: what the vendor
 * did wrong 502, what has to be set up first 409, a wait that ran out 504, too many runs at once 429.
 */
export const imagesErrors = defineErrorCodes("images", {
  already_open: "conflict",
  busy: "rate_limited",
  cancelled: "conflict",
  closed: "unavailable",
  connection_changed: "conflict",
  connection_invalid: "conflict",
  /** The Host's edge answers an unexpected failure with this and a plain sentence, never the failure's own text. */
  internal: "internal",
  invalid: "invalid",
  invalid_image: "upstream",
  invalid_url: "invalid",
  key_required: "conflict",
  no_image: "upstream",
  not_found: "not_found",
  not_sent: "conflict",
  provider_http: "upstream",
  request_conflict: "conflict",
  response_too_large: "upstream",
  running: "conflict",
  runtime_unavailable: "unavailable",
  save_failed: "internal",
  timeout: "timeout",
});

/** Whether a failure is Images' own (read by its code, not its class: another copy of the contracts makes another class). */
export function isImagesFailure(error: unknown): error is ActionError {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.startsWith("images.");
}
