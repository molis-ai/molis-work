import type { ContractDescriptor } from "../platform/package.js";
import type { AgentRuntimeAdapter, AgentRuntimeDescriptor, AgentRuntimeCapabilityMatrix, AgentSessionRef, AgentRunRef } from "./agent-host-runtime.js";
import type { AgentReviewQueueApi, AgentReviewRequest, AgentReviewReceipt } from "./agent-host-reviews.js";
import type { ActionDefinition, ActionView } from "../platform/actions.js";
import type { AgentCreateSessionInput, AgentSkillRef, AgentWorkingDirectory, AgentStartInput } from "./agent-host-start.js";
import type { AgentSubagentView, AgentSkillCatalogEntry, AgentSkillCandidate, AgentMcpServerView, AgentMcpServerInput, AgentRecoveryReport, AgentCheckpoint } from "./agent-host-ports.js";
import type { AgentProjectWork, AgentProjectWorkOverlap, AgentSessionMessage, AgentPeopleMessageInput, AgentPeopleMessageAction, AgentMessageAttachment, AgentBackgroundTask } from "./agent-host-session.js";
import type { AgentSessionView, AgentSessionStatus, AgentRunHandle, AgentRunView, AgentRunControl, AgentCommandOutputRef, AgentCommandOutput } from "./agent-host-run-view.js";
import type { AgentCollaborationSessionView } from "./agent-collaboration.js";
import type { AgentSkillDefinition } from "../platform/plugin-agent.js";
// Declared by domain in the agent-host-*.ts files beside this one (W5-09); this subpath exports all of them.
export { AGENT_RUNTIME_CAPABILITIES, defaultAgentRuntime, hostsAgentSessions, isTerminalAgentPhase, resolveProjectRuntime } from "./agent-host-runtime.js";
export type {
  AgentRuntimeCapability,
  AgentCapabilitySupport,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  ProjectRuntimeResolution,
  AgentRuntimeHealthStatus,
  AgentRuntimeHealth,
  AgentSessionRef,
  AgentRunRef,
  AgentRunPhase,
  AgentRuntimeDiagnostics,
  AgentRuntimeAdapter,
} from "./agent-host-runtime.js";
export { agentTextMaterialContent, AGENT_REASONING_EFFORTS, parseAgentRunBudget } from "./agent-host-start.js";
export type {
  AgentWorkingDirectory,
  AgentWorkspace,
  AgentTextMaterial,
  AgentImageMaterial,
  AgentSkillRef,
  AgentMcpToolRef,
  AgentMcpSourceRef,
  AgentReasoningEffort,
  AgentRunBudget,
  AgentExecutionPlan,
  AgentFrozenCharacter,
  AgentFrozenStart,
  AgentCreateSessionInput,
  AgentCreateSessionRequest,
  AgentSessionOwner,
  AgentFrozenSubagentRole,
  AgentSubagentWorkspace,
  AgentDelegatedWork,
  AgentDelegation,
  AgentMemoryTools,
  AgentActionClient,
  AgentFrozenRole,
  AgentStartInput,
  AgentStartRequest,
} from "./agent-host-start.js";
export type {
  AgentProjectWork,
  AgentProjectWorkOverlap,
  AgentProjectWorkCapability,
  AgentSessionMessage,
  AgentMessageAttachment,
  AgentPeopleMessageInput,
  AgentPeopleMessageAction,
  AgentSessionMessagesCapability,
  AgentBackgroundTask,
  AgentBackgroundCapability,
  AgentStepOwner,
  AgentStepBoard,
  AgentStepAmendment,
} from "./agent-host-session.js";
export type {
  AgentRunHandle,
  AgentRunControl,
  AgentTurnKind,
  AgentTurnView,
  AgentToolActivityState,
  AgentToolActivity,
  AgentTokenCount,
  AgentUsageCoverage,
  AgentRunUsage,
  AgentCommandOutputRef,
  AgentCommandOutput,
  AgentTodoItem,
  AgentRunView,
  AgentRetryWait,
  AgentTurnChanges,
  AgentSessionView,
  AgentSessionStatus,
} from "./agent-host-run-view.js";
export type {
  AgentReviewKind,
  AgentTextReviewDocument,
  AgentCommandReviewDocument,
  AgentCommandGrants,
  AgentToolOperationReviewDocument,
  AgentMcpReviewDocument,
  AgentRewindReviewDocument,
  AgentGitIndexReviewDocument,
  AgentGitIntegrationReviewDocument,
  AgentReviewDocument,
  AgentReviewStatus,
  AgentReviewRequest,
  AgentReviewDecisionInput,
  AgentReviewReceipt,
  AgentGitIndexObservation,
  AgentReviewRecoveryView,
  AgentReviewRecoveryInput,
  AgentReviewQueueApi,
} from "./agent-host-reviews.js";
export type {
  AgentCheckpoint,
  AgentCheckpointsCapability,
  AgentSkillCatalogEntry,
  AgentSkillOwner,
  AgentSkillCandidate,
  AgentSkillLibrary,
  AgentSkillsCapability,
  AgentMcpServerHealth,
  AgentMcpServerInput,
  AgentMcpServerView,
  AgentMcpLibrary,
  AgentMcpToolDescriptor,
  AgentMcpCallResult,
  AgentMcpCapability,
  AgentSubagentState,
  AgentSubagentView,
  AgentSubagentsCapability,
  AgentRecoveryReport,
  AgentScheduledTask,
  AgentScheduleCapability,
  AgentRecoveryCapability,
} from "./agent-host-ports.js";
export type {
  BuilderAgentActivity,
  BuilderSkill,
  BuilderAgentRequest,
  BuilderAgentRecord,
  BoundedInferenceReceipt,
  InferenceUsageSource,
  InferenceTokenCount,
} from "./agent-host-builder.js";

export type { AgentStartExecution } from "./agent-host-start.js";

export { PLUGIN_REVIEW_KINDS, PLUGIN_REVIEW_PERMISSION_PREFIX, type PluginReviewKind } from "./agent-host-reviews.js";
export { agentOfferActions, type AgentActionOffer, type AgentOfferRunRequest, type AgentRunOffer } from "./agent-host-offers.js";
export { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerList, type AgentWriteCheckerSave, type AgentWriteCheckerStore, type AgentWriteCheckNote } from "./agent-host-write-checkers.js";

// Memory and documents through the runtime: declared beside this file, part of the same contract.
export type { AgentMemoryExecutionControl, AgentMemoryEntry, AgentMemoryMeta, AgentMemoryCandidateEntry, AgentPinnedMemory, AgentRecalledMemory, AgentMemoryRecallFact, AgentDocumentParser, AgentDocumentCapability, AgentMemoryCapability, AgentMemoryCandidateCapability } from "./agent-host-memory.js";

export const servicesAgentHostContract = {
  contractId: "io.molis.work.service.agent-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/horizontal/agent-host.md",
} as const satisfies ContractDescriptor;

/**
 * Every failure the Agent Host and its adapters can report.
 *
 * This is the whole domain, not a sample: each error class narrows from it with
 * `Extract`, so a code that is thrown but not listed here stops compiling. An
 * earlier version listed eight codes while seventeen were in use, and declared
 * one (`agent.review_required`) that nothing ever threw.
 */
