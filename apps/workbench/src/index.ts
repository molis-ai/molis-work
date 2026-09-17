export { createWorkbenchDecisionCenterRenderer, type WorkbenchDecisionGroup } from "./decision-center.js";

export { decisionTypeCounts } from "@molis-ai/molis-work-plugin-goals";

export { buildDecisionGroups, pendingDecisionCount, decisionGroupCount, goalTreeProposalNeedsDecision, createGoalsDecisionResults, type GoalsDecisionGroup, type GoalsDecisionEvent } from "@molis-ai/molis-work-plugin-goals";

export { allGoalViews, findGoalView } from "@molis-ai/molis-work-plugin-goals";

export { createWorkbenchGoalsPageRenderer } from "./goals-page-renderer.js";

export { renderWorkbenchPlanningRequest } from "./goals-planning-request.js";

export type { WorkbenchPlanningPageOwners } from "./goals-planning-request.js";

export type { WorkbenchGoalsPageView, WorkbenchGoalsPageOwners } from "./goals-page-renderer.js";

export type { ArtifactWorkbenchRequest } from "./artifact-ui.js";

export { ARTIFACT_EMBED_STYLES } from "./artifact-ui.js";

export type { ArtifactBrowserUiModel } from "@molis-ai/molis-work-plugin-artifacts";

export { PROJECT_OPERATIONS_STYLES, PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-work";

export type { ProjectOperationsProject, ProjectOperationsData, ProjectOperationsSlice, ProjectSessionRecord, ProjectWorkspaceRecord } from "@molis-ai/molis-work-plugin-work";

export { createGoalActionPresenter, createGoalStateExplainer, GOAL_DISPLAY_STATUSES, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";

export { PLANNING_SETTINGS_STYLES, type GoalsPlanningPrimitives } from "@molis-ai/molis-work-plugin-goals";

export { matchGoalsPlanningRoute } from "@molis-ai/molis-work-plugin-goals";

export { resolveGoalsReadRoute, resolveGoalsPageRoute, type GoalDocumentCollection } from "@molis-ai/molis-work-plugin-goals";

export { buildGoalsNavigationItems } from "@molis-ai/molis-work-plugin-goals";

export { buildGoalCollectionModel } from "@molis-ai/molis-work-plugin-goals";

export { createWorkbenchGoalsFragmentRenderer, type GoalsFragmentRenderers } from "./goals-fragment-renderer.js";

export { renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsReadRequest, renderWorkbenchGoalsPageRequest,
  type GoalsReadRenderers, type WorkbenchGoalPageSelection } from "./goals-document-routes.js";

export { visibleGoalStatus, partOfChildViews, activeOutgoingDependsOn, goalWorkSatisfied, displayedPassedCriterionIds, isBlockedWorkStatus, firstBlockedDescendant, unsatisfiedOutgoingDependencies, goalTreeReferenceLabel, goalTreeReferenceLabels } from "@molis-ai/molis-work-plugin-goals";

export { GOALS_RELATION_LABELS } from "@molis-ai/molis-work-plugin-goals";

export { goalRiskStateEffect, RISK_STATE_LABELS, RISK_TREATMENT_LABELS, GOAL_TREE_STATUS_ORDER, sortGoalTreeItems, type GoalsSafetyRisk } from "@molis-ai/molis-work-plugin-goals";

export { mergeGoalPolicyFormValues, type GoalsPolicyBinding, type GoalsPolicyItem } from "@molis-ai/molis-work-plugin-goals";

export { isProjectReference } from "@molis-ai/molis-work-plugin-artifacts";


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
    "workbench.goals-command-adapter.v1",
    "workbench.work-composition.v1", "workbench.goals-policy-composition.v1", "workbench.goals-safety-composition.v1", "workbench.goals-relation-composition.v1", "workbench.goals-tree-composition.v1", "workbench.goals-momentum-composition.v1", "workbench.goals-document-composition.v1", "workbench.goals-context-composition.v1", "workbench.goals-planning-composition.v1", "workbench.goals-status-composition.v1", "workbench.goals-factors-composition.v1", "workbench.goals-dialogs-composition.v1", "workbench.goals-document-routes.v1",
  ],
} as const;


export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { explainGoalDecision, createGoalsDecisionPresentation, type DecisionEventKind } from "@molis-ai/molis-work-plugin-goals";


export { createWorkbenchOnboardingRenderer, type MolisWorkOnboardingRenderOptions, type OnboardingRenderPrimitives } from "./onboarding-renderer.js";

export { ONBOARDING_INTENT_FRAMES, onboardingIntentFrame, onboardingIntentFrameDefinition, onboardingPlanningHint, type OnboardingIntentFrame } from "./onboarding-intent.js";

export { TRASH_GOAL_STYLES } from "@molis-ai/molis-work-plugin-goals";


export { createWorkbenchSettingsNavigation, type WebProjectNavigation, type WebSettingsSection, type SettingsNavigationPrimitives } from "./settings-navigation.js";
export { isProjectSettingsWorkbenchPath, projectSettingsPageFromPath, projectSettingsPath } from "./project-settings-stage.js";

export { createWorkbenchProjectDirectoryRenderer, type ProjectDirectoryPrimitives } from "./project-directory-renderer.js";


export { GOALS_PRESENTATION_STATES, type GoalsDocumentView, type GoalsCoverageItem, type GoalsInputBinding } from "@molis-ai/molis-work-plugin-goals";

export { createWorkbenchHumanReviewRenderer, type HumanReviewPrimitives } from "./human-review-renderer.js";




export type { WebSettingsProject, WebInstallationDiagnostics, MolisWorkSettingsView } from "./settings-view.js";

export { createWorkbenchSettingsRenderer, type SettingsRenderPrimitives } from "./settings-renderer.js";


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
