import { buildMolisWorkWebView as composeWebView, cachedMolisWorkWebView as readCachedWebView,
  type LocalProjectDatabase, type GoalProjectApplication, type WebViewOptions, type MolisWorkWebViewCache } from "@molis-ai/molis-work-app-local-host";
import { buildGoalsDocumentCollection } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

/** Owner-level projection fixture. Actual HTTP authorization is tested through the real Host. */
export function readTestGoalCollection(store: LocalProjectDatabase, app: GoalProjectApplication, boardId: string) {
  return buildGoalsDocumentCollection({ snapshot: id => store.snapshot(id), events: id => store.readEventsDescending(id),
    goals: app.goalQueries, inputs: app.goalInputs, eventWork: app.goalEvents,
    projectGoalLifecycle: (snapshot, id) => app.projectGoalLifecycle(snapshot, id) }, boardId);
}
export function buildMolisWorkWebView(store: LocalProjectDatabase, app: GoalProjectApplication,
  options: Omit<WebViewOptions, "databasePath"> & { databasePath?: string }) {
  app.goalDecisionAttention.reconcile(options.boardId);
  return composeWebView(store, readTestGoalCollection(store, app, options.boardId), { databasePath: ":memory:", ...options });
}
export function cachedMolisWorkWebView(cache: MolisWorkWebViewCache, store: LocalProjectDatabase, app: GoalProjectApplication, options: WebViewOptions) {
  app.goalDecisionAttention.reconcile(options.boardId);
  const actions: BoundActionClient = { discover: async () => [], invoke: async () => readTestGoalCollection(store, app, options.boardId) as never };
  return readCachedWebView(cache, store, options, actions);
}