export type AgentHostErrorCode =
  // Runtime registry
  | "agent.runtime_unknown"
  | "agent.runtime_duplicate"
  // Start authority: the three gates, plus what the adapter needs before it runs
  | "agent.capability_unavailable"
  | "agent.role_not_declared"
  | "agent.role_not_frozen"
  | "agent.role_execution_exceeded"
  | "agent.directory_unauthorized"
  | "agent.model_not_configured"
  // Session and run lookup
  | "agent.session_unknown"
  | "agent.session_busy"
  | "agent.run_unknown"
  // Host-owned review queue
  | "agent.review_unknown"
  | "agent.review_already_decided"
  | "agent.review_expired"
  | "agent.review_not_approved"
  // Approval bridge between a Runtime's pending effect and the queue
  | "agent.pending_unknown"
  | "agent.pending_not_open"
  // An answer to a question the Runtime would not take; the problems name each question and why (agent-interaction)
  | "agent.answer_invalid";

export interface AgentHostApi {
  register(adapter: AgentRuntimeAdapter): void;
  descriptors(): AgentRuntimeDescriptor[];
  adapter(runtimeId: string): AgentRuntimeAdapter;
  matrix(runtimeIds: string[]): Array<{
    runtime_id: string;
    capabilities: AgentRuntimeCapabilityMatrix;
  }>;
  readonly reviews: AgentReviewQueueApi;
}

/**
 * Capabilities the Host registers so Plugins can reach the Agent Host.
 *
 * A Plugin never holds the Agent Host itself: it declares these under
 * `capabilities.consumes` and `requires`, and the Host checks the declaration
 * before the call lands. That keeps the Manifest a complete account of what a
 * Plugin can reach, and keeps start authority in one place.
 */
/** What to draft: the purpose in a few words, how to write it, and the material it is drawn from. */
export interface AgentDraftTextRequest {
  purpose: string;
  /** Registered instruction owned by the trusted calling Plugin. */
  prompt: string;
  material: string;
  model_selection?: { provider_id: string; model_id: string };
}

export interface AgentDraftTextResult {
  text: string;
  /** Tokens the call used, when the provider reported them. */
  usage: { input: number; output: number } | null;
}

/** The parts of a session-message or background-command action's input (BL-364): a runtime, a session, a message or task id. */
const runtimeId = { type: "string", minLength: 1, maxLength: 200 } as const;
const entryId = { type: "string", minLength: 1, maxLength: 500 } as const;
const attachments = { type: "array", maxItems: 50, items: { type: "object", required: ["kind", "id"], additionalProperties: false,
  properties: { kind: entryId, id: entryId, version: { type: "integer", minimum: 1 }, title: { type: "string", maxLength: 2000 } } } } as const;
/** Runtime outputs follow the stored message/task contracts, not the limits for new input. */
const messageState = { enum: ["queued", "delivered", "accepted", "rejected", "completed", "expired", "cancelled"] } as const;
const messageAttachments = { type: "array", items: { type: "object", required: ["kind", "id"], additionalProperties: false,
  properties: { kind: { type: "string" }, id: { type: "string" }, version: { type: "number" }, title: { type: "string" } } } } as const;
const messageOutput = { type: "object", additionalProperties: false,
  required: ["message_id", "from_session", "to_session", "from_title", "to_title", "kind", "body", "state", "sent_at_ms"],
  properties: { message_id: { type: "string" }, from_session: { type: "string" }, to_session: { type: "string" }, from_title: { type: "string" }, to_title: { type: "string" },
    kind: { enum: ["request", "notice", "reply", "handoff"] }, body: { type: "string" }, state: messageState, sent_at_ms: { type: "number" },
    in_reply_to: { type: "string" }, await_reply: { const: true }, audience: { const: "people" }, attachments: messageAttachments, hops: { type: "number" },
    history: { type: "array", items: { type: "object", required: ["event", "state", "at_ms"], additionalProperties: false,
      properties: { event: { type: "string" }, state: messageState, at_ms: { type: "number" }, by: { type: "string" }, note: { type: "string" }, attachments: messageAttachments, late: { const: true } } } } } } as const;
const backgroundOutput = { type: "object", required: ["task_id", "session_id", "summary", "state", "started_at_ms"], additionalProperties: false,
  properties: { task_id: { type: "string" }, session_id: { type: "string" }, run_id: { type: "string" }, summary: { type: "string" },
    state: { enum: ["running", "succeeded", "failed", "stopped", "interrupted"] }, exit_code: { type: "number" }, started_at_ms: { type: "number" }, ended_at_ms: { type: "number" } } } as const;
const RUN_PHASES = ["starting", "running", "awaiting-review", "awaiting-input", "paused", "compacting", "completed", "failed", "cancelled", "stopped", "reconcile-required"] as const;
/** A project's work item and a session's standing, as the Runtime reports them (R8 batch 2). */
const projectWorkOutput = { type: "object", required: ["work_id", "session_id", "title", "task", "state", "directory", "paths", "updated_at_ms"], additionalProperties: false,
  properties: { work_id: { type: "string" }, session_id: { type: "string" }, run_id: { type: "string" }, title: { type: "string" }, task: { type: "string" },
    state: { enum: ["waiting", "running", "done", "failed", "stopped"] }, directory: { type: "string" }, paths: { type: "array", items: { type: "string" } },
    waits_for: { type: "array", items: { type: "string" } }, updated_at_ms: { type: "number" }, wait_id: { type: "string" } } } as const;
const sessionStatusOutput = { oneOf: [
  { type: "object", required: ["session_id", "latest_phase", "recovery", "checkpoint_busy"], additionalProperties: false,
    properties: { session_id: { type: "string" }, recovery: { type: "boolean" }, checkpoint_busy: { type: "boolean" },
      latest_phase: { enum: [...RUN_PHASES, null] },
      steps: { type: "object", required: ["mine", "subtasks", "unowned"], additionalProperties: false,
        properties: { mine: { type: "number" }, subtasks: { type: "number" }, unowned: { type: "number" } } } } },
  { type: "object", required: ["session_id", "error"], additionalProperties: false, properties: { session_id: { type: "string" }, error: { type: "string" } } },
] } as const;
const sessionRef = { type: "object", required: ["session_id", "runtime_id"], additionalProperties: false, properties: { session_id: entryId, runtime_id: runtimeId } } as const;
/** A round of a session, and what a session's recovery, checkpoints and command receipts read as (R8 batch 3). */
const runRef = { type: "object", required: ["run_id", "session_id"], additionalProperties: false, properties: { run_id: entryId, session_id: entryId } } as const;
const strings = { type: "array", items: { type: "string" } } as const;
const recoveryOutput = { type: "object", required: ["session_id", "blockers", "runs"], additionalProperties: false, properties: {
  session_id: { type: "string" }, blockers: strings,
  inputs: { type: "array", items: { type: "object", required: ["input_id", "text", "source"], additionalProperties: false, properties: {
    input_id: { type: "string" }, text: { type: "string" }, source: { enum: ["person", "host", "peer"] }, key: { type: "string" }, about: { type: "string" },
    left_by: { type: "object", required: ["run_id", "applied"], additionalProperties: false, properties: { run_id: { type: "string" }, applied: { type: "boolean" } } } } } },
  runs: { type: "array", items: { type: "object", required: ["run_id", "version", "live", "waiting", "can_close", "blockers", "operations"], additionalProperties: false, properties: {
    run_id: { type: "string" }, version: { type: "number" }, live: { type: "boolean" }, waiting: { type: "number" }, can_close: { type: "boolean" }, can_answer: { const: true },
    questions: { type: "array", items: { type: "object", required: ["pending_id", "pending_revision", "kind", "prompt"], additionalProperties: false, properties: {
      pending_id: { type: "string" }, pending_revision: { type: "number" }, kind: { type: "string" }, prompt: { type: "string" }, answered: { const: true } } } },
    blockers: strings,
    operations: { type: "array", items: { type: "object", required: ["effect_id", "kind", "summary", "outcome"], additionalProperties: false, properties: {
      effect_id: { type: "string" }, kind: { type: "string" }, summary: { type: "string" }, outcome: { enum: ["completed", "failed", "not-dispatched", "unknown"] } } } },
    subagent: { type: "object", required: ["subagent_id"], additionalProperties: false, properties: { subagent_id: { type: "string" } } } } } } } } as const;
