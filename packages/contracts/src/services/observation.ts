import type { ActionCallContext, ActionDefinition } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { ContractDescriptor } from "../platform/package.js";
import { observationHoldActions } from "./observation-holds.js";
import { OBSERVATION_LIMITS } from "./observation-types.js";

export { OBSERVATION_LIMITS } from "./observation-types.js";
export type {
  ObservationHoldListInput,
  ObservationHoldListOutput,
  ObservationHoldPutInput,
  ObservationHoldPutResult,
  ObservationHoldReleaseInput,
  ObservationHoldReleaseResult,
  ObservationHoldView,
} from "./observation-holds.js";

// The observation layer's write, read and management contract (specs/observation-collection/contract-design.md, batches 28 & 29):
// what one record of the work says, the classes of where it came from, the three ways facts come in, what the coverage register can say,
// and the actions for querying records, evidence and coverage, configuring uses and retention, inspecting space and running clean-up.

export const servicesObservationContract = {
  contractId: /* @version contract.io.molis.work.service.observation "io.molis.work.service.observation.v{version}" */ "io.molis.work.service.observation.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.observation */ 1,
  maturity: "implemented",
  ssot: "specs/observation-collection/contract-design.md",
} as const satisfies ContractDescriptor;

export const OBSERVATION_PROVIDER_ID = "system.observation";

/**
 * Where a record came from (design §3). The last four are simulations: kept, but never counted as the person's results, reports, habits or
 * real effect. `first_read`, `catch_up` and `imported` are set by the entry that knows (a first connection, a reconnect, an import).
 */
export const OBSERVATION_SOURCE_CLASSES = ["real", "first_read", "catch_up", "imported", "trial", "replay", "demo", "system_check"] as const;
export type ObservationSourceClass = (typeof OBSERVATION_SOURCE_CLASSES)[number];
/** The classes an owner may say about its own facts: whether a batch is a first read, a catch-up or an import. Nothing else is self-declared. */
export const OBSERVATION_OWNER_SOURCE_CLASSES = ["first_read", "catch_up", "imported"] as const satisfies readonly ObservationSourceClass[];
export type ObservationOwnerSourceClass = (typeof OBSERVATION_OWNER_SOURCE_CLASSES)[number];

/** How a stage ended. Not acting, no answer and being taken over are results of their own, not missing records (OCL-08). */
export const OBSERVATION_OUTCOMES = ["succeeded", "failed", "refused", "cancelled", "waiting", "no_action", "no_response", "taken_over", "unknown"] as const;
export type ObservationOutcome = (typeof OBSERVATION_OUTCOMES)[number];

/** The way in, from the trusted caller: never named by the writer. `host` when it cannot be told. */
export const OBSERVATION_ENTRIES = ["workbench", "desktop", "assistant", "mcp", "cli", "workflow", "schedule", "plugin", "agent", "background", "host"] as const;
export type ObservationEntry = (typeof OBSERVATION_ENTRIES)[number];

/**
 * Why a piece of evidence is not there (design §6). `expired`: the retention clean-up of batch 29 removed it. `purged`: the person cleared
 * a plugin's data and its content went with it. `by_rule`: a rule keeps it out (a refusal's minimal row, a page read's result).
 */
export const OBSERVATION_MISSING_REASONS = ["not_obtained", "truncated", "redacted", "expired", "purged", "forbidden", "by_rule"] as const;
export type ObservationMissingReason = (typeof OBSERVATION_MISSING_REASONS)[number];
/** The reasons a writer may give; `expired` and `purged` are the observation layer's own, written when it removes content. */
export const OBSERVATION_WRITER_MISSING_REASONS = ["not_obtained", "truncated", "redacted", "forbidden", "by_rule"] as const;
export type ObservationWriterMissingReason = (typeof OBSERVATION_WRITER_MISSING_REASONS)[number];

/** What the coverage register says about one kind of fact (design §8; the ten states the settings page shows). */
export const OBSERVATION_COVERAGE_STATES = ["complete", "not_connected", "unavailable", "lost", "truncated", "redacted", "expired", "purged", "not_applicable", "by_rule"] as const;
export type ObservationCoverageState = (typeof OBSERVATION_COVERAGE_STATES)[number];

/** A fact name: `<owner prefix>.<name>`, lower case, dot-joined. A plugin's prefix is its own `plugin_id`; the services' are listed below. */
export const OBSERVATION_FACT_PATTERN = "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9_-]*)+$";

/**
 * The prefixes the platform's own writers use. The shell writes `ui.*` only; the action gateway's exit writes `action.*`. A service is given
 * its one prefix when the Host wires its sink, and a fact of another prefix from it is dropped and counted (§8).
 */
