import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Evaluation error codes (evaluation-path-design §3, §5). */
export const evaluationErrors = defineErrorCodes("evaluation", {
  /** Only the non-delegated local person may register samples, execute evaluations, record human reviews, or read metrics. */
  forbidden: "forbidden",
  /** No stored sample, version, run, or expectation matches the requested identifier. */
  not_found: "not_found",
  /** Sample window, comparison arguments, or replay parameters are inconsistent. */
  invalid: "invalid",
  /** A frozen `(sample_id, version)` already exists with different expectations, conditions, or query filters (PWA-54). */
  sample_version_immutable: "conflict",
  /** `isolated_replay` was requested for a scenario that is not registered in this Host. */
  replay_unavailable: "unavailable",
  /** An isolated replay attempted an external write/send action outside local replay isolation (PWA-53). */
  replay_external_effect_blocked: "forbidden",
  /** The evaluation SQLite library could not be opened. */
  store_unavailable: "unavailable",
});
