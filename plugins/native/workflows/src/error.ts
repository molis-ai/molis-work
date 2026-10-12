import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Workflows' own error codes, every one `workflows.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Workflows keeps no status table of its own. Every status is the one Workflows' own route answered before:
 * only a missing record is 404 and only a stale one 409; every other refusal is the caller's to fix (400).
 */
export const workflowsErrors = defineErrorCodes("workflows", {
  invalid: "invalid",
  not_found: "not_found",
  /** The workflow or the run changed since the caller read it, or its step was already handed over. */
  conflict: "conflict",
  /** A station's capability is not registered, not granted or not available right now. */
  unavailable: "invalid",
  /** A link is not set up yet (no rule, no model, or a mapping that needs a change). */
  not_ready: "invalid",
  /** The content a run points at can no longer be read (it may have been deleted). */
  missing: "invalid",
  /** An earlier action step's outcome is not known; the person looks at the other plugin before continuing. */
  uncertain: "invalid",
  /** More than one provider or capability version fits a station, and the choice has to be made explicitly. */
  ambiguous: "invalid",
  /** A content capability answered with another station's reference. */
  invalid_result: "invalid",
});
