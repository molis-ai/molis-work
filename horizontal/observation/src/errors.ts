import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** The reasons one reported fact is turned down alone (contract-design §4); the rest of the report stands. */
export const observationErrors = defineErrorCodes("observation", {
  /** The fact's prefix is not the caller's own (a plugin's `plugin_id`, the shell's `ui`). */
  fact_not_owned: "forbidden",
  /** The caller cannot report at all: only the shell and plugins report. */
  reporter_unknown: "forbidden",
  /** One report holds more content than `OBSERVATION_LIMITS.report_content_bytes`; it is turned down whole. */
  report_too_large: "too_large",
  /** The reporter has had its day's facts or bytes (`OBSERVATION_LIMITS.*_per_reporter_day`); reports are turned down until the UTC day ends. */
  report_quota_exceeded: "rate_limited",
});
