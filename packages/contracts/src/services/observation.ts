import type { ActionCallContext, ActionDefinition } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { ContractDescriptor } from "../platform/package.js";

// The observation layer's write contract (specs/observation-collection/contract-design.md, batch 28): what one record of the work says,
// the classes of where it came from, the three ways facts come in, and what the coverage register can say about a part that is not fully
// recorded. Reading the records back, by work, object, time and version, with the person's uses and reach, is batch 29's; it is not here.

export const servicesObservationContract = {
  contractId: /* @version contract.io.molis.work.service.observation "io.molis.work.service.observation.v{version}" */ "io.molis.work.service.observation.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.observation */ 1,
  maturity: "partial",
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
};
