import type { ContractDescriptor } from "../platform/package.js";
import type { AgentRuntimeAdapter, AgentRuntimeDescriptor, AgentRuntimeCapabilityMatrix, AgentSessionRef, AgentRunRef } from "./agent-host-runtime.js";
import type { AgentReviewQueueApi, AgentReviewRequest, AgentReviewReceipt, AgentReviewStatus } from "./agent-host-reviews.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";
import type { ActionDefinition, ActionView } from "../platform/actions.js";
import type { AgentCreateSessionInput, AgentSkillRef, AgentWorkingDirectory, AgentStartRequest } from "./agent-host-start.js";
import type { AgentSubagentView, AgentSkillCatalogEntry, AgentSkillCandidate, AgentMcpServerView, AgentMcpServerInput, AgentRecoveryReport, AgentCheckpoint } from "./agent-host-ports.js";
import type { AgentProjectWork, AgentProjectWorkOverlap, AgentSessionMessage, AgentPeopleMessageInput, AgentPeopleMessageAction, AgentMessageAttachment, AgentBackgroundTask } from "./agent-host-session.js";
import type { AgentSessionView, AgentSessionStatus, AgentRunHandle, AgentRunView, AgentRunControl, AgentCommandOutputRef, AgentCommandOutput } from "./agent-host-run-view.js";
import type { AgentCollaborationSessionView } from "./agent-collaboration.js";
import type { AgentSkillDefinition } from "../platform/plugin-agent.js";
// Declared by domain in the agent-host-*.ts files beside this one (W5-09); this subpath exports all of them.
export { AGENT_RUNTIME_CAPABILITIES, defaultAgentRuntime, hostsAgentSessions, isTerminalAgentPhase } from "./agent-host-runtime.js";
export type {
  AgentRuntimeCapability,
  AgentCapabilitySupport,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
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
  AgentFrozenSubagentRole,
  AgentSubagentWorkspace,
  AgentDelegatedWork,
  AgentDelegation,
  AgentMemoryTools,
  AgentActionClient,
  AgentFrozenRole,
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
/** A project's work item and a session's standing, as the Runtime reports them (R8 batch 2). */
const projectWorkOutput = { type: "object", required: ["work_id", "session_id", "title", "task", "state", "directory", "paths", "updated_at_ms"], additionalProperties: false,
  properties: { work_id: { type: "string" }, session_id: { type: "string" }, run_id: { type: "string" }, title: { type: "string" }, task: { type: "string" },
    state: { enum: ["waiting", "running", "done", "failed", "stopped"] }, directory: { type: "string" }, paths: { type: "array", items: { type: "string" } },
    waits_for: { type: "array", items: { type: "string" } }, updated_at_ms: { type: "number" }, wait_id: { type: "string" } } } as const;
const sessionStatusOutput = { oneOf: [
  { type: "object", required: ["session_id", "latest_phase", "recovery", "checkpoint_busy"], additionalProperties: false,
    properties: { session_id: { type: "string" }, recovery: { type: "boolean" }, checkpoint_busy: { type: "boolean" },
      latest_phase: { enum: ["starting", "running", "awaiting-review", "awaiting-input", "paused", "compacting", "completed", "failed", "cancelled", "stopped", "reconcile-required", null] },
      steps: { type: "object", required: ["mine", "subtasks", "unowned"], additionalProperties: false,
        properties: { mine: { type: "number" }, subtasks: { type: "number" }, unowned: { type: "number" } } } } },
  { type: "object", required: ["session_id", "error"], additionalProperties: false, properties: { session_id: { type: "string" }, error: { type: "string" } } },
] } as const;
const sessionRef = { type: "object", required: ["session_id", "runtime_id"], additionalProperties: false, properties: { session_id: entryId, runtime_id: runtimeId } } as const;
/** Offered to plugins only, which reach them through `services.actions` once their Manifest consumes them; nothing else needed. */
const pluginOnly = { scope: "project", audiences: ["plugin"], permissions: [], subject_kinds: [] } as const;

export const agentHostCapabilities = {
  listActions: { capability_id: "agent.actions.list.v1", version: 1, operation: "query" } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], readonly ActionView[]>,
  /** Which Runtimes exist and what each one really supports. */
  listRuntimes: {
    capability_id: "agent.runtimes.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[], AgentRuntimeDescriptor[]>,
  /** Roles this Runtime can carry for one Plugin, with a reason for each it cannot. */
  availableRoles: {
    capability_id: "agent.roles.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [runtimeId: string, pluginId: string],
    Array<{ role_id: string; available: boolean; reason?: string }>
  >,
  createSession: {
    capability_id: "agent.session.create.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, input: AgentCreateSessionInput],
    AgentSessionRef
  >,
  listSubagents: {
    capability_id: "agent.subagents.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentSubagentView[]>,
  cancelSubagent: {
    capability_id: "agent.subagents.cancel.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, subagentId: string, actorId: string], void>,
  readSession: {
    capability_id: "agent.session.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentSessionView>,
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
   * Continuations of the project's sessions that are ready to go on, or held for the person, but for `exclude` (request
   * keys); waits up to `timeoutMs` for one. A wait, so it stays a Host channel: reading and controlling are the actions
   * in agent-collaboration.
   */
  awaitContinuations: {
    capability_id: "agent.collaboration.await.v1", version: 1, operation: "wait",
  } as HostCapabilityDefinition<[runtimeId: string, timeoutMs: number, exclude?: string[]], AgentCollaborationSessionView[]>,
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
  listSkills: {
    capability_id: "agent.skills.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentSkillCatalogEntry[]>,
  readSkill: {
    capability_id: "agent.skills.read.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, ref: AgentSkillRef], AgentSkillDefinition>,
  discoverSkills: {
    capability_id: "agent.skills.discover.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, directory: AgentWorkingDirectory, path: string], AgentSkillCandidate[]>,
  installSkill: {
    capability_id: "agent.skills.install.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, candidateId: string], AgentSkillCatalogEntry>,
  listMcp: {
    capability_id: "agent.mcp.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentMcpServerView[]>,
  saveMcp: {
    capability_id: "agent.mcp.save.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, input: AgentMcpServerInput], AgentMcpServerView>,
  controlMcp: {
    capability_id: "agent.mcp.control.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, id: string, action: "connect" | "disconnect" | "cancel" | "remove"], void>,
  /** Start a Run. The Host checks role, capability and directory before the Runtime is asked. */
  startRun: {
    capability_id: "agent.run.start.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, request: AgentStartRequest],
    AgentRunHandle
  >,
  readRun: {
    capability_id: "agent.run.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentRunView>,
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
   * Resolves once the run's view differs from the version the caller holds, or at the timeout (at most 25 s).
   * How a surface follows a live round as it happens instead of rereading it on a timer; nothing is replayed.
   */
  waitRun: {
    capability_id: "agent.run.wait.v1",
    version: 1,
    operation: "wait",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, since: string | null, timeoutMs: number], { version: string; view: AgentRunView }>,
  controlRun: {
    capability_id: "agent.run.control.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, run: AgentRunRef, control: AgentRunControl],
    void
  >,
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
    capability_id: "agent.command-output.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, ref: AgentCommandOutputRef],
    AgentCommandOutput
  >,
  inspectRecovery: {
    capability_id: "agent.session.recovery.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentRecoveryReport>,
  recoverRun: {
    capability_id: "agent.session.recover.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, expectedVersion: number], AgentRecoveryReport>,
  listCheckpoints: {
    capability_id: "agent.checkpoints.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentCheckpoint[]>,
  prepareRewind: {
    capability_id: "agent.checkpoints.prepare-rewind.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, checkpointId: string, roleId: string], AgentReviewRequest>,
  /** Read the approval queue. Deciding is a user action and is not exposed to Plugins. */
  readRunReviews: {
    capability_id: "agent.run.reviews.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], Array<{ request: AgentReviewRequest; receipt: AgentReviewReceipt | null }>>,
  listReviews: {
    capability_id: "agent.reviews.list.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [projectId: string, status?: AgentReviewStatus],
    AgentReviewRequest[]
  >,
} as const;

export type AgentHostCapabilityId =
  (typeof agentHostCapabilities)[keyof typeof agentHostCapabilities]["capability_id"];
