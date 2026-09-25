import { goalsActions, buildGoalsDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication, FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import type { GoalProjectApplication } from "./goal-project-application.js";
import { currentLocale, L } from "./web-locale.js";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { statSync } from "node:fs";
import { createLocalFeedApplication } from "./feed-application.js";
import { listFeedSourceCatalog } from "./feed-source-service.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import { scheduleServiceFor, scheduleViewFingerprint } from "./schedule-runtime.js";
import { createScheduleRouteHandlerPorts } from "@molis-ai/molis-work-plugin-schedule";
import { readFunctionScenesView, withFunctionsService } from "./functions-host.js";
import {
  FEED_CAPTURE_SCENE_ID,
  HOME_DOCK_SCENE_ID,
  INBOX_NEXT_SCENE_ID,
} from "@molis-ai/molis-work-contracts/modules/functions";

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

function feedDirectorySnapshot(feed: FeedApplication, boardId: string, homeDirectory?: string): FeedSnapshot {
  const snapshot = feed.snapshot(boardId);
  const hideBodies = (item: FeedSnapshot["feed_items"][number]) => ({
    ...item,
    body: null,
    materials: item.materials.map((material) => ({ ...material, content: undefined })),
  });
  if (!homeDirectory) {
    return {
      ...snapshot,
      feed_items: snapshot.feed_items.map(hideBodies),
    };
  }
  return withFunctionsService(homeDirectory, (service) => {
    const suggested = (
      kind: "inbox_entry" | "feed_item",
      id: string,
      sceneId: string,
    ) => service.latestJudgment(kind, id, boardId, sceneId)?.suggested_behavior_ids ?? [];
    return {
      ...snapshot,
      inbox_entries: snapshot.inbox_entries.map((entry) => {
        const binding = service.sceneBinding(INBOX_NEXT_SCENE_ID, boardId);
        const latest = service.latestJudgment("inbox_entry", entry.entry_id, boardId, INBOX_NEXT_SCENE_ID);
        const judgment = binding && latest?.function_key === binding.function_key ? latest : null;
        return { ...entry, next_judgment: judgment,
          suggested_behavior_ids: judgment?.outcome === "ok" ? judgment.suggested_behavior_ids : [],
          home_dock_suggested_behavior_ids: suggested("inbox_entry", entry.entry_id, HOME_DOCK_SCENE_ID) };
      }),
      feed_items: snapshot.feed_items.map((item) => ({
        ...hideBodies(item),
        suggested_behavior_ids: suggested("feed_item", item.item_id, FEED_CAPTURE_SCENE_ID),
        home_dock_suggested_behavior_ids: suggested("feed_item", item.item_id, HOME_DOCK_SCENE_ID),
      })),
    };
  });
}

function scheduleProjection(db: LocalProjectDatabase["db"]): Pick<MolisWorkWebView, "schedule_jobs" | "schedule_tasks"> {
  const ports = createScheduleRouteHandlerPorts({ db, schedule: scheduleServiceFor(db) });
  return {
    schedule_jobs: ports.listJobs(),
    schedule_tasks: ports.listTasks(),
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
    feed: feedDirectorySnapshot(createLocalFeedApplication(store.db), options.boardId, options.homeDirectory),
    feed_source_catalog: listFeedSourceCatalog(),
    feed_connector_auth: createLocalFeedConnectorService(store.db, options.boardId).authStatus(),
    ...scheduleProjection(store.db),
    function_scenes: options.homeDirectory
      ? readFunctionScenesView(options.homeDirectory, options.boardId)
      : undefined,
  };
}

function functionsViewFingerprint(homeDirectory?: string): string {
  if (!homeDirectory) return "";
  try {
    const stat = statSync(homeSqlitePath(homeDirectory, "functions"));
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
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
    schedule: scheduleViewFingerprint(store.db),
    functions: functionsViewFingerprint(options.homeDirectory),
    planning_methods: coordinator.goals.planning.effectiveMethods(options.boardId).map(method => [method.method_id, method.scope, method.version]),
    home_directory: options.homeDirectory ?? "",
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