export const OBSERVATION_SERVICE_PREFIXES = {
  gateway: "action",
  shell: "ui",
  agent: "agent",
  assistant: "assistant",
  scheduler: "scheduler",
  connections: "connections",
  grants: "grants",
} as const;
export type ObservationService = keyof typeof OBSERVATION_SERVICE_PREFIXES;

/** Whose fact it is, from the writer's trusted identity. */
export type ObservationOwner =
  | { readonly kind: "plugin"; readonly id: string }
  | { readonly kind: "service"; readonly id: ObservationService }
  | { readonly kind: "shell" };

export interface ObservationSubject {
  readonly kind: string;
  readonly id: string;
  readonly version?: string | number;
}

/** A reference to a version the owner keeps itself (an artifact version, a memory revision, a Todo change, a workflow hand-over). */
export interface ObservationOwnerVersionRef { readonly kind: "owner"; readonly owner: string; readonly id: string; readonly version: string | number }
/** Content the owner does not keep (D1): the observation layer stores it once by digest. JSON is given as its text. */
export interface ObservationContent { readonly kind: "content"; readonly media_type: string; readonly text: string }
export interface ObservationMissingInput { readonly kind: "missing"; readonly reason: ObservationWriterMissingReason }
/** Stored: a body the layer does not keep (too large, or a page read's result) keeps its digest and length. */
export interface ObservationMissing { readonly kind: "missing"; readonly reason: ObservationMissingReason; readonly digest?: string; readonly bytes?: number }
/**
 * A stored snapshot: a keyed digest (HMAC-SHA256 under the Home's observation digest key, so a copy of the store cannot confirm a guessed
 * text) of its text after credential shapes were redacted, that text's length, and its media type. The body is kept
 * compressed and encrypted (contract-design §6). `redacted`: the text had credential shapes, which were replaced before it was kept.
 */
export interface ObservationSnapshotRef {
  readonly kind: "snapshot"; readonly digest: string; readonly bytes: number; readonly media_type: string; readonly redacted?: true;
}

export interface ObservationEvidenceInput { readonly role: string; readonly ref: ObservationOwnerVersionRef | ObservationContent | ObservationMissingInput }
export interface ObservationEvidence { readonly role: string; readonly ref: ObservationOwnerVersionRef | ObservationSnapshotRef | ObservationMissing }

/** The versions in force: references only. The platform version is stamped by the observation layer. */
export interface ObservationConditionsInput {
  readonly plugin?: { readonly id: string; readonly version: string };
  readonly prompts?: readonly { readonly key: string; readonly version: string | number }[];
  readonly skills?: readonly { readonly id: string; readonly version: string | number }[];
  readonly model?: { readonly provider: string; readonly model_id: string };
}
export interface ObservationConditions extends ObservationConditionsInput { readonly platform_version: string }

/** Small values of one kind of fact: codes, durations, counts, positions. Never a body: that is evidence. */
export type ObservationDetail = Readonly<Record<string, string | number | boolean>>;

/** One fact as a writer gives it. Who, where, when it arrived and which operation it belongs to are taken from the trusted context. */
export interface ObservationFactInput {
  readonly fact: string;
  readonly outcome: ObservationOutcome;
  readonly stage?: string;
  readonly occurred_at?: string;
  readonly subjects?: readonly ObservationSubject[];
  readonly source_class?: ObservationOwnerSourceClass;
  /** A run or a piece of work the writer knows this belongs to; absent means not linked, never guessed. */
  readonly work?: { readonly run_id?: string; readonly work_ref?: string };
  readonly conditions?: ObservationConditionsInput;
  readonly detail?: ObservationDetail;
  readonly evidence?: readonly ObservationEvidenceInput[];
}

/** Which operation a record belongs to. `call_id` is shared by every call of one operation; `invocation_id` is one action call. */
export interface ObservationWork {
  readonly call_id: string | null;
  readonly invocation_id?: string;
  readonly parent_invocation_id?: string;
  readonly runtime_session_id?: string;
  readonly run_id?: string;
  readonly work_ref?: string;
}

