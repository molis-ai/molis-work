export type { AgentOriginalInputRef, AgentOriginalInputDraft, AgentOriginalInput } from "./agent-inputs.js";
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
export { AGENT_RUNTIME_CAPABILITIES, isTerminalAgentPhase } from "./agent-host-runtime.js";
export { agentSessionLifecycleActions } from "./agent-host-lifecycle.js";
export type {
  AgentRuntimeCapability,
  AgentCapabilitySupport,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentRuntimeHealthStatus,
  AgentRuntimeHealth,
  AgentSessionRef,
  AgentSessionOwner,
  AgentSessionDecision,
  AgentSessionPurgePreview,
  AgentSessionLifecycleView,
  AgentSessionLifecycleReceipt,
  AgentSessionLifecycle,
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
export type { AgentMemoryFormationSlot, AgentMemoryFormationContext, AgentMemoryFormationInput, AgentMemoryExtractionUsage,
  AgentMemoryFormationResult, AgentMemoryExtractionDraft, AgentMemoryExtractionRequest, AgentMemoryExtractor } from "./agent-host-memory-formation.js";

export { PLUGIN_REVIEW_KINDS, PLUGIN_REVIEW_PERMISSION_PREFIX, type PluginReviewKind } from "./agent-host-reviews.js";
export { agentOfferActions, type AgentActionOffer, type AgentOfferRunRequest, type AgentRunOffer } from "./agent-host-offers.js";
export { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerList, type AgentWriteCheckerSave, type AgentWriteCheckerStore, type AgentWriteCheckNote } from "./agent-host-write-checkers.js";

// Memory and documents through the runtime: declared beside this file, part of the same contract.
export type { AgentMemoryClassPolicy, AgentMemoryExecutionControl, AgentMemoryEntry, AgentMemoryMeta, AgentMemoryCandidateEntry, AgentPinnedMemory, AgentRecalledMemory, AgentMemoryRecallFact, AgentMemoryUseReceipt, AgentDocumentParser, AgentDocumentCapability, AgentMemoryCapability, AgentMemoryCandidateCapability,
  AgentMemoryPage, AgentMemoryPageQuery, AgentMemoryCaller, AgentMemoryMutation, AgentMemoryChange, AgentMemoryPreviewMutation, AgentMemorySourceRef, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentMemorySourceRequest, AgentMemoryPromotionIdentity, AgentMemoryPromotionRequest, AgentMemoryPromotionPreparation, AgentMemoryPromotionApplied, AgentMemoryPromotionReceipt, AgentMemoryPromotion, AgentMemoryPromotionPendingError, AgentMemoryDecisionReceipt, AgentMemoryScopePreview, AgentMemoryClearResult } from "./agent-host-memory.js";

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
    capability_id: "agent.sessions.status.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, sessionIds: string[]], Array<AgentSessionStatus | { session_id: string; error: string }>>,
  /** The project's work under way; with a probe, what overlaps a round about to start. */
  readProjectWork: {
    capability_id: "agent.project-work.read.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, probe?: { session_id?: string; directory: string; text: string }], { items: AgentProjectWork[]; overlaps: AgentProjectWorkOverlap[] }>,
  /** Messages between the project's sessions; one session's sent and received when a session is named. */
  readMessages: {
    capability_id: "agent.messages.read.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, sessionId?: string], AgentSessionMessage[]>,
  /** The person made a session the priority: overlapping sessions are asked to make way. */
  prioritizeSession: {
    capability_id: "agent.messages.prioritize.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, sessionId: string], { notified: string[]; paths: string[] }>,
  /** Send a message for people (a delegation, a delivery), on the person's behalf. */
  sendPeopleMessage: {
    capability_id: "agent.messages.send.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, input: AgentPeopleMessageInput], AgentSessionMessage>,
  /** Move a message for people on, recording who and why. */
  actOnPeopleMessage: {
    capability_id: "agent.messages.act.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, messageId: string, action: AgentPeopleMessageAction, detail?: { event?: string; note?: string; attachments?: AgentMessageAttachment[] }], AgentSessionMessage>,
  /** The person withdraws an open message. */
  cancelMessage: {
    capability_id: "agent.messages.cancel.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, messageId: string], void>,
  /** Hold a round until another piece of work in the project finishes. */
  queueProjectRound: {
    capability_id: "agent.project-work.queue.v1", version: 2, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, input: { session: AgentSessionRef; directory: string; task: string; after: string; title?: string }], AgentProjectWork>,
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
  } as HostCapabilityDefinition<[runtimeId: string, sessionId?: string], AgentBackgroundTask[]>,
  /** The person stops a running background command. */
  stopBackground: {
    capability_id: "agent.background.stop.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, taskId: string], boolean>,
  /** Give up a waiting round's item. */
  releaseProjectRound: {
    capability_id: "agent.project-work.release.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, workId: string, note: string], void>,
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
