import { createLocalFeedApplication, feedConnectorAuthStatus, listFeedSourceCatalog, scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { createScheduleActionPorts, scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { feedQueryActions } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { buildMolisWorkWebView as composeWebView, cachedMolisWorkWebView as readCachedWebView,
  type LocalProjectDatabase, type GoalProjectApplication, type WebViewOptions, type MolisWorkWebViewCache } from "@molis-ai/molis-work-app-local-host";
import { buildGoalsDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

/** Owner-level projection fixture. Actual HTTP authorization is tested through the real Host. */
export function readTestGoalCollection(store: LocalProjectDatabase, app: GoalProjectApplication, projectId: string) {
  return buildGoalsDocumentCollection({ snapshot: id => store.snapshot(id), events: id => store.readEventsDescending(id),
    goals: app.goalQueries, inputs: app.goalInputs, eventWork: app.goalEvents }, projectId);
}
export function buildMolisWorkWebView(store: LocalProjectDatabase, app: GoalProjectApplication,
  options: Omit<WebViewOptions, "databasePath"> & { databasePath?: string }) {
  app.goalDecisionAttention.reconcile(options.projectId);
  const snapshot = createLocalFeedApplication(store.db).snapshot(options.projectId);
  const schedule = createScheduleActionPorts({ db: store.db, schedule: scheduleServiceFor(store.db) });
  return composeWebView(store, readTestGoalCollection(store, app, options.projectId), { databasePath: ":memory:", ...options }, {
    feed: { ...snapshot, feed_items: snapshot.feed_items.map(item => ({ ...item, body: null, materials: item.materials.map(material => ({ ...material, content: undefined })) })) },
    feed_source_catalog: listFeedSourceCatalog(), feed_connector_auth: feedConnectorAuthStatus(options.homeDirectory),
    schedule_jobs: schedule.listJobs(), schedule_tasks: schedule.listTasks(),
  });
}
export function cachedMolisWorkWebView(cache: MolisWorkWebViewCache, store: LocalProjectDatabase, app: GoalProjectApplication, options: WebViewOptions) {
  app.goalDecisionAttention.reconcile(options.projectId);
  const actions: BoundActionClient = { discover: async () => [], invoke: async definition => {
    const view = buildMolisWorkWebView(store, app, options);
    if (definition.capability_id === feedQueryActions.snapshot.capability_id) { const { inbox_entries, ...snapshot } = view.feed; return snapshot as never; }
    if (definition.capability_id === feedQueryActions.connections.capability_id) return view.feed_connector_auth as never;
    if (definition.capability_id === inboxActions.list.capability_id) return { entries: view.feed.inbox_entries } as never;
    if (definition.capability_id === scheduleActions.list.capability_id) return { jobs: view.schedule_jobs, tasks: view.schedule_tasks } as never;
    return readTestGoalCollection(store, app, options.projectId) as never;
  } };
  return readCachedWebView(cache, store, options, actions);
}
