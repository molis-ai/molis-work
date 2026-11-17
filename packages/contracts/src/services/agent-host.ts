export type { AgentOriginalInputRef, AgentOriginalInputDraft, AgentOriginalInput } from "./agent-inputs.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { AgentRuntimeAdapter, AgentRuntimeDescriptor, AgentRuntimeCapabilityMatrix } from "./agent-host-runtime.js";
import type { AgentReviewQueueApi } from "./agent-host-reviews.js";
export type { ReviewReference, ReviewDelegationReference, ReviewDecisionSource, ReviewDecisionRecord } from "../platform/reviews.js";
export type { AgentDelegationMode, AgentDelegationExecutor, AgentDelegationSubject, AgentDelegationTargetOwner, AgentDelegationOperationScope,
  AgentActionDelegationScope, AgentExactDelegationScope, AgentDelegationScope, AgentDelegationSelection, AgentDelegationState } from "./agent-delegations.js";
export { AGENT_DELEGATIONS_PROVIDER_ID, agentDelegationActions } from "./agent-delegation-actions.js";
export { AGENT_AUTHORIZATIONS_PROVIDER_ID, AUTHORIZATION_OWNERS, agentAuthorizationActions } from "./agent-authorizations.js";
export type { AuthorizationOwner, AuthorizationStatus, AuthorizationChangeKind, AuthorizationKey, AuthorizationFilter, AuthorizationEntry,
  AuthorizationDetail, AuthorizationChange, AuthorizationList } from "./agent-authorizations.js";
export type { AgentDelegationActionChoice, AgentDelegationCandidate, AgentDelegationWorkChoice, AgentDelegationProposal, AgentDelegationGrantInput,
  AgentDelegationNarrowInput, AgentDelegationUpdateInput, AgentDelegationModeInput, AgentDelegationToken, AgentDelegationProjection,
  AgentDelegationPreparation } from "./agent-delegation-actions.js";
export type {AgentSavedHistoryMessage,AgentSavedHistoryRun,AgentSavedHistoryView} from './agent-history.js';
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
  AgentSessionLifecycleCapability,
  AgentSessionWriteObservation,
  AgentSessionLifecycleView,
} from "./agent-host-runtime.js";
export { agentTextMaterialContent, AGENT_REASONING_EFFORTS, FIBONACCI_STORY_POINTS, isValidFibonacciStoryPoints, parseAgentRunBudget } from "./agent-host-start.js";
export type {
  AgentActionReviewControl,
  AgentActionReviewAuthority,
  AgentWorkingDirectory,
  AgentWorkspace,
  AgentTextMaterial,
  AgentMaterialDeliveryMode,
  AgentMaterialChecklistItem,
  AgentMaterialOrigin,
  AgentImageMaterial,
  AgentFrozenSkill,
  AgentRoundSkill,
  AgentMcpToolRef,
  AgentMcpSourceRef,
  AgentReasoningEffort,
  AgentStoryPoints,
  AgentEstimateSource,
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
  AgentDelegatedRequirement,
  AgentDelegatedAcceptance,
  AgentDeliveryReport,
  AgentDelivery,
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
  AgentStepProgressSummary,
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
  AgentRunSkillRead,
  AgentTokenCount,
  AgentUsageCoverage,
  AgentRunUsage,
  AgentCommandOutputRef,
  AgentCommandOutput,
  AgentEvidenceCheck,
  AgentEvidenceCheckRequest,
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
  AgentReviewDecisionAvailability,
  AgentReviewDecisions,
  AgentReviewRow,
  AgentReviewReceipt,
  AgentGitIndexObservation,
  AgentReviewRecoveryView,
  AgentReviewRecoveryInput,
  AgentReviewQueueApi,
  AgentWriteCheckCause,
  AgentWriteCheckError,
  AgentWriteChecks,
} from "./agent-host-reviews.js";
export type {
  AgentCheckpoint,
  AgentCheckpointsCapability,
  AgentSkillOwner,
  AgentMcpServerInput,
  AgentMcpServerView,
  AgentMcpLibrary,
  AgentMcpToolDescriptor,
  AgentMcpCallResult,
  AgentSubagentState,
  AgentSubagentRetrySource,
  AgentSubagentAttemptSummary,
  AgentSubagentBudgetView,
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

export type { AgentStartExecution, AgentRunInstructions } from "./agent-host-start.js";
export type { AgentMemoryFormationSlot, AgentMemoryFormationContext, AgentMemoryFormationInput, AgentMemoryExtractionUsage,
  AgentMemoryFormationResult, AgentMemoryExtractionDraft, AgentMemoryExtractionRequest, AgentMemoryExtractor } from "./agent-host-memory-formation.js";

export { PLUGIN_REVIEW_KINDS, PLUGIN_REVIEW_PERMISSION_PREFIX, type PluginReviewKind } from "./agent-host-reviews.js";
export { agentOfferActions, type AgentActionOffer, type AgentOfferRunRequest, type AgentRunOffer } from "./agent-host-offers.js";
export { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerList, type AgentWriteCheckerSave, type AgentWriteCheckerStore, type AgentWriteCheckNote } from "./agent-host-write-checkers.js";

// Memory and documents through the runtime: declared beside this file, part of the same contract.
export type { AgentMemoryClassPolicy, AgentMemoryExecutionControl, AgentMemoryPageQuery, AgentMemoryPage, AgentMemoryEntry, AgentMemoryMeta, AgentMemoryCandidateEntry, AgentPinnedMemory, AgentRecalledMemory, AgentMemoryRecallFact, AgentMemoryUseReceipt, AgentMemoryCapability, AgentMemoryCandidateCapability,
  AgentMemoryCaller, AgentMemoryMutation, AgentMemoryChange, AgentMemoryPreviewMutation, AgentMemorySourceRef, AgentMemorySourceIdentity, AgentMemorySourceSnapshot, AgentMemorySourceRequest, AgentMemoryPromotionIdentity, AgentMemoryPromotionRequest, AgentMemoryPromotionPreparation, AgentMemoryPromotionApplied, AgentMemoryPromotionReceipt, AgentMemoryPromotion, AgentMemoryPromotionPendingError, AgentMemoryDecisionReceipt, AgentMemoryScopePreview, AgentMemoryBatchPreview, AgentMemoryClearResult } from "./agent-host-memory.js";

export const servicesAgentHostContract = {
  contractId: /* @version contract.io.molis.work.service.agent-host "io.molis.work.service.agent-host.v{version}" */ "io.molis.work.service.agent-host.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.agent-host */ 1,
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
  | "agent.answer_invalid"
  | "agent.pinned_revision_mismatch"
  // A subagent's idempotency key outside the admitted pattern (prologue-collaboration admission)
  | "agent.subagent_key_invalid";

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

export { agentHostCapabilities, type AgentHostCapabilityId } from "./agent-host-capabilities.js";
