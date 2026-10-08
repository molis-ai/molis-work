import { goalsActions, type GoalsDocumentCollectionView } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedQueryActions, type FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import { currentLocale } from "./web-locale.js";
import { listFeedSourceCatalog } from "./feed-source-service.js";
import { scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";

export interface WebViewOptions {
  databasePath: string; projectId: string; demo?: boolean; projectRoot?: string;
  project?: WebProjectNavigation | null; projects?: WebProjectNavigation[]; routePrefix?: string;
  homeDirectory?: string;
}

interface MolisWorkWebViewCacheEntry {
  cursor: number;
  optionsFingerprint: string;
  view: MolisWorkWebView;
}

export type MolisWorkWebViewCache = Map<string, MolisWorkWebViewCacheEntry>;

type PluginProjection = Pick<MolisWorkWebView, "feed" | "feed_source_catalog" | "feed_connector_auth" | "schedule_jobs" | "schedule_tasks" | "schedule_operations">;
const emptyFeed = (): FeedSnapshot => ({ sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] });

/** Optional areas disappear when their owner refuses access; unexpected failures must remain visible. */
export async function optionalPluginQuery<I, O>(actions: BoundActionClient, definition: ActionDefinition<I, O>, input: I): Promise<O | undefined> {
  try { return await actions.invoke(definition, input); }
  catch (error) {
    if (error instanceof ActionError && ["actions.forbidden", "actions.plugin_disabled", "actions.not_found", "actions.missing"].includes(error.code)) return undefined;
    throw error;
  }
}

export function buildMolisWorkWebView(_store: LocalProjectDatabase, collection: GoalsDocumentCollectionView, options: WebViewOptions, projection: PluginProjection = { feed: emptyFeed() }): MolisWorkWebView {
  return {
    snapshot: options.project
      ? { ...collection.snapshot, board: { ...collection.snapshot.board, project_id: "" } }
      : collection.snapshot,
    project: options.project ?? null, projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "", demo: Boolean(options.demo),
    active_goal_id: collection.active_goal_id, goals: collection.goals,
    archived_goals: collection.archived_goals, trashed_goals: collection.trashed_goals,
    counts: collection.counts, input_bindings: collection.input_bindings,
    policy_bindings: collection.policy_bindings, events: collection.events,
    ...projection,
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
    project_id: options.projectId,
    locale: currentLocale(),
    demo: Boolean(options.demo),
    project_root: options.projectRoot ?? "",
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
    home_directory: options.homeDirectory ?? "",
    // Materials bound to a Goal are written without a journal event, so the cursor alone would keep an old list.
    input_bindings: collection.input_bindings.map(binding => [binding.binding_id, binding.state]),
  });
  const cached = cache.get(options.databasePath);
  const base = cached?.cursor === cursor && cached.optionsFingerprint === optionsFingerprint
    ? cached.view : buildMolisWorkWebView(store, collection, options);
  cache.set(options.databasePath, { cursor, optionsFingerprint, view: base });
  // Plugin state does not share the Goals journal cursor. Never cache it behind that cursor,
  // and always use each owner's current authority, even when the base page is a cache hit.
  const [feed, inbox, schedule, connections] = await Promise.all([
    optionalPluginQuery(actions, feedQueryActions.snapshot, {}),
    optionalPluginQuery(actions, inboxActions.list, {}),
    optionalPluginQuery(actions, scheduleActions.list, {}),
    optionalPluginQuery(actions, feedQueryActions.connections, {}),
  ]);
  return { ...base, feed: { ...(feed ?? emptyFeed()), inbox_entries: [...(inbox?.entries ?? [])] },
    feed_source_catalog: feed ? listFeedSourceCatalog() : [], feed_connector_auth: connections,
    schedule_jobs: schedule?.jobs ?? [], schedule_tasks: schedule?.tasks ?? [], schedule_operations: schedule?.operations ?? [] };
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
