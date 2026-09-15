import { attachEventDocument, buildGoalsDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { FeedApplication, FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import type { GoalProjectApplication } from "./goal-project-application.js";
import { currentLocale, L } from "./web-locale.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { detectRelayImport } from "./relay-import.js";
import { listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";

export interface WebViewOptions {
  databasePath: string; boardId: string; demo?: boolean; projectRoot?: string;
  project?: WebProjectNavigation | null; projects?: WebProjectNavigation[]; routePrefix?: string;
}

interface MolisWorkWebViewCacheEntry {
  cursor: number;
  optionsFingerprint: string;
  view: MolisWorkWebView;
}

export type MolisWorkWebViewCache = Map<string, MolisWorkWebViewCacheEntry>;

function feedDirectorySnapshot(feed: FeedApplication, boardId: string): FeedSnapshot {
  const snapshot = feed.snapshot(boardId);
  return {
    ...snapshot,
    feed_items: snapshot.feed_items.map((item) => ({
      ...item,
      body: null,
      materials: item.materials.map((material) => ({ ...material, content: undefined })),
    })),
  };
}

export function buildMolisWorkWebView(store: LocalProjectDatabase, coordinator: GoalProjectApplication, options: WebViewOptions): MolisWorkWebView {
  coordinator.goalDecisionAttention.reconcile(options.boardId);
  const collection = buildGoalsDocumentCollection({
    snapshot: boardId => store.snapshot(boardId), events: boardId => store.readEventsDescending(boardId),
    goals: coordinator.goalQueries, inputs: coordinator.goalInputs,
    projectGoalLifecycle: (snapshot, goalId) => coordinator.projectGoalLifecycle(snapshot, goalId),
    eventWork: coordinator.goalEvents,
  }, options.boardId, L);
  return {
    snapshot: options.project
      ? { ...collection.snapshot, board: { ...collection.snapshot.board, board_id: "" } }
      : collection.snapshot,
    project: options.project ?? null, projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "", demo: Boolean(options.demo),
    active_goal_id: collection.active_goal_id, goals: collection.goals,
    archived_goals: collection.archived_goals, trashed_goals: collection.trashed_goals,
    counts: collection.counts, coverage: collection.coverage, input_bindings: collection.input_bindings,
    policy_bindings: collection.policy_bindings, events: collection.events,
    feed: feedDirectorySnapshot(createLocalFeedApplication(store.db), options.boardId),
    relay_import: detectRelayImport(), feed_source_catalog: listFeedSourceCatalog(),
    feed_connector_auth: createLocalFeedConnectorService(store.db, options.boardId).authStatus(),
  };
}

export function cachedMolisWorkWebView(
  cache: MolisWorkWebViewCache,
  store: LocalProjectDatabase,
  coordinator: GoalProjectApplication,
  options: WebViewOptions,
): MolisWorkWebView {
  const cursor = store.eventCursor(options.boardId);
  const optionsFingerprint = JSON.stringify({
    board_id: options.boardId,
    locale: currentLocale(),
    demo: Boolean(options.demo),
    project_root: options.projectRoot ?? "",
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
  });
  const cached = cache.get(options.databasePath);
  if (
    cached?.cursor === cursor &&
    cached.optionsFingerprint === optionsFingerprint
  ) return cached.view;
  const view = buildMolisWorkWebView(store, coordinator, options);
  cache.set(options.databasePath, {
    cursor: store.eventCursor(options.boardId),
    optionsFingerprint,
    view,
  });
  return view;
}

export function withSelectedEventDocument(
  view: MolisWorkWebView,
  boardId: string,
  goalId: string | undefined,
  goalEvents: Parameters<typeof attachEventDocument>[2],
  planningMethods: readonly PlanningMethodPack[] = [],
): MolisWorkWebView {
  if (!goalId) return view;
  const methods = planningMethods.length ? planningMethods : view.snapshot.planning_method_packs ?? [];
  const decorate = (item: MolisWorkWebView["goals"][number]) =>
    item.goal.goal_id === goalId
      ? attachEventDocument(item, boardId, goalEvents, view.snapshot, methods, view.events ?? [])
      : item;
  return {
    ...view,
    goals: view.goals.map(decorate),
    archived_goals: view.archived_goals.map(decorate),
    trashed_goals: view.trashed_goals.map(decorate),
  };
}