/** One stored record. Batch 29's read actions return this shape. */
export interface ObservationRecord {
  readonly record_id: string;
  readonly owner: ObservationOwner;
  readonly fact: string;
  readonly stage?: string;
  readonly outcome: ObservationOutcome;
  readonly actor: { readonly actor_id: string; readonly actor_kind?: "user" | "runtime" | null; readonly audience: string; readonly delegated_by?: string };
  readonly entry: ObservationEntry;
  readonly project_id: string | null;
  readonly install_id?: string;
  readonly subjects: readonly ObservationSubject[];
  readonly occurred_at: string;
  readonly received_at: string;
  /** The writer's time was later than arrival; `occurred_at` is the arrival. */
  readonly clock_adjusted?: true;
  readonly work: ObservationWork;
  readonly source_class: ObservationSourceClass;
  readonly conditions: ObservationConditions;
  readonly detail: ObservationDetail;
  readonly evidence: readonly ObservationEvidence[];
  /** Identical high-frequency records folded into this one (declared in the coverage register): how many, and the last time. */
  readonly coalesced?: { readonly count: number; readonly last_at: string };
}

/**
 * Who acted, for a fact with no action call behind it (a timer firing, a background sync, a model round's events). Work that an action
 * call began and that goes on after it returned (an Agent round) names that call's `call_id` and the installation that made it, from
 * the Host's own record of the start, so its facts join the calls of the same operation.
 */
export interface ObservationBackgroundOrigin {
  readonly kind: "background";
  readonly actor_id: string;
  readonly project_id: string | null;
  readonly entry: Extract<ObservationEntry, "background" | "schedule" | "agent" | "host">;
  readonly call_id?: string;
  readonly install_id?: string;
}

/** Records the facts of one piece of work, bound to who and where once, when the work began. Queued at once: never throws, waits or reads. */
export interface ObservationRecorder {
  record(fact: ObservationFactInput): void;
}

/**
 * How a platform service records (contract-design §4). The Host gives each service its own sink, which fixes the owner and the prefix; a
 * service that is not wired records nothing. A service binds when a piece of work begins (a round starts, a timer fires, a search runs),
 * with the call it is serving or a background origin, because the facts may come later than that call's own scope (a Prologue event does).
 */
export interface ObservationSink {
  bind(origin: ActionCallContext | ObservationBackgroundOrigin): ObservationRecorder;
}

const token = { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.ref_text } as const;
const version = { type: ["string", "integer"], maxLength: OBSERVATION_LIMITS.ref_text } as const;
const OWNER_REF = closedObjectSchema({ kind: { const: "owner" }, owner: token, id: token, version });
const CONTENT = closedObjectSchema({ kind: { const: "content" }, media_type: token, text: { type: "string" } });
const MISSING = closedObjectSchema({ kind: { const: "missing" }, reason: { enum: OBSERVATION_WRITER_MISSING_REASONS } });
const FACT_SCHEMA = closedObjectSchema({
  fact: { type: "string", pattern: OBSERVATION_FACT_PATTERN, maxLength: OBSERVATION_LIMITS.fact_name },
  outcome: { enum: OBSERVATION_OUTCOMES },
  stage: { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.stage },
  occurred_at: { type: "string", format: "date-time" },
  subjects: { type: "array", maxItems: OBSERVATION_LIMITS.subjects, items: closedObjectSchema({ kind: token, id: token, version }, ["kind", "id"]) },
  source_class: { enum: OBSERVATION_OWNER_SOURCE_CLASSES },
  work: closedObjectSchema({ run_id: token, work_ref: token }, []),
  conditions: closedObjectSchema({
    plugin: closedObjectSchema({ id: token, version: token }),
    prompts: { type: "array", maxItems: OBSERVATION_LIMITS.subjects, items: closedObjectSchema({ key: token, version }) },
    skills: { type: "array", maxItems: OBSERVATION_LIMITS.subjects, items: closedObjectSchema({ id: token, version }) },
    model: closedObjectSchema({ provider: token, model_id: token }),
  }, []),
  detail: { type: "object", maxProperties: OBSERVATION_LIMITS.detail_keys,
    additionalProperties: { type: ["string", "number", "boolean"], maxLength: OBSERVATION_LIMITS.detail_text } },
  evidence: { type: "array", maxItems: OBSERVATION_LIMITS.evidence,
    items: closedObjectSchema({ role: token, ref: { oneOf: [OWNER_REF, CONTENT, MISSING] } }) },
}, ["fact", "outcome"]);

export interface ObservationReportInput { readonly facts: readonly ObservationFactInput[] }
export interface ObservationReportResult {
  readonly accepted: number;
  /** A fact that is not the caller's to write is dropped alone; the rest of the report stands. */
  readonly rejected: readonly { readonly index: number; readonly code: string }[];
}