/** The person's answer to a question a round stopped on (`AgentAnswerControl`). */
const questionValue = { anyOf: [{ type: "string", maxLength: 1_000_000 }, { type: "number" }, { type: "null" }, { type: "array", maxItems: 500, items: { type: "object", required: ["kind", "id", "label"],
  additionalProperties: false, properties: { kind: entryId, id: entryId, label: { type: "string", maxLength: 2000 } } } }] } as const;
const runControl = { oneOf: [
  { type: "object", required: ["kind"], additionalProperties: false, properties: { kind: { enum: ["pause", "resume", "stop", "cancel"] } } },
  { type: "object", required: ["kind", "provider_id", "model_id"], additionalProperties: false, properties: { kind: { const: "switch-model" }, provider_id: entryId, model_id: entryId } },
  { type: "object", required: ["kind", "pending_id"], additionalProperties: false, properties: { kind: { const: "answer" }, pending_id: entryId, pending_revision: { type: "integer", minimum: 0 },
    text: { type: "string", maxLength: 1_000_000 }, answers: { type: "array", maxItems: 500, items: { type: "object", required: ["question"], additionalProperties: false, properties: {
      question: { type: "integer", minimum: 0 }, indexes: { type: "array", maxItems: 500, items: { type: "integer", minimum: 0 } }, other: { type: "string", maxLength: 1_000_000 }, value: questionValue } } } } },
] } as const;
/**
 * A session and its rounds as a plugin reads and starts them (R8 batch 3, §9.3): the top level of each view listed in full. A nested
 * object lists the fields callers in this repository read, with their types (BL-470, RAC-667); it stays open, since the rest is the
 * runtime's record. A field no caller reads, or one nested deeper, is only said to be an object.
 */
const object = { type: "object" } as const;
const objects = { type: "array", items: object } as const;
const text = (maxLength: number) => ({ type: "string", maxLength }) as const;
const count = { type: "integer", minimum: 1 } as const;
const number = { type: "number" } as const;
const string = { type: "string" } as const;
const shape = <R extends readonly string[], P extends Record<string, unknown>>(required: R, properties: P) => ({ type: "object", required, properties }) as const;
const list = <I>(items: I) => ({ type: "array", items }) as const;
const coverage = { enum: ["unknown", "reported", "estimated", "partial", "partial-estimated"] } as const;
const turnOutput = shape(["turn_id", "kind", "text", "at"], { turn_id: string, kind: { enum: ["user", "assistant", "system", "notice"] }, text: string, at: { type: ["string", "null"] }, sequence: number,
  steer: shape(["id", "state"], { id: string, state: { enum: ["received", "applied", "read", "unread", "withdrawn"] }, key: string, about: string, model_claim: object, questions: objects }) });
const activityOutput = shape(["call_id", "name", "target", "state", "summary", "at"], { call_id: string, name: string, target: string, state: { enum: ["started", "completed", "failed", "unknown"] },
  summary: string, output: string, output_truncated: { type: "boolean" }, output_hidden_lines: number, at: { type: ["string", "null"] }, sequence: number });
const usageOutput = shape(["tokens"], { tokens: shape(["input", "output"], { input: number, output: number, cached_input: number, cache_creation: number, reasoning: number }),
  compaction: shape(["recorded_calls", "incomplete"], { recorded_calls: number, incomplete: { type: "boolean" } }), cost_usd: number, coverage: object, unavailable_reason: string,
  context: shape(["tokens", "coverage"], { tokens: number, coverage }) });
const questionOutput = shape(["pending_id", "kind", "prompt", "options"], { pending_id: string, pending_revision: number, sequence: number, kind: string, prompt: string,
  options: list(shape(["value", "label"], { value: string, label: string })), questions: objects, answerable: { type: "boolean" }, parked: { const: true }, unavailable_reason: string });
const stepBoardOutput = shape(["project_id", "version", "terminal", "nodes"], { project_id: string, version: number, terminal: { type: "boolean" }, nodes: list(shape(["id", "state", "reports"], {
  id: string, state: { enum: ["not-started", "ready", "running", "waiting", "succeeded", "failed", "cancelled", "blocked", "needs-reconciliation"] },
  reports: list(shape(["note", "at_ms"], { note: string, at_ms: number, by: shape(["kind", "label"], { kind: { enum: ["session", "subtask", "person", "handover", "other"] }, label: string, title: string }), inputs: objects })),
  owner: shape(["kind", "label"], { kind: { enum: ["session", "subtask", "person", "none", "other"] }, label: string, title: string, subagent_id: string, actor_id: string, expired: { const: true } }),
  title: string, depends_on: strings, inserted: { type: "boolean" }, origins: objects })) });
const memoryRef = shape(["memory_id", "version"], { memory_id: string, version: number });
const frozenOutput = shape(["role_id", "role_version", "execution", "model_id", "prompts", "skills", "mcp_tools", "host_tools", "text_materials", "budget"], {
  role_id: string, role_version: number, execution: { enum: ["read-only", "text-edit", "workspace-write", "operate"] }, model_id: string, budget: { type: ["object", "null"] },
  workspace: { enum: ["required", "none", "business"] }, directory: object, call_id: string,
  prompts: list(shape(["prompt_id", "version", "layer"], { prompt_id: string, version: number, layer: { enum: ["base", "role", "project", "task"] }, user_revision: number })),
  skills: objects, mcp_tools: objects, mcp_sources: objects, host_tools: strings, action_tools: objects, character: object, character_skill_ids: strings, execution_plan: object, subagent_workspaces: objects,
  text_materials: list(shape(["material_id", "source_artifact_id", "source_version"], { material_id: string, title: string, source_artifact_id: string, source_version: number })),
  compaction: shape(["prompt_id", "version", "above_tokens"], { prompt_id: string, version: number, above_tokens: number }),
  model_context: shape(["window_tokens", "prompt_includes_cache"], { window_tokens: number, prompt_includes_cache: { type: "boolean" } }),
  history: { const: "digest" }, thinking: { const: "adaptive" }, reasoning_effort: { enum: ["low", "medium", "high"] } });
const offerOutput = shape(["offer_id", "title", "summary", "reference", "offered_at"], { offer_id: string, title: string, summary: string, offered_at: string, input: {}, editable: strings,
  reference: shape(["capability_id", "version", "provider_id"], { capability_id: string, version: number, provider_id: string }),
  missing: list(shape(["field", "question"], { field: string, question: string })) });
