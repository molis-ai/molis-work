import { goalsActions, type GoalsDocumentCollectionView } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication, FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import { currentLocale } from "./web-locale.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { scheduleServiceFor, scheduleViewFingerprint } from "./schedule-runtime.js";
import { createScheduleRouteHandlerPorts } from "@molis-ai/molis-work-plugin-schedule";

export interface WebViewOptions {
  databasePath: string; boardId: string; demo?: boolean; projectRoot?: string;
  project?: WebProjectNavigation | null; projects?: WebProjectNavigation[]; routePrefix?: string;
  homeDirectory?: string;
}

interface MolisWorkWebViewCacheEntry {
  cursor: number;
  optionsFingerprint: string;
  view: MolisWorkWebView;
}

export type MolisWorkWebViewCache = Map<string, MolisWorkWebViewCacheEntry>;

function feedDirectorySnapshot(feed: FeedApplication, boardId: string): FeedSnapshot {
  const snapshot = feed.snapshot(boardId);
  const hideBodies = (item: FeedSnapshot["feed_items"][number]) => ({
    ...item,
    body: null,
    materials: item.materials.map((material) => ({ ...material, content: undefined })),
  });
  // Current judgments are decorated through the authorized Inbox/Feed actions after the cached base is read.
  return { ...snapshot,
    inbox_entries: snapshot.inbox_entries.map(entry => ({ ...entry, next_judgment: null, suggested_behavior_ids: [] })),
    feed_items: snapshot.feed_items.map(item => ({ ...hideBodies(item), suggested_behavior_ids: [] })),
  };
}

function scheduleProjection(db: LocalProjectDatabase["db"]): Pick<MolisWorkWebView, "schedule_jobs" | "schedule_tasks"> {
  const ports = createScheduleRouteHandlerPorts({ db, schedule: scheduleServiceFor(db) });
  return {
    schedule_jobs: ports.listJobs(),
    schedule_tasks: ports.listTasks(),
  };
}

export function buildMolisWorkWebView(store: LocalProjectDatabase, collection: GoalsDocumentCollectionView, options: WebViewOptions): MolisWorkWebView {
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
    feed_source_catalog: listFeedSourceCatalog(),
    feed_connector_auth: createLocalFeedConnectorService(store.db, options.boardId).authStatus(),
    ...scheduleProjection(store.db),
  };
}

export async function cachedMolisWorkWebView(
  cache: MolisWorkWebViewCache,
  store: LocalProjectDatabase,
  options: WebViewOptions,
  actions: BoundActionClient,
): Promise<MolisWorkWebView> {
  // Always authorize through the shared service before reusing any cached content.
  const collection = await actions.invoke(goalsActions.collection, {});
  const cursor = collection.snapshot.cursor;
  const optionsFingerprint = JSON.stringify({
    board_id: options.boardId,
    locale: currentLocale(),
    demo: Boolean(options.demo),
    project_root: options.projectRoot ?? "",
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
    schedule: scheduleViewFingerprint(store.db),
    home_directory: options.homeDirectory ?? "",
  });
  const cached = cache.get(options.databasePath);
  if (
    cached?.cursor === cursor &&
    cached.optionsFingerprint === optionsFingerprint
  ) return cached.view;
  const view = buildMolisWorkWebView(store, collection, options);
  cache.set(options.databasePath, {
    cursor,
    optionsFingerprint,
    view,
  });
  return view;
}

export async function withSelectedEventDocument(
  view: MolisWorkWebView,
  goalId: string | undefined,
  actions: BoundActionClient,
): Promise<MolisWorkWebView> {
  if (!goalId || ![...view.goals, ...view.archived_goals, ...view.trashed_goals].some(item => item.goal.goal_id === goalId)) return view;
  const eventDocument = await actions.invoke(goalsActions.document, { goal_id: goalId });
  const decorate = (item: MolisWorkWebView["goals"][number]) =>
    item.goal.goal_id === goalId ? { ...item, event_document: eventDocument } : item;
  return { ...view, goals: view.goals.map(decorate), archived_goals: view.archived_goals.map(decorate), trashed_goals: view.trashed_goals.map(decorate) };
}
