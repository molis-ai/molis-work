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
import { BUILTIN_PLUGIN_CATALOG, pluginOnDemandStylesheet, renderWorkbenchRefreshDocument, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
export type { MolisWorkOnboardingRenderOptions } from "@molis-ai/molis-work-app-workbench";

const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
export const { renderMolisWorkProjectIndex, renderMolisWorkSettings, renderPersistedFeedItemDetail, renderFeedWorkbenchFragment, renderMolisWorkOnboarding, renderMolisWorkProjectSettingsHub, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings, renderMolisWorkWorkbenchStylesheet, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript } = renderer;

/** The workbench sheet and the sheets the plugins bring themselves (PG-070): the rules a page with every plugin frame loaded has. */
export const renderMolisWorkWorkbenchWithPluginStylesheets = (): string => renderMolisWorkWorkbenchStylesheet()
  + BUILTIN_PLUGIN_CATALOG.map((entry) => pluginOnDemandStylesheet(entry.project_plugin_id) ?? "").join("");

/** Existing fixtures supply the owner-read collection; production obtains it through the declared stage action. */
export function renderMolisWorkWeb(view: MolisWorkWebView, goalId?: string, archive = false, trash = false, token = "", desktop = false, cli: Record<string, boolean> = {}): string {
  const selection = trash ? "trash" : archive ? "archive" : "current";
  return renderer.renderMolisWorkWeb({ ...view, page_owner: "io.molis.work.goals", cli_availability: cli,
    stage_request: { ...view.stage_request, goals: { collection: selection, ...(goalId ? { goal_id: goalId } : {}) } },
    stage_data: { ...view.stage_data, goals: { collection: view, selection, selected: null } },
  }, token, desktop);
}
function fragment(surface: string, view: MolisWorkWebView, goalId: string | undefined, selection: "current" | "archive" | "trash"): string {
  return renderer.declaredPageSurface("io.molis.work.goals", surface, view, { collection: view, selection, selected: null }, goalId ? { goal_id: goalId } : {});
}
export const renderMolisWorkRefreshFragment = (view: MolisWorkWebView, goalId?: string, archive = false, trash = false) => {
  const selection = trash ? "trash" : archive ? "archive" : "current";
  return renderWorkbenchRefreshDocument({ body_html: fragment("board-refresh", view, goalId, selection), body_attributes: { "data-board-view": selection } });
};
export const renderGoalDocumentFragment = (view: MolisWorkWebView, goalId: string, collection: "current" | "archive" | "trash" = "current") => fragment("goal-document", view, goalId, collection) || null;
export const renderMolisWorkMomentumFragment = (view: MolisWorkWebView, goalId: string, collection: "current" | "archive" = "current") => fragment("board-momentum", view, goalId, collection) || null;