const sessionRefOutput = { type: "object", required: ["session_id", "runtime_id"], additionalProperties: false, properties: { session_id: { type: "string" }, runtime_id: { type: "string" } } } as const;
const runRefOutput = { type: "object", required: ["run_id", "session_id"], additionalProperties: false, properties: { run_id: { type: "string" }, session_id: { type: "string" } } } as const;
const runViewOutput = { type: "object", required: ["ref", "phase", "frozen", "turns", "activity", "usage", "awaiting_input", "started_at", "ended_at"], additionalProperties: false, properties: {
  step_board: stepBoardOutput, step_board_error: { type: "string" }, ref: runRefOutput, phase: { enum: RUN_PHASES }, frozen: frozenOutput, turns: list(turnOutput), activity: list(activityOutput),
  command_outputs: { type: "array", items: { type: "object", required: ["call_id", "run_id"], properties: { call_id: { type: "string" }, run_id: { type: "string" } } } },
  usage: usageOutput, awaiting_input: list(questionOutput), stop_reason: { type: "string" },
  memory_recalled: shape(["method", "omitted", "unavailable"], { method: { enum: ["pinned", "recall"] }, omitted: list(memoryRef), unavailable: strings }),
  todo: list(shape(["id", "text", "state"], { id: string, text: string, state: { enum: ["pending", "in-progress", "done", "abandoned"] } })),
  turn_changes: list(shape(["turn", "sequence", "at", "files"], { turn: number, sequence: number, at: { type: ["string", "null"] },
    files: list(shape(["path", "byte_length", "digest", "checkpoint_id"], { path: string, byte_length: number, digest: string, checkpoint_id: string })) })),
  sleeping_until: { type: "string" }, retry_wait: shape(["until", "reason"], { until: string, reason: { enum: ["rate-limited", "unavailable", "not-sent"] } }),
  model_switch: shape([], { now: string, requested: string }), offers: list(offerOutput), started_at: { type: "string" }, ended_at: { type: ["string", "null"] } } } as const;
const sessionViewOutput = { type: "object", required: ["owner", "session", "title", "runs", "latest_run"], additionalProperties: false, properties: {
  workspace: { enum: ["required", "none", "business"] }, checkpoint_busy: { type: "boolean" }, recovery: { type: "object", required: ["required", "reason"], properties: { required: { const: true }, reason: { type: "string" } } },
  owner: { type: "object", required: ["project_id", "plugin_id", "install_id"], properties: { project_id: { type: "string" }, plugin_id: { type: "string" }, install_id: { type: "string" }, actor_id: { type: "string" } } },
  session: sessionRefOutput, title: { type: "string" }, runs: { type: "array", items: runRefOutput }, latest_run: { anyOf: [runViewOutput, { type: "null" }] },
  queued_inputs: list(shape(["input_id", "text", "source"], { input_id: string, text: string, source: { enum: ["person", "host", "peer"] }, key: string, about: string })) } } as const;
const reviewRequestOutput = { type: "object", required: ["review_id", "run", "project_id", "plugin_id", "kind", "document", "requested_at", "expires_at"], additionalProperties: false, properties: {
  review_id: { type: "string" }, run: { anyOf: [runRefOutput, { type: "null" }] }, operation: object, project_id: { type: "string" }, plugin_id: { type: "string" }, kind: { type: "string" },
  document: object, requested_at: { type: "string" }, expires_at: { type: ["string", "null"] } } } as const;
const subagentOutput = { type: "object", required: ["subagent_id", "parent_run", "role_id", "task", "state", "result", "workspace_path"], additionalProperties: false, properties: {
  child_run: runRefOutput, activity: list(activityOutput), usage: usageOutput, host_tools: strings, error: { type: "string" }, subagent_id: { type: "string" }, parent_run: runRefOutput,
  role_id: { type: "string" }, role_name: { type: "string" }, task: { type: "string" }, state: { type: "string" }, result: { type: ["string", "null"] }, workspace_path: { type: ["string", "null"] } } } as const;
/** A directory the Host granted, a fixed Artifact version: what a start names, never a raw path or a live object. */
const runtimeOutput = { type: "object", required: ["runtime_id", "display_name", "provider_version", "capabilities"], additionalProperties: false, properties: {
  runtime_id: { type: "string" }, display_name: { type: "string" }, provider_version: { type: "string" }, capabilities: object,
  supports_action_tools: { type: "boolean" }, supports_workspace_none: { type: "boolean" }, supports_workspace_business: { type: "boolean" }, supports_character_limits: { type: "boolean" } } } as const;
