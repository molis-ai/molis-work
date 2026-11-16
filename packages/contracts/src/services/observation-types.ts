export const OBSERVATION_LIMITS = {
  facts_per_report: 100,
  fact_name: 96,
  stage: 64,
  subjects: 16,
  evidence: 16,
  detail_keys: 32,
  detail_text: 512,
  ref_text: 256,
  /** All content of one report together, as its texts' UTF-8 bytes; a larger report is turned down whole. */
  report_content_bytes: 1024 * 1024,
  /** Reports per actor, project and installation over a rolling minute (the platform's `max_calls_per_minute`). */
  reports_per_minute: 60,
  /**
   * What one reporter (a plugin installation, or the shell) may have accepted in a UTC day, all its projects together. Past either, every
   * report is turned down until the day ends, and the coverage register keeps one `lost` stretch for that reporter, not one per fact name.
   */
  facts_per_reporter_day: 20_000,
  content_bytes_per_reporter_day: 64 * 1024 * 1024,
  /** A snapshot larger than this, uncompressed, keeps only its digest and length, and is `missing: truncated`. */
  snapshot_bytes: 4 * 1024 * 1024,
} as const;
