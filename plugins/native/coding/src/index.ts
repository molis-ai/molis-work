export { CODING_INSTRUCTIONS, CODING_COMMIT_DRAFT, CODING_HISTORY_SUMMARY } from "./prompts.js";
export { codingReportPreview } from "./report.js";
export { codingChangeSetPreview, codingNetChange } from "./changeset.js";
export { codingResultDocumentHandler } from "./results-document.js";
export { codingOutputReferences, codingOutputs } from "./outputs.js";
export { codingFollowUps, CODING_NEXT_STEP, type CodingFollowUpRun } from "./next-steps.js";
export { codingInteractionHtml } from "./interaction-html.js";
export { codingContinuation, originalTask, requestText, CONTINUATION_MARKER, MENTIONS_MARKER } from "./continuation.js";
export { createCodingCodePaint } from "./code-paint-client.js";
export { commitDraftMaterial, commitMessageFrom } from "./commit-draft.js";
export { planMaterial, planTask } from "./plans.js";
export { executionSteps, parseCodingPlan } from "./plan-content.js";
export { mentionedPaths, attachMentions, workspaceFileIndex, symbolsIn, symbolBlock } from "./mentions.js";
export { codingHistoryDigest, historySummaryMaterial, summaryDigest, nextHistoryMode, digestTask, HISTORY_DIGEST_MARKER, HISTORY_DIGEST_RATIO, MODEL_DIGEST_HEAD } from "./history-digest.js";
export { MAX_DELEGATION_HOPS, DELEGATION_STATE_KEY, type DelegationState } from "./cooperation.js";
export { codingRunForDisplay, codingRunSummary, codingSessionUsage, summaryCache, summariesFingerprint, SESSION_WINDOW, SESSION_PAGE, type CodingRunSummary, type CodingSessionUsage } from "./session-window.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-coding",
  packagePath: "plugins/native/coding",
  kind: "native-plugin",
  maturity: "production",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["coding.artifact-types.v1", "coding.ui-contribution.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  CODING_PLUGIN_ID,
  CODING_PROJECT_PLUGIN_ID,
  codingManifest,
} from "./manifest.js";
export {
  projectCodingIdentity,
  type CodingIdentityInput,
  type CodingIdentityLayer,
  type CodingIdentityView,
} from "./identity.js";
export { CODING_MESSAGES } from "./messages.js";
export {
  CODING_DIRECTORY_FACES,
  CODING_SETTINGS_UI_CONTRIBUTION_ID,
  CODING_COMPANION_DIRECTORY_SLOT,
  CODING_COMPANION_RESULT_SLOT,
  CODING_UI_CONTRIBUTION_ID,
  codingUiContribution,
  codingUiView,
  codingUiDescriptor,
  codingSettingsContribution,
  codingSettingsDescriptor,
  renderCodingDirectory,
  renderCodingIdentity,
  renderCodingReport,
  renderCodingUsage,
  renderPendingReviewCard,
  renderCodingSettings,
  renderCodingWorkbench,
  type CodingDirectoryFace,
  type CodingSettingsModel,
  type CodingPendingReview,
  type CodingIdentityModel,
  type CodingReportModel,
  type CodingUsageModel,
  type CodingReviewCardModel,
  type CodingUiModel,
  type CodingUiHostModel,
  type CodingUiPrimitives,
  type CodingUiSurface,
} from "./ui.js";
export {
  CODING_ARTIFACT_TYPES,
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
  CODING_GOAL_CONTEXT_TYPE,
  CODING_PLAN_TYPE,
  inspectDiagram,
  type CodingArtifactType,
  type CodingChangeScope,
  type CodingChangeSet,
  type CodingDiagram,
  type CodingDiagramEdge,
  type CodingDiagramNode,
  type CodingFileChange,
  type CodingFileChangeKind,
  type CodingReport,
} from "./artifacts.js";
export {
  filterSessions,
  groupByGoal,
  needsYou,
  toolAvailability,
  type CodingDirectoryFilter,
  type CodingSessionEntry,
  type CodingSessionGroup,
  type CodingSessionState,
  type CodingToolAvailability,
  type CodingToolInput,
  type CodingToolPage,
} from "./projection.js";
export {
  CodingSessionStore,
  CODING_ACTIVE_STATES,
  toDirectoryEntries,
  type CodingBackgroundSession,
  type CodingBeforeEffect,
  type CodingSessionRecord,
  type CodingWriteGuard,
  type CreateCodingSessionInput,
} from "./store.js";
export {
  CODING_BUILDER_ROLE,
  CODING_COORDINATOR_ROLE,
  CODING_READER_ROLE,
  CODING_PLANNER_ROLE,
  CODING_REVIEWER_ROLE,
  CODING_ROLE_IDS,
  CODING_WRITERS_ROLE,
  CODING_WRITER_ROLE,
  codingAgentManifest,
  codingPrompts,
  type CodingRoleId,
} from "./roles.js";
export { createCodingPlugin, type CodingPluginPorts } from "./plugin.js";
export { knowledgeCatalogMaterial, withKnowledgeTools } from "./knowledge-tools.js";
export { CODING_ACTIONS, codingRouteActions } from "./route-actions.js";
export { runControl } from "./run-inputs.js";
export { reaskMaterial as codingReaskMaterial, codingReaskErrors } from "./reask.js";
export type { CodingExecution } from "./routes.js";
export type { CodingModelChoice } from "./models.js";
export { codingSessionTitleFrom, DEFAULT_SESSION_TITLE, planContinuesAfterTalk } from "./routes.js";
export {
  projectMcp,
  projectSkills,
  type CodingMcpView,
  type CodingSkillsView,
  type McpProjectionInput,
  type McpServerRow,
  type McpToolRow,
  type SelectionFrame,
  type SkillRow,
  type SkillsProjectionInput,
} from "./selection.js";
export {
  projectCheckpoints,
  projectSubagents,
  type ChildAcceptance,
  type CheckpointRow,
  type CheckpointsPhase,
  type CheckpointsProjectionInput,
  type CodingCheckpointsView,
  type CodingSubagentsView,
  type SubagentRow,
  type SubagentsProjectionInput,
} from "./delegation.js";
export {
  CODING_FILE_CHANGED_EVENT,
  CODING_PREFERENCE_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  codingEventTypes,
  parseCodingPreference,
  parseCodingFileChanged,
  parseCodingWorkspaceInvalidated,
  type CodingFileChanged,
  type CodingPreference,
  type CodingWorkspaceInvalidated,
} from "./events.js";
export {
  projectRecovery,
  type CodingRecoveryView,
  type RecoverableRun,
  type RecoveryGap,
  type RecoveryPhase,
  type RecoveryProjectionInput,
} from "./recovery.js";
export {
  projectWriterChanges,
  projectWriters,
  type ChangesProjectionInput,
  type CodingWritersView,
  type WriterAssignment,
  type WriterChangesView,
  type WriterFileChange,
  type WriterSlot,
  type WritersProjectionInput,
} from "./writers.js";
export { createCodingTimeline, type TimelineActivity, type TimelineRun } from "./timeline.js";
export { codingTimelineWords } from "./timeline-words.js";
export { createCodingTurnChanges } from "./turn-changes-client.js";
export { codingQuestionAnswered } from "./question-answered-client.js";

export { CODING_STYLES } from "./styles.js";
export { CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "./workbench-client.js";
export { CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "./taskboard-client.js";
export { CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT } from "./plan-progress-client.js";
export { CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT } from "./input-receipts-client.js";
export { CODING_STEPS_CLIENT_FACTORY_SCRIPT } from "./steps-client.js";
export type { CodingCharacterChoice } from "./characters.js";

export { codingMethods } from "./methods.js";

export { CODING_SETTINGS_CLIENT_SCRIPT } from "./settings-client.js";

export { CODING_PROJECT_DATABASE } from "./database.js";
