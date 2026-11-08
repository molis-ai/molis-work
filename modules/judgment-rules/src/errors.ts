import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Functions' own error codes, every one `functions.<reason>`. The kind is the sort of failure; the Host's edge turns it into the
 * status (SDK `actionHttpStatus`), so Functions keeps no status table of its own. Every status is the one the Functions route
 * answered before, except a rejected provider key, which was 401: the provider refused the key we hold, so the failure is upstream's.
 */
export const functionsErrors = defineErrorCodes("functions", {
  /** The input, a key or the function's state does not allow this; the caller changes something and asks again. */
  invalid: "invalid",
  stale_preview: "invalid",
  published_immutable: "invalid",
  key_conflict: "invalid",
  /** A plugin declared a default rule under a key another plugin already declared; its registration is refused. */
  rule_key_taken: "conflict",
  preview_required: "invalid",
  not_found: "not_found",
  /** The rule is there; the sample the caller named is not. A page treats this differently: the rule did not go away. */
  sample_not_found: "not_found",
  /** The rule's definition moved on from the `updated_at` the caller read: read the latest and decide again. */
  draft_stale: "conflict",
  /** What the draft is for changed while it was being checked; loading the latest is not enough, it has to be checked again. */
  conflict: "conflict",
  version_conflict: "conflict",
  provider_not_configured: "conflict",
  /** TypeSafe refused the key we hold, did not answer in time, or failed. */
  provider_unauthorized: "upstream",
  provider_failed: "upstream",
  provider_timeout: "timeout",
});
