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
  return (store.db.prepare("SELECT * FROM attention_entries WHERE project_id = ? AND owner_plugin_id IS NOT NULL ORDER BY updated_at DESC, entry_id").all(projectId) as Array<Record<string, unknown>>)
    .map(({ detail_json, ...row }) => ({ ...row, detail: JSON.parse(String(detail_json)) as Record<string, unknown> }));
}
export function buildMolisWorkWebView(store: LocalProjectDatabase, app: GoalProjectApplication,
  options: Omit<WebViewOptions, "databasePath"> & { databasePath?: string }) {
  const snapshot = createLocalFeedApplication(store.db).snapshot(options.projectId);
  const schedule = createScheduleActionPorts({ db: store.db, schedule: scheduleServiceFor(store.db) });
  const goals = readTestGoalCollection(store, app, options.projectId);
  const feed = { ...snapshot, attention_entries: ownedInboxEntries(store, options.projectId) as never, feed_items: snapshot.feed_items.map(item => ({ ...item, body: null, materials: item.materials.map(material => ({ ...material, content: undefined })) })) };
  const feed_source_catalog = listTestFeedSourceCatalog();
  const feed_connector_auth = feedConnectorAuthStatus(options.homeDirectory);
  return {
    ...composeWebView({ databasePath: ":memory:", ...options }, {
      stage_data: {
        goals: { selection: "current", collection: goals, selected: null, presentation_states: [] },
        schedule: { jobs: schedule.listJobs(), tasks: schedule.listTasks(), operations: [] },
      },
    }),
    ...goals,
    feed,
    feed_source_catalog,
    feed_connector_auth,
  };
}
export function cachedMolisWorkWebView(cache: MolisWorkWebViewCache, _store: LocalProjectDatabase, _app: GoalProjectApplication, options: WebViewOptions) {
  return readCachedWebView(cache, options);
}
