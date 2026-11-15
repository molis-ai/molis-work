import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Observation error codes: write admission (§4) and read/management gates (§16). */
export const observationErrors = defineErrorCodes("observation", {
  /** The fact's prefix is not the caller's own (a plugin's `plugin_id`, the shell's `ui`). */
  fact_not_owned: "forbidden",
  /** The caller cannot report at all: only the shell and plugins report. */
  reporter_unknown: "forbidden",
  /** One report holds more content than `OBSERVATION_LIMITS.report_content_bytes`; it is turned down whole. */
  report_too_large: "too_large",
  /** The reporter has had its day's facts or bytes (`OBSERVATION_LIMITS.*_per_reporter_day`); reports are turned down until the UTC day ends. */
  report_quota_exceeded: "rate_limited",
  /** The caller asked to read outside its project reach, or asked for a person-only read or management surface (S-74, §16.3). */
  forbidden: "forbidden",
  /** The requested observation use (`assistant`, `evaluation`, `export`, `upload`) is turned off or not offered in this version (OCL-11). */
  use_disabled: "forbidden",
  /** No stored record matches the requested `record_id` (within the caller's reach). */
  not_found: "not_found",
  /** Query or clean-up parameters are inconsistent (an invalid ISO date, an empty custom span, or `since` after `until`). */
  invalid_query: "invalid",
  /** The observation SQLite library could not be opened for a read or management command. */
  store_unavailable: "unavailable",
});