/** The five user-facing record kinds (design §8, docs/design/work-records/), each bound to one `--mark-*` tone. */
export const OBSERVATION_RECORD_KINDS = ["user", "ai", "content", "flow", "present"] as const;
export type ObservationRecordKind = (typeof OBSERVATION_RECORD_KINDS)[number];
export const OBSERVATION_RECORD_KIND_HUES = {
  user: "blue",
  ai: "plum",
  content: "slate",
  flow: "ochre",
  present: "clay",
} as const satisfies Record<ObservationRecordKind, "blue" | "plum" | "slate" | "ochre" | "clay">;

/** Space breakdown categories: the five record kinds plus stored evidence snapshots (files / images / bodies). */
export const OBSERVATION_SPACE_KINDS = ["user", "ai", "content", "flow", "present", "files"] as const;
export type ObservationSpaceKind = (typeof OBSERVATION_SPACE_KINDS)[number];

/** Where the records may be used (design §6, OCL-11). `lookback` is always on for the person; `upload` is not offered in this version. */
export const OBSERVATION_USES = ["lookback", "assistant", "evaluation", "export", "upload"] as const;
export type ObservationUse = (typeof OBSERVATION_USES)[number];
export interface ObservationUses {
  readonly lookback: true;
  readonly assistant: boolean;
  readonly evaluation: boolean;
  readonly export: boolean;
  readonly upload: false;
}
export interface ObservationUsesUpdate {
  readonly assistant?: boolean;
  readonly evaluation?: boolean;
  readonly export?: boolean;
}

/** Automatic retention modes (design §7, OCL-12). Default is `keep` (forever). */
export const OBSERVATION_RETENTION_MODES = ["keep", "365", "180", "90", "30", "manual"] as const;
export type ObservationRetentionMode = (typeof OBSERVATION_RETENTION_MODES)[number];
export const OBSERVATION_RETENTION_NEEDS = {
  weekly_report: 7,
  cross_period_compare: 60,
  evaluation_samples: 120,
} as const;
export type ObservationRetentionConsumer = keyof typeof OBSERVATION_RETENTION_NEEDS;
export interface ObservationRetentionRequirement {
  readonly consumer: ObservationRetentionConsumer;
  readonly need_days: number;
  readonly kept: boolean;
}

export interface ObservationRecordingState {
  readonly state: "recording" | "paused" | "catching_up";
  readonly paused_at?: string;
  readonly complete_since: string | null;
  readonly earliest_record_at: string | null;
  readonly catch_up_progress?: { readonly project_name?: string; readonly read_count: number };
}

export const OBSERVATION_SUBJECT_RESOLUTION_STATUSES = ["resolved", "missing", "unverified"] as const;
export type ObservationSubjectResolutionStatus = (typeof OBSERVATION_SUBJECT_RESOLUTION_STATUSES)[number];
export interface ObservationSubjectResolution {
  readonly kind: string;
  readonly id: string;
  readonly version?: string | number;
  readonly status: ObservationSubjectResolutionStatus;
}

export interface ObservationQueriedRecord extends ObservationRecord {
  readonly seq: number;
  readonly kind: ObservationRecordKind;
  readonly late: boolean;
  readonly subject_status?: readonly ObservationSubjectResolution[];
}

export interface ObservationQueryInput {
  readonly use?: ObservationUse;
  readonly project_id?: string | null;
  readonly all_projects?: boolean;
  readonly work_ref?: string;
  readonly call_id?: string;
  readonly invocation_id?: string;
  readonly runtime_session_id?: string;
  readonly run_id?: string;
  readonly subject?: { readonly kind: string; readonly id?: string; readonly version?: string | number };
  readonly fact?: string;
  readonly owner_kind?: ObservationOwner["kind"];
  readonly owner_id?: string;
  readonly entry?: ObservationEntry;
  readonly actor_id?: string;
  readonly outcomes?: readonly ObservationOutcome[];
  readonly source_classes?: readonly ObservationSourceClass[];
  readonly include_simulated?: boolean;
  readonly kinds?: readonly ObservationRecordKind[];
  readonly since?: string;
  readonly until?: string;
  readonly platform_version?: string;
  readonly after_seq?: number;
  readonly limit?: number;
  readonly resolve_subjects?: boolean;
}

export interface ObservationQueryOutput {
  readonly records: readonly ObservationQueriedRecord[];
  readonly next_seq: number | null;
  readonly has_more: boolean;
  readonly recording: ObservationRecordingState;
}

