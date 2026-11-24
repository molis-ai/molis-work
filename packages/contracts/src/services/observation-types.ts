import { closedObjectSchema } from "../platform/closed-object-schema.js";

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

/**
 * Where a record came from (design §3). The last four are simulations: kept, but never counted as the person's results, reports, habits or
 * real effect. `first_read`, `catch_up` and `imported` are set by the entry that knows (a first connection, a reconnect, an import).
 */
export const OBSERVATION_SOURCE_CLASSES = ["real", "first_read", "catch_up", "imported", "trial", "replay", "demo", "system_check"] as const;

/** How a stage ended, including no action, no answer or a takeover (OCL-08). */
export const OBSERVATION_OUTCOMES = ["succeeded", "failed", "refused", "cancelled", "waiting", "no_action", "no_response", "taken_over", "unknown"] as const;

/** The way in, supplied by the trusted caller. `host` when it cannot be told. */
export const OBSERVATION_ENTRIES = ["workbench", "desktop", "assistant", "mcp", "cli", "workflow", "schedule", "plugin", "agent", "background", "host"] as const;

/** The five user-facing record kinds (design §8), each bound to one `--mark-*` tone. */
export const OBSERVATION_RECORD_KINDS = ["user", "ai", "content", "flow", "present"] as const;

export const observationToken = { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.ref_text } as const;
export const observationNullableToken = { type: ["string", "null"], maxLength: OBSERVATION_LIMITS.ref_text } as const;
export const observationVersion = { type: ["string", "integer"], maxLength: OBSERVATION_LIMITS.ref_text } as const;

/** Record filters shared by observation queries and saved evaluation samples. The action supplies its own use. */
export const OBSERVATION_QUERY_FIELDS = {
  project_id: observationNullableToken,
  all_projects: { type: "boolean" },
  work_ref: observationToken,
  call_id: observationToken,
  invocation_id: observationToken,
  runtime_session_id: observationToken,
  run_id: observationToken,
  subject: closedObjectSchema({ kind: observationToken, id: observationToken, version: observationVersion }, ["kind"]),
  fact: { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.fact_name },
  owner_kind: { enum: ["plugin", "service", "shell"] },
  owner_id: observationToken,
  entry: { enum: OBSERVATION_ENTRIES },
  actor_id: observationToken,
  outcomes: { type: "array", items: { enum: OBSERVATION_OUTCOMES } },
  source_classes: { type: "array", items: { enum: OBSERVATION_SOURCE_CLASSES } },
  include_simulated: { type: "boolean" },
  kinds: { type: "array", items: { enum: OBSERVATION_RECORD_KINDS } },
  since: { type: "string" },
  until: { type: "string" },
  platform_version: observationToken,
  after_seq: { type: "integer", minimum: 0 },
  limit: { type: "integer", minimum: 1, maximum: 500 },
  resolve_subjects: { type: "boolean" },
} as const;
