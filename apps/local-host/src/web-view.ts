import { emptyGoalsDocumentCollection, goalsActions, type GoalsDocumentCollectionView } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { expectingRefusal, newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { PAGE_PLUGINS_WITHOUT_SELECTION, type MolisWorkWebView, type WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { LocalProjectDatabase } from "./project-database.js";
import { currentLocale } from "./web-locale.js";
import { developerMode } from "./developer-mode.js";
import { shownProjectPlugins } from "./plugin-registry.js";

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

type PluginProjection = Pick<MolisWorkWebView, "stage_data">;

/**
 * A page looks for the areas of the plugins a project may not have (Feed, Inbox, declared stage reads, Artifacts) on every request. "Not enabled" or no registered action is
 * the answer it is looking for, so the Host keeps no row in the call log about that refusal (nor about the Feed timer's pull every 30
 * seconds in a project without Feed); any other refusal still leaves one.
 * The answer is wanted only while the call that looks is pending, so each call gets a scope of its own: in one scope around a
 * `Promise.all`, the first refusal ends it and the refusals of the others, arriving later, would be recorded.
 */
export const lookingForArea = <T>(run: () => Promise<T>): Promise<T> => expectingRefusal(["actions.plugin_disabled", "actions.missing"], run);

/**
 * A Feed pull. It outlives the request that happened to start it and is not part of it, so each pull, the one a page starts and every tick of
 * the 30-second timer, is an operation of its own, with a call number of its own; the project may have no Feed (`lookingForArea`).
 */
export const feedPull = <T>(run: () => Promise<T>): Promise<T> => withCallId(newCallId(), () => lookingForArea(run));

/** Optional areas disappear when their owner refuses access; unexpected failures must remain visible. */
export async function optionalPluginQuery<I, O>(actions: BoundActionClient, definition: ActionDefinition<I, O>, input: I): Promise<O | undefined> {
  try { return await lookingForArea(() => actions.invoke(definition, input)); }
  catch (error) {
    if (error instanceof ActionError && ["actions.forbidden", "actions.plugin_disabled", "actions.missing"].includes(error.code)) return undefined;
    throw error;
  }
}

export function buildMolisWorkWebView(_store: LocalProjectDatabase, collection: GoalsDocumentCollectionView, options: WebViewOptions, projection: PluginProjection = {}): MolisWorkWebView {
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
    // Which plugins the page shows is the Host's fact (W5-02 PR-B). Without a project's selection: the shell's page default and the
    // personal plugins. A project's view is given its Catalog's selection per request instead (`projectWebView`), never this.
    ...(options.project ? {} : { shown_plugins: shownProjectPlugins(PAGE_PLUGINS_WITHOUT_SELECTION) }),
    ...projection,
  };
}

export async function cachedMolisWorkWebView(
  cache: MolisWorkWebViewCache,
  store: LocalProjectDatabase,
  options: WebViewOptions,
  actions: BoundActionClient,
  goalsHere = true,
): Promise<MolisWorkWebView> {
  // Always authorize through the shared service before reusing any cached content. A project without Goals (RAC-400, by its plugin list)
  // reads as one with none; in a project with Goals, a read Goals refuses is an error to show.
  const collection = goalsHere ? await actions.invoke(goalsActions.collection, {}) : emptyGoalsDocumentCollection(options.projectId);
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
    // A view drawn without Goals is not the one to reuse once Goals is added, even at the same cursor.
    goals_here: goalsHere,
    // Materials bound to a Goal are written without a journal event, so the cursor alone would keep an old list.
    input_bindings: collection.input_bindings.map(binding => [binding.binding_id, binding.state]),
  });
  const cached = cache.get(options.databasePath);
  const base = cached?.cursor === cursor && cached.optionsFingerprint === optionsFingerprint
    ? cached.view : buildMolisWorkWebView(store, collection, options);
  cache.set(options.databasePath, { cursor, optionsFingerprint, view: base });
  return { ...base, developer_mode: developerMode() };
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