export type ObservationEvidenceItemView =
  | { readonly role: string; readonly status: "available"; readonly ref: ObservationSnapshotRef; readonly text: string; readonly media_type: string; readonly bytes: number; readonly redacted?: true }
  | { readonly role: string; readonly status: "owner_ref"; readonly ref: ObservationOwnerVersionRef; readonly owner_resolvable: ObservationSubjectResolutionStatus }
  | { readonly role: string; readonly status: "missing"; readonly reason: ObservationMissingReason; readonly ref: ObservationMissing | ObservationSnapshotRef };

export interface ObservationEvidenceGetInput {
  readonly record_id: string;
  readonly role?: string;
  readonly use?: ObservationUse;
}
export interface ObservationEvidenceGetOutput {
  readonly record_id: string;
  readonly items: readonly ObservationEvidenceItemView[];
}

export const OBSERVATION_COVERAGE_SCOPE_FILTERS = ["all", "entry", "plugin", "flow"] as const;
export type ObservationCoverageScopeFilter = (typeof OBSERVATION_COVERAGE_SCOPE_FILTERS)[number];

export interface ObservationCoverageEntryView {
  readonly owner: string;
  readonly fact: string;
  readonly entry: string;
  readonly project_id: string;
  readonly kind: ObservationRecordKind;
  readonly scope_group: "entry" | "plugin" | "flow";
  readonly state: ObservationCoverageState;
  readonly since: string;
  readonly since_version: string;
  readonly reason: string | null;
  readonly truncated: number;
  readonly redacted: number;
  readonly by_rule: number;
  readonly updated_at: string;
}

export interface ObservationCoverageGapView {
  readonly gap_id: number;
  readonly owner: string;
  readonly fact: string;
  readonly entry: string;
  readonly project_id: string;
  readonly kind: ObservationRecordKind;
  readonly scope_group: "entry" | "plugin" | "flow";
  readonly state: ObservationCoverageState;
  readonly started_at: string;
  readonly ended_at: string;
  readonly count: number;
  readonly reason: string;
}

export interface ObservationCoverageGetInput {
  readonly use?: ObservationUse;
  readonly project_id?: string | null;
  readonly all_projects?: boolean;
  readonly scope_filter?: ObservationCoverageScopeFilter;
  readonly platform_version?: string;
  readonly since?: string;
  readonly until?: string;
}

export interface ObservationCoverageGetOutput {
  readonly recording: ObservationRecordingState;
  readonly entries: readonly ObservationCoverageEntryView[];
  readonly gaps: readonly ObservationCoverageGapView[];
  readonly versions: readonly string[];
  readonly activity_summary: { readonly has_records: boolean; readonly total_records: number; readonly has_gaps: boolean };
}

export interface ObservationSettingsView {
  readonly recording: ObservationRecordingState;
  readonly uses: ObservationUses;
  readonly retention: {
    readonly mode: ObservationRetentionMode;
    readonly requirements: readonly ObservationRetentionRequirement[];
    readonly shortfall: boolean;
    readonly last_cleanup_at?: string;
    readonly last_cleanup_deleted_records?: number;
    readonly last_cleanup_freed_bytes?: number;
  };
  readonly space_reminder_bytes: number | null;
  readonly evaluation_holds: { readonly count: number; readonly bytes: number; readonly retention_days: number };
}

export interface ObservationSettingsUpdateInput {
  readonly paused?: boolean;
  readonly uses?: ObservationUsesUpdate;
  readonly retention_mode?: ObservationRetentionMode;
  readonly space_reminder_bytes?: number | null;
}

export interface ObservationSpaceView {
  readonly total_bytes: number;
  readonly total_records: number;
  readonly total_snapshots: number;
  readonly by_kind: readonly { readonly kind: ObservationSpaceKind; readonly bytes: number; readonly count: number }[];
  readonly by_project: readonly { readonly project_id: string; readonly bytes: number; readonly count: number }[];
  readonly reminder_bytes: number | null;
  readonly reminder_status: "none" | "ok" | "near" | "exceeded";
  readonly write_failure: { readonly has_recent_loss: boolean; readonly lost_count: number; readonly last_reason?: string; readonly last_at?: string };
}

export const OBSERVATION_CLEANUP_TIME_RANGES = ["before_90d", "before_30d", "before_7d", "custom"] as const;
export type ObservationCleanupTimeRange = (typeof OBSERVATION_CLEANUP_TIME_RANGES)[number];

export interface ObservationCleanupScopeInput {
  readonly time_range: ObservationCleanupTimeRange;
  readonly before?: string;
  readonly since?: string;
  readonly until?: string;
  readonly project_id?: string | null;
  readonly kinds?: readonly ObservationRecordKind[];
}

