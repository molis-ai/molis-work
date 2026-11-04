import { listTestFeedSourceCatalog } from "./feed-library.js";
import { scheduleServiceFor, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createScheduleActionPorts } from "@molis-ai/molis-work-plugin-schedule";
import { feedQueryActions } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { buildMolisWorkWebView as composeWebView, cachedMolisWorkWebView as readCachedWebView, type LocalProjectDatabase, type WebViewOptions, type MolisWorkWebViewCache } from "@molis-ai/molis-work-app-local-host";
import { buildGoalsDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { GoalProjectApplication, boardSnapshot } from "./goal-application.js";
import { createLocalFeedApplication } from "./feed-library.js";

/** Whether this Home has a GitHub or Gmail connection that is not disconnected, read from metadata. */
const feedConnectorAuthStatus = (home: string | undefined) => !home ? { github: { bound: false }, gmail: { bound: false } }
  : withConnectorConnections(home, store => { const bound = (service: string) => store.list(service).some(row => row.enabled && !row.disconnected_at); return { github: { bound: bound("github") }, gmail: { bound: bound("gmail") } }; });

/** Owner-level projection fixture. Actual HTTP authorization is tested through the real Host. */
export function readTestGoalCollection(store: LocalProjectDatabase, app: GoalProjectApplication, projectId: string) {
  return buildGoalsDocumentCollection({ snapshot: id => boardSnapshot(store, id), events: id => app.ownedEvents(id),
    goals: app.goalQueries, inputs: app.goalInputs, eventWork: app.goalEvents }, projectId);
}
/** What the Inbox plugin lists (`inbox.list`): every explicitly owned entry of the project, whoever owns it. */
function ownedInboxEntries(store: LocalProjectDatabase, projectId: string) {
  return (store.db.prepare("SELECT * FROM inbox_entries WHERE project_id = ? AND owner_plugin_id IS NOT NULL ORDER BY updated_at DESC, entry_id").all(projectId) as Array<Record<string, unknown>>)
    .map(({ detail_json, ...row }) => ({ ...row, detail: JSON.parse(String(detail_json)) as Record<string, unknown> }));
}
export function buildMolisWorkWebView(store: LocalProjectDatabase, app: GoalProjectApplication,
  options: Omit<WebViewOptions, "databasePath"> & { databasePath?: string }) {
  const snapshot = createLocalFeedApplication(store.db).snapshot(options.projectId);
  const schedule = createScheduleActionPorts({ db: store.db, schedule: scheduleServiceFor(store.db) });
  return composeWebView(store, readTestGoalCollection(store, app, options.projectId), { databasePath: ":memory:", ...options }, {
    feed: { ...snapshot, inbox_entries: ownedInboxEntries(store, options.projectId) as never, feed_items: snapshot.feed_items.map(item => ({ ...item, body: null, materials: item.materials.map(material => ({ ...material, content: undefined })) })) },
    feed_source_catalog: listTestFeedSourceCatalog(), feed_connector_auth: feedConnectorAuthStatus(options.homeDirectory),
    // What the page's stage read (`schedule.tasks.list`, its declared `stage_data`) answers; the Host reads it per request (T-133).
    stage_data: { schedule: { jobs: schedule.listJobs(), tasks: schedule.listTasks(), operations: [] } },
  });
}
export function cachedMolisWorkWebView(cache: MolisWorkWebViewCache, store: LocalProjectDatabase, app: GoalProjectApplication, options: WebViewOptions) {
  const actions: BoundActionClient = { discover: async () => [], invoke: async definition => {
    const view = buildMolisWorkWebView(store, app, options);
    if (definition.capability_id === feedQueryActions.snapshot.capability_id) { const { inbox_entries, ...snapshot } = view.feed; return snapshot as never; }
    if (definition.capability_id === feedQueryActions.connections.capability_id) return view.feed_connector_auth as never;
    if (definition.capability_id === inboxActions.list.capability_id) return { entries: view.feed.inbox_entries } as never;
    return readTestGoalCollection(store, app, options.projectId) as never;
  } };
  return readCachedWebView(cache, store, options, actions);
}