const actionViewOutput = { type: "object", required: ["capability_id", "version", "operation", "action", "provider", "availability"], additionalProperties: false, properties: {
  capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" }, operation: { enum: ["query", "command"] }, action: object, provider: object, availability: object } } as const;
const skillProperties = { skill_id: { type: "string" }, version: { type: "integer" }, name: { type: "string" }, summary: { type: "string" }, tools: strings } as const;
const skillEntryOutput = { type: "object", required: ["skill_id", "version", "name", "summary", "tools", "source", "enabled"], additionalProperties: false, properties: {
  ...skillProperties, source: { enum: ["builtin", "installed"] }, enabled: { type: "boolean" } } } as const;
const mcpServerOutput = { type: "object", required: ["id", "version", "label", "enabled", "transport", "timeout_ms", "credential", "health", "tools", "resources"], additionalProperties: false, properties: {
  id: { type: "string" }, version: { type: "integer" }, label: { type: "string" }, enabled: { type: "boolean" }, transport: { enum: ["stdio", "http"] }, timeout_ms: { type: "integer" },
  directory: object, executable: { type: "string" }, argv: strings, endpoint: { type: "string" }, credential: { enum: ["none", "present"] }, auth_connection_id: { type: "string" },
  health: { enum: ["connected", "disconnected", "unavailable", "not-reattached"] }, busy: { type: "string" }, error: { type: "string" }, tools: objects, resources: strings } } as const;
const directoryInput = { type: "object", required: ["canonical_path", "realpath_verified"], additionalProperties: false, properties: { canonical_path: { type: "string", minLength: 1, maxLength: 4096 }, realpath_verified: { type: "boolean" } } } as const;
const artifactInput = { type: "object", required: ["artifact_id", "version"], additionalProperties: false, properties: { artifact_id: entryId, version: count } } as const;
const workspaceKind = { enum: ["required", "none", "business"] } as const;
/** What a plugin creates a session with: no owner, the Host takes it from the call (§9.3②). */
const createSessionInput = { type: "object", required: ["title"], additionalProperties: false, properties: { title: text(2000), workspace: workspaceKind, directory: directoryInput, role_id: entryId } } as const;
const ids = (maxItems: number) => ({ type: "array", maxItems, items: entryId }) as const;
const mcpRef = { server: entryId, configuration_version: { type: "integer", minimum: 0 }, server_label: text(2000) } as const;
/** What a plugin starts a round with: no owner and no role, the Host adds both (§9.3②). */
const startInput = { type: "object", required: ["session", "task", "role_id"], additionalProperties: false, properties: {
  action_tools: { type: "array", maxItems: 500, items: { type: "object", required: ["capability_id", "version", "provider_id"], additionalProperties: false, properties: { capability_id: entryId, version: count, provider_id: entryId } } },
  action_gateway: { type: "boolean" }, character_skill_ids: ids(200),
  execution_plan: { type: "object", required: ["source", "title", "steps"], additionalProperties: false, properties: { source: artifactInput, title: text(2000),
    steps: { type: "array", maxItems: 500, items: { type: "object", required: ["id", "title", "acceptance"], additionalProperties: false, properties: { id: entryId, title: text(2000), acceptance: text(1_000_000), depends_on: ids(500) } } } } },
  continue_step_board_of: entryId, queued_work_id: entryId, queued: { anyOf: [{ enum: ["carry", "leave"] }, ids(500)] }, session_title: text(2000), browser: { const: false },
  history: { enum: ["session", "digest"] },
  subagent_workspaces: { type: "array", maxItems: 50, items: { type: "object", required: ["workspace_id", "directory"], additionalProperties: false, properties: { workspace_id: entryId, directory: directoryInput } } },
  character: { anyOf: [artifactInput, { type: "null" }] }, session: sessionRef, task: { type: "string", minLength: 1, maxLength: 1_000_000 }, role_id: entryId,
  model_selection: { type: "object", required: ["provider_id", "model_id"], additionalProperties: false, properties: { provider_id: entryId, model_id: entryId } },
  reasoning_effort: { enum: ["low", "medium", "high"] },
  text_materials: { type: "array", maxItems: 200, items: { type: "object", required: ["material_id", "title", "text", "source_artifact_id", "source_version"], additionalProperties: false,
    properties: { material_id: { type: "string", minLength: 1, maxLength: 240 }, title: text(2000), text: text(1_000_000), source_artifact_id: { type: "string", minLength: 1, maxLength: 200 }, source_version: count } } },
  image_materials: { type: "array", maxItems: 50, items: { type: "object", required: ["material_id", "title", "resource", "media_type"], additionalProperties: false, properties: { material_id: entryId, title: text(2000),
    resource: { type: "object", required: ["id", "revision"], additionalProperties: false, properties: { id: entryId, revision: count } }, media_type: entryId } } },
  skills: { type: "array", maxItems: 200, items: { type: "object", required: ["skill_id", "version"], additionalProperties: false, properties: { skill_id: entryId, version: count } } },
  mcp_tools: { type: "array", maxItems: 500, items: { type: "object", required: ["server", "tool"], additionalProperties: false, properties: { ...mcpRef, tool: entryId, version: entryId } } },
  mcp_sources: { type: "array", maxItems: 200, items: { type: "object", required: ["server"], additionalProperties: false, properties: mcpRef } },
  budget: { type: "object", additionalProperties: false, properties: { max_turns: count, max_output_tokens: count, max_total_tokens: count, max_duration_ms: { type: "integer", minimum: 1, maximum: 2_147_483_647 } } },
  workspace: workspaceKind, directory: directoryInput } } as const;
/** Offered to plugins only, which reach them through `services.actions` once their Manifest consumes them; nothing else needed. */
const skillRef = { type: "object", required: ["skill_id", "version"], additionalProperties: false, properties: { skill_id: entryId, version: count } } as const;
const mcpServerInput = { type: "object", required: ["expected_version", "label", "enabled", "timeout_ms", "transport"], additionalProperties: false, properties: {
  id: entryId, expected_version: { type: "integer", minimum: 0 }, label: text(2000), enabled: { type: "boolean" }, timeout_ms: { type: "integer", minimum: 1, maximum: 3_600_000 },
  transport: { enum: ["stdio", "http"] }, directory: directoryInput, executable: text(4096), argv: { type: "array", maxItems: 200, items: text(32_768) }, endpoint: text(4096),
  auth: { type: "object", required: ["kind"], additionalProperties: false, properties: { kind: { enum: ["none", "keep-existing", "replace-secret", "connection"] }, secret: text(65_536), connection_id: entryId } } } } as const;
const pluginOnly = { scope: "project", audiences: ["plugin"], permissions: [], subject_kinds: [] } as const;

export const agentHostCapabilities = {
  /** What the calling plugin's own grants let a round on this Runtime call (R8 rule 3); empty where the Runtime has no action tools. */
  listActions: {
    capability_id: "agent.actions.list.v1", version: 1, operation: "query",
    action: { title: "列出一轮能调的动作", description: "按调用插件自己的授权，列出这个运行时上一轮能调的动作；运行时不支持动作工具时为空。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [runtimeId], additionalItems: false }, output_schema: { type: "array", items: actionViewOutput } },
  } as ActionDefinition<[runtimeId: string], readonly ActionView[]>,
  /** Which Runtimes exist and what each one really supports: this machine's configuration, the same for every plugin. */
  listRuntimes: {
    capability_id: "agent.runtimes.v1", version: 2, operation: "query",
    action: { title: "列出运行时", description: "本机有哪些 Agent 运行时，各自真正支持什么。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", maxItems: 0 }, output_schema: { type: "array", items: runtimeOutput } },
  } as ActionDefinition<[], AgentRuntimeDescriptor[]>,
  /** Roles this Runtime can carry for the calling plugin's own declarations, with a reason for each it cannot. */
  availableRoles: {
    capability_id: "agent.roles.v1", version: 1, operation: "query",
    action: { title: "列出能用的角色", description: "调用插件自己声明的角色里，这个运行时能承载哪些，不能的写明原因。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [runtimeId], additionalItems: false },
      output_schema: { type: "array", items: { type: "object", required: ["role_id", "available"], additionalProperties: false, properties: {
        role_id: { type: "string" }, available: { type: "boolean" }, reason: { type: "string" } } } } },
  } as ActionDefinition<[runtimeId: string], Array<{ role_id: string; available: boolean; reason?: string }>>,
  /** A session for the calling plugin and person, both from the call (R8 rule 1). */
  createSession: {
    capability_id: "agent.session.create.v1", version: 1, operation: "command",
    action: { title: "新建 Agent 会话", description: "为调用的插件和本人新建一条 Agent 会话。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, createSessionInput], additionalItems: false }, output_schema: sessionRefOutput },
  } as ActionDefinition<[runtimeId: string, input: AgentCreateSessionInput], AgentSessionRef>,
  listSubagents: {
    capability_id: "agent.subagents.list.v1", version: 1, operation: "query",
    action: { title: "列出一轮的子任务", description: "自己会话里一轮派出的子任务。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [sessionRef, runRef], additionalItems: false }, output_schema: { type: "array", items: subagentOutput } },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentSubagentView[]>,
  /** Stop a subtask of the calling plugin's own round; who stopped it is the caller (R8 rule 4). */
  cancelSubagent: {
    capability_id: "agent.subagents.cancel.v1", version: 1, operation: "command",
    action: { title: "停下一个子任务", description: "本人停下自己会话里一轮派出的一个子任务。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [sessionRef, runRef, entryId], additionalItems: false } },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef, subagentId: string], void>,
  readSession: {
    capability_id: "agent.session.read.v1", version: 1, operation: "query",
    action: { title: "读 Agent 会话", description: "自己的一条会话：标题、各轮的引用和最近一轮。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [sessionRef], additionalItems: false }, output_schema: sessionViewOutput },
  } as ActionDefinition<[session: AgentSessionRef], AgentSessionView>,
  /**
   * Many sessions' standing in one call, for a directory: one queued operation instead of one per session. A session
   * this project cannot read comes back with an error of its own rather than failing the others.
   */
  readSessionStatuses: {
    capability_id: "agent.sessions.status.v1", version: 1, operation: "query",
    action: { title: "读会话的状态", description: "这个项目里几条会话各自最近一轮的阶段、要不要人来接、步骤由谁拿着；读不了的那条单独带原因。", kind: "query", ...pluginOnly,
      output_schema: { type: "array", items: sessionStatusOutput },
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, { type: "array", maxItems: 1000, items: entryId }], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, sessionIds: string[]], Array<AgentSessionStatus | { session_id: string; error: string }>>,
  /** The project's work under way; with a probe, what overlaps a round about to start. */
  readProjectWork: {
    capability_id: "agent.project-work.read.v1", version: 1, operation: "query",
    action: { title: "读项目里在做的事", description: "这个项目里各会话在做和在等的工作；带上将要开始的一轮时，另给出和它的文件重叠的。", kind: "query", ...pluginOnly,
      output_schema: { type: "object", required: ["items", "overlaps"], additionalProperties: false, properties: { items: { type: "array", items: projectWorkOutput },
        overlaps: { type: "array", items: { type: "object", required: ["work", "paths"], additionalProperties: false, properties: { work: projectWorkOutput, paths: { type: "array", items: { type: "string" } } } } } } },
      input_schema: { type: "array", minItems: 1, maxItems: 2, additionalItems: false, items: [runtimeId, { type: "object", required: ["directory", "text"], additionalProperties: false,
        properties: { session_id: entryId, directory: { type: "string", minLength: 1, maxLength: 4096 }, text: { type: "string", maxLength: 1_000_000 } } }] } },
  } as ActionDefinition<[runtimeId: string, probe?: { session_id?: string; directory: string; text: string }], { items: AgentProjectWork[]; overlaps: AgentProjectWorkOverlap[] }>,
  /** Messages between the project's sessions; one session's sent and received when a session is named. */
  readMessages: {
    capability_id: "agent.messages.read.v1", version: 1, operation: "query",
    action: { title: "读会话间的信", description: "这个项目里各会话之间的信；点名会话时只读它发出和收到的。", kind: "query", ...pluginOnly,
      output_schema: { type: "array", items: messageOutput },
      input_schema: { type: "array", minItems: 1, maxItems: 2, items: [runtimeId, entryId], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, sessionId?: string], AgentSessionMessage[]>,
  /** The person made a session the priority: overlapping sessions are asked to make way. */
  prioritizeSession: {
    capability_id: "agent.messages.prioritize.v1", version: 1, operation: "command",
    action: { title: "让这个会话优先", description: "本人让一个会话优先：与它手上的文件重叠的会话（至多五个）收到让路的信，谁停下仍由人定。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, entryId], additionalItems: false },
      output_schema: { type: "object", required: ["notified", "paths"], additionalProperties: false,
        properties: { notified: { type: "array", items: { type: "string" } }, paths: { type: "array", items: { type: "string" } } } } },
  } as ActionDefinition<[runtimeId: string, sessionId: string], { notified: string[]; paths: string[] }>,
  /** Send a message for people (a delegation, a delivery), on the person's behalf. */
  sendPeopleMessage: {
    capability_id: "agent.messages.send.v1", version: 1, operation: "command",
    action: { title: "替人发一封会话间的信", description: "本人经插件发一封给人看的信（一次委派、一份交付），从一个会话到另一个会话。", kind: "operation", ...pluginOnly,
      output_schema: messageOutput,
      input_schema: { type: "array", minItems: 2, maxItems: 2, additionalItems: false, items: [runtimeId, { type: "object", required: ["from_session", "to_session", "kind", "body"], additionalProperties: false,
        properties: { from_session: entryId, to_session: entryId, kind: { enum: ["request", "reply"] }, body: { type: "string", minLength: 1, maxLength: 1_000_000 },
          in_reply_to: entryId, attachments, ttl_ms: { type: "integer", minimum: 1 }, hops: { type: "integer", minimum: 0 } } }] } },
  } as ActionDefinition<[runtimeId: string, input: AgentPeopleMessageInput], AgentSessionMessage>,
  /** Move a message for people on, recording who and why. */
  actOnPeopleMessage: {
    capability_id: "agent.messages.act.v1", version: 1, operation: "command",
    action: { title: "处理一封会话间的信", description: "把一封给人看的信往下走：送达、接受、拒绝（带原因）、完成、撤回，或记一笔。", kind: "operation", ...pluginOnly,
      output_schema: messageOutput,
      input_schema: { type: "array", minItems: 3, maxItems: 4, additionalItems: false, items: [runtimeId, entryId,
        { enum: ["deliver", "accept", "reject", "complete", "cancel", "record"] },
        { type: "object", additionalProperties: false, properties: { event: { type: "string", minLength: 1, maxLength: 200 }, note: { type: "string", maxLength: 100_000 }, attachments } }] } },
  } as ActionDefinition<[runtimeId: string, messageId: string, action: AgentPeopleMessageAction, detail?: { event?: string; note?: string; attachments?: AgentMessageAttachment[] }], AgentSessionMessage>,
  /** The person withdraws an open message. */
  cancelMessage: {
    capability_id: "agent.messages.cancel.v1", version: 1, operation: "command",
    action: { title: "撤回一封会话间的信", description: "本人撤回一封还没处理完的信。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, entryId], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, messageId: string], void>,
  /** Hold a round until another piece of work in the project finishes. */
  queueProjectRound: {
    capability_id: "agent.project-work.queue.v1", version: 2, operation: "command",
    action: { title: "让一轮等别的工作做完", description: "本人决定让这条会话的一轮等项目里另一项工作结束后再开始。", kind: "operation", ...pluginOnly,
      output_schema: projectWorkOutput,
      input_schema: { type: "array", minItems: 2, maxItems: 2, additionalItems: false, items: [runtimeId, { type: "object", required: ["session", "directory", "task", "after"], additionalProperties: false,
        properties: { session: sessionRef, directory: { type: "string", minLength: 1, maxLength: 4096 }, task: { type: "string", minLength: 1, maxLength: 1_000_000 }, after: entryId,
          title: { type: "string", maxLength: 2000 } } }] } },
  } as ActionDefinition<[runtimeId: string, input: { session: AgentSessionRef; directory: string; task: string; after: string; title?: string }], AgentProjectWork>,
  /**
   * Continuations of the calling plugin's own sessions that are ready to go on, or held for the person, but for `exclude`
   * (request keys); waits up to `timeoutMs` for one, as `waitRun` waits (concurrent, a ceiling, dropped if cancelled).
   * Reading and controlling them are the actions in agent-collaboration.
   */
  awaitContinuations: {
    capability_id: "agent.collaboration.await.v1", version: 1, operation: "query",
    action: { title: "等会话接续", description: "等调用插件自己的会话里有一个能接着走或等人处理的接续；到时没有就回空表。", kind: "query", ...pluginOnly,
      scheduling: "concurrent", execution: { timeout_ms: 30_000 },
      input_schema: { type: "array", minItems: 2, maxItems: 3, additionalItems: false,
        items: [runtimeId, { type: "integer", minimum: 0, maximum: 25_000 }, ids(200)] },
      output_schema: { type: "array", items: { type: "object", required: ["session_id"], additionalProperties: false, properties: {
        session_id: { type: "string" }, wait: object, continuation: object } } } },
  } as ActionDefinition<[runtimeId: string, timeoutMs: number, exclude?: string[]], AgentCollaborationSessionView[]>,
  /** The project's background commands; one session's when named. */
  readBackground: {
    capability_id: "agent.background.read.v1", version: 1, operation: "query",
    action: { title: "读后台命令", description: "这个项目里在后台跑的命令；点名会话时只读它的。", kind: "query", ...pluginOnly,
      output_schema: { type: "array", items: backgroundOutput },
      input_schema: { type: "array", minItems: 1, maxItems: 2, items: [runtimeId, entryId], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, sessionId?: string], AgentBackgroundTask[]>,
  /** The person stops a running background command. */
  stopBackground: {
    capability_id: "agent.background.stop.v1", version: 1, operation: "command",
    action: { title: "停下一条后台命令", description: "本人停下一条正在后台跑的命令。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, entryId], additionalItems: false }, output_schema: { type: "boolean" } },
  } as ActionDefinition<[runtimeId: string, taskId: string], boolean>,
  /** Give up a waiting round's item. */
  releaseProjectRound: {
    capability_id: "agent.project-work.release.v1", version: 1, operation: "command",
    action: { title: "不再等", description: "放下一项还在等的工作，并写明为什么。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [runtimeId, entryId, { type: "string", maxLength: 2000 }], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, workId: string, note: string], void>,
  /** The calling plugin's method library on this Runtime (R8 rule 1: the library's owner is the caller). */
  listSkills: {
    capability_id: "agent.skills.list.v1", version: 1, operation: "query",
    action: { title: "列出方法", description: "调用插件在这个运行时上的方法库：内置的与装进来的。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [runtimeId], additionalItems: false }, output_schema: { type: "array", items: skillEntryOutput } },
  } as ActionDefinition<[runtimeId: string], AgentSkillCatalogEntry[]>,
  readSkill: {
    capability_id: "agent.skills.read.v1", version: 1, operation: "query",
    action: { title: "读一个方法", description: "读调用插件方法库里的一个方法的正文。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, skillRef], additionalItems: false },
      output_schema: { type: "object", required: ["skill_id", "version", "name", "summary", "tools", "body"], additionalProperties: false, properties: { ...skillProperties, body: { type: "string" } } } },
  } as ActionDefinition<[runtimeId: string, ref: AgentSkillRef], AgentSkillDefinition>,
  discoverSkills: {
    capability_id: "agent.skills.discover.v1", version: 1, operation: "query",
    action: { title: "在工作区里找方法", description: "在调用插件授权的工作区里找能装的方法。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [runtimeId, directoryInput, text(4096)], additionalItems: false },
      output_schema: { type: "array", items: { type: "object", required: ["candidate_id", "name", "summary", "source_label", "files", "body"], additionalProperties: false, properties: {
        candidate_id: { type: "string" }, name: { type: "string" }, summary: { type: "string" }, source_label: { type: "string" }, files: strings, body: { type: "string" } } } } },
  } as ActionDefinition<[runtimeId: string, directory: AgentWorkingDirectory, path: string], AgentSkillCandidate[]>,
  installSkill: {
    capability_id: "agent.skills.install.v1", version: 1, operation: "command",
    action: { title: "装一个方法", description: "把找到的一个方法装进调用插件自己的方法库。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, entryId], additionalItems: false }, output_schema: skillEntryOutput },
  } as ActionDefinition<[runtimeId: string, candidateId: string], AgentSkillCatalogEntry>,
  /**
   * The calling plugin's MCP servers on this Runtime. Listing also brings the project's action directory up to what they offer now
   * (the Host's own bookkeeping, not a business record), after the call's last check.
   */
  listMcp: {
    capability_id: "agent.mcp.list.v1", version: 1, operation: "query",
    action: { title: "列出 MCP 服务器", description: "调用插件在这个运行时上的 MCP 服务器与各自现在提供的工具；列的同时，宿主把这个插件自己的 MCP 工具按现在的样子在项目动作目录里重新登记（幂等，不写业务数据）。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [runtimeId], additionalItems: false }, output_schema: { type: "array", items: mcpServerOutput } },
  } as ActionDefinition<[runtimeId: string], AgentMcpServerView[]>,
  saveMcp: {
    capability_id: "agent.mcp.save.v1", version: 1, operation: "command",
    action: { title: "保存 MCP 服务器", description: "新建或改调用插件的一个 MCP 服务器；本机进程只能在授权工作区里。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, mcpServerInput], additionalItems: false }, output_schema: mcpServerOutput },
  } as ActionDefinition<[runtimeId: string, input: AgentMcpServerInput], AgentMcpServerView>,
  controlMcp: {
    capability_id: "agent.mcp.control.v1", version: 1, operation: "command",
    action: { title: "连上、断开或删掉 MCP 服务器", description: "对调用插件自己的一个 MCP 服务器连上、断开、取消正在做的或删掉。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [runtimeId, entryId, { enum: ["connect", "disconnect", "cancel", "remove"] }], additionalItems: false } },
  } as ActionDefinition<[runtimeId: string, id: string, action: "connect" | "disconnect" | "cancel" | "remove"], void>,
  /** Start a Run. The Host checks role, capability and directory before the Runtime is asked. */
  startRun: {
    capability_id: "agent.run.start.v1", version: 1, operation: "command",
    action: { title: "开始一轮 Agent 执行", description: "在自己的会话里按插件声明的角色开始一轮；宿主先核角色、能力与目录。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [runtimeId, startInput], additionalItems: false },
      output_schema: { type: "object", required: ["ref", "frozen"], additionalProperties: false, properties: { ref: runRefOutput, frozen: object } } },
  } as ActionDefinition<[runtimeId: string, input: AgentStartInput], AgentRunHandle>,
  readRun: {
    capability_id: "agent.run.read.v1", version: 1, operation: "query",
    action: { title: "读一轮执行", description: "自己会话里一轮的过程、状态和用量。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [sessionRef, runRef], additionalItems: false }, output_schema: runViewOutput },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentRunView>,
  /**
   * One short text from the model — a commit message, say — with no tools, no conversation and nothing recorded as a
   * round. It is a model call and costs what one costs; the usage comes back so the page can say so. An action like
   * every other (PG-035): only a plugin calls it, only while it holds `model:invoke`, with the instruction its own
   * (read from who called, never from the input). It writes nothing of the project's, so a draft that takes a minute
   * runs beside the project's other operations instead of ahead of them.
   */
  draftText: {
    capability_id: "agent.draft-text.v1", version: 1, operation: "command",
    action: { title: "起草一段文字", description: "用调用插件自己登记的指令，让模型就给定材料写一段短文字（如提交说明、对话摘要）：不带工具、不留对话、不记成一轮。会花一次模型调用，返回用量。只给持有 model:invoke 的插件调用。", kind: "operation", scope: "project", scheduling: "concurrent",
      execution: { cost: "metered" }, audiences: ["plugin"], permissions: ["model:invoke"], subject_kinds: [],
      input_schema: { type: "object", required: ["purpose", "prompt", "material"], additionalProperties: false, properties: {
        purpose: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
        prompt: { type: "string", pattern: "^[a-z0-9][a-z0-9.-]*$" },
        material: { type: "string", minLength: 1, maxLength: 60_000, pattern: "\\S" },
        model_selection: { type: "object", required: ["provider_id", "model_id"], additionalProperties: false, properties: { provider_id: { type: "string", minLength: 1 }, model_id: { type: "string", minLength: 1 } } } } },
      output_schema: { type: "object", required: ["text", "usage"], additionalProperties: false, properties: { text: { type: "string" },
        usage: { anyOf: [{ type: "null" }, { type: "object", required: ["input", "output"], additionalProperties: false, properties: { input: { type: "integer", minimum: 0 }, output: { type: "integer", minimum: 0 } } }] } } } },
  } as ActionDefinition<AgentDraftTextRequest, AgentDraftTextResult>,
  /**
   * Resolves once the run's view differs from the version the caller holds, or at the timeout (at most 25 s) with the latest view:
   * a round still running is an answer, not a failure. How a surface follows a live round as it happens instead of rereading it on
   * a timer; nothing is replayed. Concurrent, beside the project's queue; the Host stops it at 30 s whatever it does.
   */
  waitRun: {
    capability_id: "agent.run.wait.v1", version: 1, operation: "query",
    action: { title: "等一轮执行变化", description: "自己会话里的一轮有了变化就回答，最多等 25 秒；到时还没变就回答它现在的样子。", kind: "query", ...pluginOnly,
      scheduling: "concurrent", execution: { timeout_ms: 30_000 },
      input_schema: { type: "array", minItems: 4, maxItems: 4, additionalItems: false,
        items: [sessionRef, runRef, { type: ["string", "null"], maxLength: 200 }, { type: "integer", minimum: 0, maximum: 25_000 }] },
      output_schema: { type: "object", required: ["version", "view"], additionalProperties: false, properties: { version: { type: "string" }, view: runViewOutput } } },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef, since: string | null, timeoutMs: number], { version: string; view: AgentRunView }>,
  controlRun: {
    capability_id: "agent.run.control.v1", version: 1, operation: "command",
    action: { title: "控制一轮执行", description: "暂停、继续、停下或取消自己会话的一轮，换它之后用的模型，或回答它停下来问的问题。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [sessionRef, runRef, runControl], additionalItems: false } },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef, control: AgentRunControl], void>,
  /**
   * Read what one command this Run executed produced.
   *
   * This is a receipt of work already done, never a way to run something: there
   * is deliberately no command-execution Capability. A Runtime that has not
   * wired command execution to the Host's approval queue reports `command` as
   * unsupported, and this call then fails with `agent.capability_unavailable`
   * rather than returning an empty result.
   */
  readCommandOutput: {
    capability_id: "agent.command-output.v1", version: 1, operation: "query",
    action: { title: "读命令的输出", description: "自己会话里一轮已经跑过的一条命令的输出回执，不会再跑它。", kind: "query", ...pluginOnly,
      output_schema: { type: "object", required: ["ref", "command", "exit_code", "stdout", "stderr", "truncated"], additionalProperties: false, properties: {
        ref: { type: "object", required: ["call_id", "run_id"], additionalProperties: false, properties: { call_id: { type: "string" }, run_id: { type: "string" } } },
        command: { type: "string" }, exit_code: { type: ["number", "null"] }, stdout: { type: "string" }, stderr: { type: "string" }, truncated: { type: "boolean" },
        timed_out: { type: "boolean" }, cancelled: { type: "boolean" }, stop_reason: { enum: ["cancelled", "timed-out"] } } },
      input_schema: { type: "array", minItems: 2, maxItems: 2, additionalItems: false, items: [sessionRef,
        { type: "object", required: ["call_id", "run_id"], additionalProperties: false, properties: { call_id: entryId, run_id: entryId } }] } },
  } as ActionDefinition<
    [session: AgentSessionRef, ref: AgentCommandOutputRef],
    AgentCommandOutput
  >,
  inspectRecovery: {
    capability_id: "agent.session.recovery.v1", version: 1, operation: "query",
    action: { title: "看会话中断后的情况", description: "自己会话里被中断的轮次：还在等什么、做过哪些操作、能不能收尾或回答。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [sessionRef], additionalItems: false }, output_schema: recoveryOutput },
  } as ActionDefinition<[session: AgentSessionRef], AgentRecoveryReport>,
  recoverRun: {
    capability_id: "agent.session.recover.v1", version: 1, operation: "command",
    action: { title: "收尾一轮中断的执行", description: "把自己会话里一轮被中断的执行记为中断并收尾，不重做它做过的事。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [sessionRef, runRef, { type: "integer", minimum: 0 }], additionalItems: false }, output_schema: recoveryOutput },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef, expectedVersion: number], AgentRecoveryReport>,
  listCheckpoints: {
    capability_id: "agent.checkpoints.list.v1", version: 1, operation: "query",
    action: { title: "列出会话的检查点", description: "自己会话里各轮留下的文件检查点。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: [sessionRef], additionalItems: false },
      output_schema: { type: "array", items: { type: "object", required: ["checkpoint_id", "session_id", "label", "created_at"], additionalProperties: false, properties: {
        checkpoint_id: { type: "string" }, origin_run_id: { type: "string" }, paths: strings, session_id: { type: "string" }, label: { type: "string" }, created_at: { type: "string" }, rewound_at: { type: "string" },
        directory: { type: "object", required: ["canonical_path", "realpath_verified"], additionalProperties: false, properties: { canonical_path: { type: "string" }, realpath_verified: { type: "boolean" } } } } } } },
  } as ActionDefinition<[session: AgentSessionRef], AgentCheckpoint[]>,
  /** Ask the person to approve rewinding files to a checkpoint; nothing changes until they do. */
  prepareRewind: {
    capability_id: "agent.checkpoints.prepare-rewind.v1", version: 1, operation: "command",
    action: { title: "请求回退到检查点", description: "为自己会话的一个检查点准备文件回退，交本人审批。", kind: "operation", ...pluginOnly,
      input_schema: { type: "array", minItems: 3, maxItems: 3, items: [sessionRef, entryId, entryId], additionalItems: false }, output_schema: reviewRequestOutput },
  } as ActionDefinition<[session: AgentSessionRef, checkpointId: string, roleId: string], AgentReviewRequest>,
  /** Read the approval queue. Deciding is a user action and is not exposed to Plugins. */
  readRunReviews: {
    capability_id: "agent.run.reviews.v1", version: 1, operation: "query",
    action: { title: "读一轮的审批", description: "自己会话里一轮提交的审批与结果。", kind: "query", ...pluginOnly,
      input_schema: { type: "array", minItems: 2, maxItems: 2, items: [sessionRef, runRef], additionalItems: false },
      output_schema: { type: "array", items: { type: "object", required: ["request", "receipt"], additionalProperties: false, properties: {
        request: { type: "object", required: ["review_id"], properties: { review_id: { type: "string" } } }, receipt: { anyOf: [object, { type: "null" }] } } } } },
  } as ActionDefinition<[session: AgentSessionRef, run: AgentRunRef], Array<{ request: AgentReviewRequest; receipt: AgentReviewReceipt | null }>>,
} as const;

export type AgentHostCapabilityId =
  (typeof agentHostCapabilities)[keyof typeof agentHostCapabilities]["capability_id"];