export interface ObservationCleanupPreview {
  readonly scope: ObservationCleanupScopeInput & {
    readonly resolved_since?: string;
    readonly resolved_until: string;
    readonly kinds: readonly ObservationRecordKind[];
  };
  readonly matching_records: number;
  readonly estimated_freed_bytes: number;
  readonly unreferenced_snapshots: number;
  readonly preserved: {
    readonly business_objects: true;
    readonly pages_versions: true;
    readonly saved_briefs: true;
    readonly evaluation_samples_count: number;
  };
  readonly impacts: readonly {
    readonly impact: "timeline_expired_gap" | "comparison_basis_lost" | "evaluation_samples_kept";
    readonly affected: boolean;
  }[];
}

export interface ObservationCleanupResult {
  readonly deleted_records: number;
  readonly deleted_snapshots: number;
  readonly freed_bytes: number;
  readonly gap_recorded: boolean;
  readonly cleaned_at: string;
}

const nullableToken = { type: ["string", "null"], maxLength: OBSERVATION_LIMITS.ref_text } as const;
const RECORDING_STATE_SCHEMA = closedObjectSchema({
  state: { enum: ["recording", "paused", "catching_up"] },
  paused_at: { type: "string" },
  complete_since: { type: ["string", "null"] },
  earliest_record_at: { type: ["string", "null"] },
  catch_up_progress: closedObjectSchema({ project_name: { type: "string" }, read_count: { type: "integer", minimum: 0 } }, ["read_count"]),
}, ["state", "complete_since", "earliest_record_at"]);
const CLEANUP_SCOPE_SCHEMA = closedObjectSchema({
  time_range: { enum: OBSERVATION_CLEANUP_TIME_RANGES },
  before: { type: "string" },
  since: { type: "string" },
  until: { type: "string" },
  project_id: nullableToken,
  kinds: { type: "array", maxItems: OBSERVATION_RECORD_KINDS.length, items: { enum: OBSERVATION_RECORD_KINDS } },
}, ["time_range"]);
const SETTINGS_VIEW_SCHEMA = closedObjectSchema({
  recording: RECORDING_STATE_SCHEMA,
  uses: closedObjectSchema({
    lookback: { const: true },
    assistant: { type: "boolean" },
    evaluation: { type: "boolean" },
    export: { type: "boolean" },
    upload: { const: false },
  }),
  retention: closedObjectSchema({
    mode: { enum: OBSERVATION_RETENTION_MODES },
    requirements: { type: "array", items: closedObjectSchema({
      consumer: { enum: ["weekly_report", "cross_period_compare", "evaluation_samples"] },
      need_days: { type: "integer", minimum: 1 },
      kept: { type: "boolean" },
    }) },
    shortfall: { type: "boolean" },
    last_cleanup_at: { type: "string" },
    last_cleanup_deleted_records: { type: "integer", minimum: 0 },
    last_cleanup_freed_bytes: { type: "integer", minimum: 0 },
  }, ["mode", "requirements", "shortfall"]),
  space_reminder_bytes: { type: ["integer", "null"], minimum: 0 },
  evaluation_holds: closedObjectSchema({
    count: { type: "integer", minimum: 0 },
    bytes: { type: "integer", minimum: 0 },
    retention_days: { type: "integer", minimum: 1 },
  }),
});

