import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
export { countGoalDecisions } from "@molis-ai/molis-work-plugin-goals";
export type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
export type { WebSettingsProject, WebInstallationDiagnostics, MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";

export { type GoalPresentationState as WebGoalStatus, GOALS_PRESENTATION_STATES as WEB_GOAL_STATUSES, type GoalsCoverageItem as WebCoverageItem, type GoalsInputBinding as WebInputBinding, type GoalsPolicyBinding as WebPolicyBinding, type GoalsDecisionEvent as WebEventRecord, type GoalsSafetyRisk as WebRiskRecord, type GoalsDocumentView as WebGoalView } from "@molis-ai/molis-work-app-workbench";
export { WORK_TAB_VISIBILITY_CLIENT_SCRIPT } from "@molis-ai/molis-work-app-workbench";
export type { WebProjectNavigation, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
export { GOAL_TREE_STATUS_ORDER, sortGoalTreeItems } from "@molis-ai/molis-work-app-workbench";
export {
  activeOutgoingDependsOn, goalWorkSatisfied, displayedPassedCriterionIds, isBlockedWorkStatus,
  firstBlockedDescendant, unsatisfiedOutgoingDependencies, goalTreeReferenceLabel, goalTreeReferenceLabels,
} from "@molis-ai/molis-work-app-workbench";
export type { GoalDocumentCollection } from "@molis-ai/molis-work-app-workbench";
export type { MolisWorkOnboardingRenderOptions } from "@molis-ai/molis-work-app-workbench";

export const { renderMolisWorkProjectIndex, renderMolisWorkSettings, renderDecisionCenter, renderPersistedFeedItemDetail, renderFeedWorkbenchFragment, renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderMolisWorkOnboarding, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings, renderMolisWorkWorkbenchStylesheet, renderMolisWorkOnboardingStylesheet, renderMolisWorkProjectIndexStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWeb, renderMolisWorkRefreshFragment } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
