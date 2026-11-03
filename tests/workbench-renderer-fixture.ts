import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
export { countGoalDecisions } from "@molis-ai/molis-work-plugin-goals";
export type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
export type { WebSettingsProject, WebInstallationDiagnostics, MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";

export { type GoalPresentationState as WebGoalStatus, GOALS_PRESENTATION_STATES as WEB_GOAL_STATUSES, type GoalsInputBinding as WebInputBinding, type GoalsPolicyBinding as WebPolicyBinding, type GoalsDecisionEvent as WebEventRecord, type GoalsDocumentView as WebGoalView } from "@molis-ai/molis-work-plugin-goals";
export type { WebProjectNavigation, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
export { GOAL_TREE_STATUS_ORDER, sortGoalTreeItems } from "@molis-ai/molis-work-plugin-goals";
export {
  activeOutgoingDependsOn, goalWorkSatisfied, displayedPassedCriterionIds, isBlockedWorkStatus,
  firstBlockedDescendant, unsatisfiedOutgoingDependencies, goalTreeReferenceLabel, goalTreeReferenceLabels,
} from "@molis-ai/molis-work-plugin-goals";
export type { GoalDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import { BUILTIN_PLUGIN_CATALOG, pluginOnDemandStylesheet } from "@molis-ai/molis-work-app-workbench";
export type { MolisWorkOnboardingRenderOptions } from "@molis-ai/molis-work-app-workbench";

export const { renderMolisWorkProjectIndex, renderMolisWorkSettings, renderPersistedFeedItemDetail, renderFeedWorkbenchFragment, renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderMolisWorkOnboarding, renderMolisWorkProjectSettingsHub, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings, renderMolisWorkWorkbenchStylesheet, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWeb, renderMolisWorkRefreshFragment } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);

/** The workbench sheet and the sheets the plugins bring themselves (PG-070): the rules a page with every plugin frame loaded has. */
export const renderMolisWorkWorkbenchWithPluginStylesheets = (): string => renderMolisWorkWorkbenchStylesheet()
  + BUILTIN_PLUGIN_CATALOG.map((entry) => pluginOnDemandStylesheet(entry.project_plugin_id) ?? "").join("");