export const observationActions = {
  /**
   * The shell's and the plugins' way in (§4). The owner is the caller: the shell, only through the Host's own route and the entry credential it
   * issues for that request, writes `ui.*`; a plugin writes facts under its own `plugin_id` (from the Host-issued caller). Agents, MCP clients and
   * workflows do not report: what they do is recorded where it happens.
   */
  report: {
    capability_id: "observation.report",
    version: /* @version action.observation.report */ 1,
    operation: "command",
    action: { title: "记下工作过程", description: "把界面阶段或插件自己的事实记进本机的工作记录；只记调用方自己的事实，不改任何业务内容",
      kind: "operation", scope: "home", effect: "write", audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
      execution: { max_calls_per_minute: OBSERVATION_LIMITS.reports_per_minute },
      input_schema: inputSchemaFor<ObservationReportInput>()(closedObjectSchema({
        facts: { type: "array", minItems: 1, maxItems: OBSERVATION_LIMITS.facts_per_report, items: FACT_SCHEMA } })),
      output_schema: closedObjectSchema({ accepted: { type: "integer", minimum: 0 },
        rejected: { type: "array", items: closedObjectSchema({ index: { type: "integer", minimum: 0 }, code: token }) } }) },
  } as ActionDefinition<ObservationReportInput, ObservationReportResult>,

  /** Query stored work records by work, object, time, version or incremental `seq` cursor (§16.2). */
  recordsQuery: {
    capability_id: "observation.records.query",
    version: /* @version action.observation.records.query */ 1,
    operation: "query",
    action: { title: "查询工作记录", description: "按工作、对象、时间、版本或增量游标查询工作记录，遵守用途开关与跨项目边界",
      kind: "query", scope: "home", effect: "read", audiences: ["user", "agent", "workflow", "plugin", "mcp"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationQueryInput>()(closedObjectSchema({
        use: { enum: OBSERVATION_USES },
        project_id: nullableToken,
        all_projects: { type: "boolean" },
        work_ref: token,
        call_id: token,
        invocation_id: token,
        runtime_session_id: token,
        run_id: token,
        subject: closedObjectSchema({ kind: token, id: token, version }, ["kind"]),
        fact: { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.fact_name },
        owner_kind: { enum: ["plugin", "service", "shell"] },
        owner_id: token,
        entry: { enum: OBSERVATION_ENTRIES },
        actor_id: token,
        outcomes: { type: "array", items: { enum: OBSERVATION_OUTCOMES } },
        source_classes: { type: "array", items: { enum: OBSERVATION_SOURCE_CLASSES } },
        include_simulated: { type: "boolean" },
        kinds: { type: "array", items: { enum: OBSERVATION_RECORD_KINDS } },
        since: { type: "string" },
        until: { type: "string" },
        platform_version: token,
        after_seq: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        resolve_subjects: { type: "boolean" },
      }, [])),
      output_schema: closedObjectSchema({
        records: { type: "array" },
        next_seq: { type: ["integer", "null"] },
        has_more: { type: "boolean" },
        recording: RECORDING_STATE_SCHEMA,
      }) },
  } as ActionDefinition<ObservationQueryInput, ObservationQueryOutput>,

  /** Unseal or resolve the evidence items of one record, gated by use switches and project reach (§16.2). */
  evidenceGet: {
    capability_id: "observation.evidence.get",
    version: /* @version action.observation.evidence.get */ 1,
    operation: "query",
    action: { title: "读取工作记录证据", description: "按记录编号读取证据快照或核对主人版本引用，遵守用途开关与跨项目边界",
      kind: "query", scope: "home", effect: "read", audiences: ["user", "agent", "workflow", "plugin", "mcp"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationEvidenceGetInput>()(closedObjectSchema({
        record_id: token,
        role: token,
        use: { enum: OBSERVATION_USES },
      }, ["record_id"])),
      output_schema: closedObjectSchema({
        record_id: token,
        items: { type: "array" },
      }) },
  } as ActionDefinition<ObservationEvidenceGetInput, ObservationEvidenceGetOutput>,

  /** Read coverage entries and gaps across entries, plugins, background flows and platform versions (§16.2). */
  coverageGet: {
    capability_id: "observation.coverage.get",
    version: /* @version action.observation.coverage.get */ 1,
    operation: "query",
    action: { title: "查看记录覆盖与缺口", description: "查看各入口、插件与后台任务的采集覆盖状态、截止时间与缺口，区分无活动与缺记录",
      kind: "query", scope: "home", effect: "read", audiences: ["user", "agent", "workflow", "plugin", "mcp"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationCoverageGetInput>()(closedObjectSchema({
        use: { enum: OBSERVATION_USES },
        project_id: nullableToken,
        all_projects: { type: "boolean" },
        scope_filter: { enum: OBSERVATION_COVERAGE_SCOPE_FILTERS },
        platform_version: token,
        since: { type: "string" },
        until: { type: "string" },
      }, [])),
      output_schema: closedObjectSchema({
        recording: RECORDING_STATE_SCHEMA,
        entries: { type: "array" },
        gaps: { type: "array" },
        versions: { type: "array", items: { type: "string" } },
        activity_summary: closedObjectSchema({
          has_records: { type: "boolean" },
          total_records: { type: "integer", minimum: 0 },
          has_gaps: { type: "boolean" },
        }),
      }) },
  } as ActionDefinition<ObservationCoverageGetInput, ObservationCoverageGetOutput>,

  /** Read the person's work-record management settings: recording state, uses, retention and space reminder (§16.2). */
  settingsGet: {
    capability_id: "observation.settings.get",
    version: /* @version action.observation.settings.get */ 1,
    operation: "query",
    action: { title: "读取工作记录设置", description: "读取工作记录的暂停状态、用途开关、自动清理期限与容量提醒线",
      kind: "query", scope: "home", effect: "read", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<Record<string, never>>()(closedObjectSchema({}, [])),
      output_schema: SETTINGS_VIEW_SCHEMA },
  } as ActionDefinition<Record<string, never>, ObservationSettingsView>,

  /** Update the person's work-record management settings (§16.2). */
  settingsSet: {
    capability_id: "observation.settings.set",
    version: /* @version action.observation.settings.set */ 1,
    operation: "command",
    action: { title: "更新工作记录设置", description: "暂停或继续记录、切换用途开关、设置自动清理期限或容量提醒线",
      kind: "operation", scope: "home", effect: "write", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationSettingsUpdateInput>()(closedObjectSchema({
        paused: { type: "boolean" },
        uses: closedObjectSchema({
          assistant: { type: "boolean" },
          evaluation: { type: "boolean" },
          export: { type: "boolean" },
        }, []),
        retention_mode: { enum: OBSERVATION_RETENTION_MODES },
        space_reminder_bytes: { type: ["integer", "null"], minimum: 0 },
      }, [])),
      output_schema: SETTINGS_VIEW_SCHEMA },
  } as ActionDefinition<ObservationSettingsUpdateInput, ObservationSettingsView>,

  /** Inspect actual disk space used by work records and evidence snapshots, grouped by record kind and project (§16.2). */
  spaceGet: {
    capability_id: "observation.space.get",
    version: /* @version action.observation.space.get */ 1,
    operation: "query",
    action: { title: "查看工作记录占用", description: "查看工作记录与证据快照的实际占用、按记录种类与项目的分布及容量提醒状态",
      kind: "query", scope: "home", effect: "read", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<Record<string, never>>()(closedObjectSchema({}, [])),
      output_schema: closedObjectSchema({
        total_bytes: { type: "integer", minimum: 0 },
        total_records: { type: "integer", minimum: 0 },
        total_snapshots: { type: "integer", minimum: 0 },
        by_kind: { type: "array" },
        by_project: { type: "array" },
        reminder_bytes: { type: ["integer", "null"], minimum: 0 },
        reminder_status: { enum: ["none", "ok", "near", "exceeded"] },
        write_failure: closedObjectSchema({
          has_recent_loss: { type: "boolean" },
          lost_count: { type: "integer", minimum: 0 },
          last_reason: { type: "string" },
          last_at: { type: "string" },
        }, ["has_recent_loss", "lost_count"]),
      }) },
  } as ActionDefinition<Record<string, never>, ObservationSpaceView>,

  /** Preview how many records and bytes a manual clean-up will remove, and what it affects (§16.2). */
  cleanupPreview: {
    capability_id: "observation.cleanup.preview",
    version: /* @version action.observation.cleanup.preview */ 1,
    operation: "query",
    action: { title: "预览清理工作记录", description: "按时间范围、项目与记录种类预览将清理的条数、空间大小与对报告及评测的影响",
      kind: "query", scope: "home", effect: "read", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationCleanupScopeInput>()(CLEANUP_SCOPE_SCHEMA),
      output_schema: closedObjectSchema({
        scope: { type: "object" },
        matching_records: { type: "integer", minimum: 0 },
        estimated_freed_bytes: { type: "integer", minimum: 0 },
        unreferenced_snapshots: { type: "integer", minimum: 0 },
        preserved: closedObjectSchema({
          business_objects: { const: true },
          pages_versions: { const: true },
          saved_briefs: { const: true },
          evaluation_samples_count: { type: "integer", minimum: 0 },
        }),
        impacts: { type: "array" },
      }) },
  } as ActionDefinition<ObservationCleanupScopeInput, ObservationCleanupPreview>,

  /** Execute a manual clean-up in one transaction: remove records, collect unreferenced snapshots, and record an `expired` gap (§16.2). */
  cleanupApply: {
    capability_id: "observation.cleanup.apply",
    version: /* @version action.observation.cleanup.apply */ 1,
    operation: "command",
    action: { title: "执行清理工作记录", description: "按选定范围清理工作记录并回收不再引用的证据快照，记下到期清除缺口，不删除任何原业务内容",
      kind: "operation", scope: "home", effect: "write", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: inputSchemaFor<ObservationCleanupScopeInput>()(CLEANUP_SCOPE_SCHEMA),
      output_schema: closedObjectSchema({
        deleted_records: { type: "integer", minimum: 0 },
        deleted_snapshots: { type: "integer", minimum: 0 },
        freed_bytes: { type: "integer", minimum: 0 },
        gap_recorded: { type: "boolean" },
        cleaned_at: { type: "string" },
      }) },
  } as ActionDefinition<ObservationCleanupScopeInput, ObservationCleanupResult>,
  ...observationHoldActions,
};
