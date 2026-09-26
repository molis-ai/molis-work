export { createWorkbenchDecisionCenterRenderer, type WorkbenchDecisionGroup } from "./decision-center.js";
export { renderPluginPageWorkspace } from './plugin-page-workspace.js';
export { createWorkbenchGoalsPageRenderer } from "./goals-page-renderer.js";
export { renderWorkbenchPlanningRequest } from "./goals-planning-request.js";
export type { WorkbenchPlanningPageOwners } from "./goals-planning-request.js";
export type { WorkbenchGoalsPageView, WorkbenchGoalsPageOwners } from "./goals-page-renderer.js";
export type { ArtifactWorkbenchRequest, ArtifactImportWorkbenchRequest } from "./artifact-ui.js";
export { ARTIFACT_EMBED_STYLES } from "./artifact-ui.js";
export type { ArtifactBrowserUiModel } from "@molis-ai/molis-work-plugin-artifacts";
export { isProjectReference } from "@molis-ai/molis-work-plugin-artifacts";
export { PROJECT_OPERATIONS_STYLES, PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-work";
export type { ProjectOperationsProject, ProjectOperationsData, ProjectOperationsSlice, ProjectSessionRecord, ProjectWorkspaceRecord } from "@molis-ai/molis-work-plugin-work";
export {
  activeOutgoingDependsOn,
  allGoalViews,
  buildDecisionGroups,
  buildGoalCollectionModel,
  buildGoalsNavigationItems,
  createGoalActionPresenter,
  createGoalStateExplainer,
  createGoalsDecisionPresentation,
  createGoalsDecisionResults,
  decisionGroupCount,
  decisionTypeCounts,
  displayedPassedCriterionIds,
  explainGoalDecision,
  findGoalView,
  firstBlockedDescendant,
  GOAL_DISPLAY_STATUSES,
  GOAL_TREE_STATUS_ORDER,
  GOALS_PRESENTATION_STATES,
  GOALS_RELATION_LABELS,
  goalRiskStateEffect,
  goalTreeProposalNeedsDecision,
  goalTreeReferenceLabel,
  goalTreeReferenceLabels,
  goalWorkSatisfied,
  isBlockedWorkStatus,
  matchGoalsPlanningRoute,
  mergeGoalPolicyFormValues,
  partOfChildViews,
  pendingDecisionCount,
  PLANNING_SETTINGS_STYLES,
  resolveGoalsPageRoute,
  resolveGoalsReadRoute,
  RISK_STATE_LABELS,
  RISK_TREATMENT_LABELS,
  sortGoalTreeItems,
  TRASH_GOAL_STYLES,
  unsatisfiedOutgoingDependencies,
  visibleGoalStatus,
  type DecisionEventKind,
  type GoalDocumentCollection,
  type GoalPresentationState,
  type GoalsCoverageItem,
  type GoalsDecisionEvent,
  type GoalsDecisionGroup,
  type GoalsDocumentView,
  type GoalsInputBinding,
  type GoalsPlanningPrimitives,
  type GoalsPolicyBinding,
  type GoalsPolicyItem,
  type GoalsSafetyRisk,
} from "@molis-ai/molis-work-plugin-goals";
export { createWorkbenchGoalsFragmentRenderer, type GoalsFragmentRenderers } from "./goals-fragment-renderer.js";
export {
  renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsReadRequest, renderWorkbenchGoalsPageRequest,
  type GoalsReadRenderers, type WorkbenchGoalPageSelection,
} from "./goals-document-routes.js";
export {
  CLIENT_SCRIPT,
  CONTROL_CLIENT_SCRIPT,
  MORE_STYLES,
  ONBOARDING_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_CLIENT_SCRIPT,
  PROJECT_GUIDANCE_SETTINGS_STYLES,
  PROJECT_INDEX_CLIENT_SCRIPT,
  PROJECT_INDEX_STYLES,
  PROJECT_RULES_CLIENT_SCRIPT,
  PROJECT_RULES_SETTINGS_STYLES,
  RESPONSIVE_STYLES,
  SETTINGS_CLIENT_SCRIPT,
  SETTINGS_STYLES,
  STYLES,
  WORK_TAB_VISIBILITY_CLIENT_SCRIPT,
} from "./browser-assets.js";
export { EN } from "./i18n/en.js";
export {
  EXECUTION_EVIDENCE_KIND_LABELS,
  EXECUTION_EVIDENCE_RESULT_LABELS,
} from "./human-review-renderer.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-workbench",
  packagePath: "apps/workbench",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd4", "goal-reorg-ap3", "goal-reorg-gw4", "goal-reorg-gw5", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "workbench.shell.v1",
    "workbench.ui-slots.v1",
    "workbench.feed-composition.v1",
    "workbench.work-composition.v1", "workbench.goals-policy-composition.v1", "workbench.goals-safety-composition.v1", "workbench.goals-relation-composition.v1", "workbench.goals-tree-composition.v1", "workbench.goals-momentum-composition.v1", "workbench.goals-document-composition.v1", "workbench.goals-context-composition.v1", "workbench.goals-planning-composition.v1", "workbench.goals-status-composition.v1", "workbench.goals-factors-composition.v1", "workbench.goals-dialogs-composition.v1", "workbench.goals-document-routes.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { createWorkbenchOnboardingRenderer, type MolisWorkOnboardingRenderOptions, type OnboardingRenderPrimitives } from "./onboarding-renderer.js";
export { ONBOARDING_INTENT_FRAMES, onboardingIntentFrame, onboardingIntentFrameDefinition, onboardingPlanningHint, type OnboardingIntentFrame } from "./onboarding-intent.js";
export { createWorkbenchSettingsNavigation, type WebProjectNavigation, type WebSettingsSection, type SettingsNavigationPrimitives } from "./settings-navigation.js";
export { listPluginSettingsNavItems, findPluginSettingsNavItem, pluginSettingsNavItemsFrom, isHostGlobalSettingsSection } from "./plugin-settings-catalog.js";
export { isProjectSettingsWorkbenchPath, projectSettingsPageFromPath, projectSettingsPath } from "./project-settings-stage.js";
export { createWorkbenchProjectDirectoryRenderer, type ProjectDirectoryPrimitives } from "./project-directory-renderer.js";
export { createWorkbenchHumanReviewRenderer, type HumanReviewPrimitives } from "./human-review-renderer.js";
export type { WebSettingsProject, WebInstallationDiagnostics, MolisWorkSettingsView } from "./settings-view.js";
export { createWorkbenchSettingsRenderer, type SettingsRenderPrimitives } from "./settings-renderer.js";
export type { CapabilitiesView, CapabilitySection } from "./capabilities.js";
export { renderMcpAccess, renderMcpAccessRows, mcpAccessEntryKey, type McpAccessModel, type McpAccessEntry } from "./mcp-access.js";
export type { MolisWorkWebView } from "./page-view.js";
export * from "./i18n.js";
export * from "./ui-composition.js";
export { createWorkbenchFeedProjectionRenderer, type FeedSupplementalEntry } from "./feed-projection-ui.js";
export { createWorkbenchFocusSections, type FocusSectionCardOptions } from "./focus-sections.js";
export { createWorkbenchProjectSettingsPages, type ProjectSettingsPagePorts } from "./project-settings-pages.js";
export type { ProjectSettingsFoldId } from "./project-settings-folds.js";
export { createWorkbenchRenderer, type WorkbenchRendererPorts, type WorkbenchRenderer } from "./renderer.js";
export { renderMolisWorkPrimitiveCatalog } from "./primitive-catalog.js";
export { createCapsuleWorkbench, type CapsuleRendererPorts } from "./capsule.js";
export type * from "./capsule-view.js";
export { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG, BUILTIN_PLUGIN_REGISTRY, DIRECT_WORK_SURFACE_IDS, OWN_DIRECTORY_SURFACES, PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, manifestFor, pluginMarketCards, pluginTabGlyphs, pluginTabTitles, islandEntries, railEntries, settingsEntries } from "./plugin-catalog.js";
export type { BuiltinPluginEntry, PluginMarketCard, RailEntry } from "./plugin-catalog.js";
export {
  isDecidable,
  leakedMarkup,
  renderAgentReviewSurface,
  renderAgentReviewRecovery,
  reviewPhase,
  type AgentReviewPhase,
  type AgentReviewPrimitives,
  type AgentReviewRow,
  type AgentReviewSurfaceModel,
} from "./agent-review-surface.js";
export {
  formatContext,
  renderModelSettingsDocument,
  type ModelSettingsModel,
  type ModelSettingsPrimitives,
} from "./settings-models.js";
export { BUILTIN_PLUGIN_AGENTS } from "./plugin-catalog.js";
