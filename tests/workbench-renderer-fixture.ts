import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import { buildFeedReaderUiModel, feedUiContribution, feedSourcePresentationId, FEED_UI_CONTRIBUTION_ID, type FeedItemRecord, type FeedSnapshot, type FeedStageData } from "@molis-ai/molis-work-plugin-feed";
import { gmailSourcePresentation } from "@molis-ai/molis-work-integration-gmail";
import { rssSourcePresentation } from "@molis-ai/molis-work-integration-rss";
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
import { BUILTIN_PLUGIN_CATALOG, pluginOnDemandStylesheet, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
export type { MolisWorkOnboardingRenderOptions } from "@molis-ai/molis-work-app-workbench";

const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
export const { renderMolisWorkProjectIndex, renderMolisWorkSettings, renderMolisWorkOnboarding, renderMolisWorkProjectSettingsHub, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings, renderMolisWorkWorkbenchStylesheet, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript } = renderer;

/** Legacy test fixtures supply facts directly; only the owners convert these into UI models or HTML. */
function ownerStageFacts(view: MolisWorkWebView & { feed?: FeedSnapshot; feed_source_catalog?: FeedStageData["source_catalog"]; feed_connector_auth?: FeedStageData["connector_auth"] }): MolisWorkWebView {
  const facts = view.feed ?? { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] };
  const { inbox_entries, ...snapshot } = facts;
  const feed: FeedStageData = { snapshot, inbox_entries, source_catalog: view.feed_source_catalog ?? [],
    connector_auth: view.feed_connector_auth ?? { github: { bound: false }, gmail: { bound: false } },
    source_presentations: Object.fromEntries(facts.sources.flatMap(source => {
      const id = feedSourcePresentationId(source);
      return id ? [[source.source_id, id === "rss-http" ? rssSourcePresentation({ cursor: source.cursor }) : gmailSourcePresentation()]] : [];
    })) };
  const subjects = inbox_entries.map(entry => {
    const record = entry.subject_type === "feed_item" ? facts.feed_items.find(item => item.item_id === entry.subject_id)
      : entry.subject_type === "source_fault" ? facts.sources.find(source => source.source_id === entry.subject_id)
      : [...view.goals, ...view.archived_goals, ...view.trashed_goals].find(goal => goal.goal.goal_id === entry.subject_id)?.goal;
    return { entry_id: entry.entry_id, title: record ? "title" in record ? record.title : record.name : null,
      source_label: record && "source_label" in record ? record.source_label || record.source_kind : record && "name" in record ? record.name : null };
  });
  return { ...view, stage_data: { feed, inbox: { entries: inbox_entries, subjects, judgments: inbox_entries.flatMap(entry => entry.next_judgment ? [entry.next_judgment] : []), judgment: view.inbox_judgment }, ...view.stage_data } };
}

export function renderPersistedFeedItemDetail(item: FeedItemRecord, routePrefix = "") {
  const stage = renderer.stageFragmentModel("feed", { route_prefix: routePrefix, shown_plugins: ["feed"], project: null, demo: false },
    { item, inbox_active: false, promote_available: true }, { id: item.item_id, surface: "persisted-detail" });
  return feedUiContribution.render({ contribution_id: FEED_UI_CONTRIBUTION_ID, surface: "persisted-detail", model: buildFeedReaderUiModel(stage) });
}
export const renderFeedWorkbenchFragment = (view: MolisWorkWebView) => {
  const ready = ownerStageFacts(view);
  return renderer.declaredPageSurface("feed", "workbench-fragment", ready, ready.stage_data!.feed);
};

/** The workbench sheet and the sheets the plugins bring themselves (PG-070): the rules a page with every plugin frame loaded has. */
export const renderMolisWorkWorkbenchWithPluginStylesheets = (): string => renderMolisWorkWorkbenchStylesheet()
  + BUILTIN_PLUGIN_CATALOG.map((entry) => pluginOnDemandStylesheet(entry.project_plugin_id) ?? "").join("");

/** Existing fixtures supply the owner-read collection; production obtains it through the declared stage action. */
export function renderMolisWorkWeb(view: MolisWorkWebView, goalId?: string, archive = false, trash = false, token = "", desktop = false, cli: Record<string, boolean> = {}): string {
  view = ownerStageFacts(view);
  const selection = trash ? "trash" : archive ? "archive" : "current";
  return renderer.renderMolisWorkWeb({ ...view, page_owner: "io.molis.work.goals", cli_availability: cli,
    stage_request: { ...view.stage_request, goals: { collection: selection, ...(goalId ? { goal_id: goalId } : {}) } },
    stage_data: { ...view.stage_data, goals: { collection: view, selection, selected: null } },
  }, token, desktop);
}
function fragment(surface: string, view: MolisWorkWebView, goalId: string | undefined, selection: "current" | "archive" | "trash"): string {
  return renderer.declaredPageSurface("io.molis.work.goals", surface, view, { collection: view, selection, selected: null }, goalId ? { goal_id: goalId } : {});
}
export const renderMolisWorkRefreshFragment = (view: MolisWorkWebView, goalId?: string, archive = false, trash = false) => fragment("board-refresh", view, goalId, trash ? "trash" : archive ? "archive" : "current");
export const renderGoalDocumentFragment = (view: MolisWorkWebView, goalId: string, collection: "current" | "archive" | "trash" = "current") => fragment("goal-document", view, goalId, collection) || null;
export const renderMolisWorkMomentumFragment = (view: MolisWorkWebView, goalId: string, collection: "current" | "archive" = "current") => fragment("board-momentum", view, goalId, collection) || null;
