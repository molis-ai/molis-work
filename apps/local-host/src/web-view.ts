import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { expectingRefusal, newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { type MolisWorkWebView, type WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
export type { MolisWorkWebView };
import { inLanguagePreview, currentLocale } from "./web-locale.js";
import { developerMode } from "./developer-mode.js";
import { PROJECT_SCOPED_PLUGIN_IDS, shownProjectPlugins } from "./plugin-registry.js";

export interface WebViewOptions {
  databasePath: string; projectId: string; demo?: boolean; projectRoot?: string;
  project?: WebProjectNavigation | null; projects?: WebProjectNavigation[]; routePrefix?: string;
  homeDirectory?: string;
}

interface MolisWorkWebViewCacheEntry {
  optionsFingerprint: string;
  view: MolisWorkWebView;
}

export type MolisWorkWebViewCache = Map<string, MolisWorkWebViewCacheEntry>;

type PluginProjection = Pick<MolisWorkWebView, "stage_data">;

/**
 * A page looks for the areas of the plugins a project may not have on every request. "Not enabled" or no registered action is
 * the answer it is looking for, so the Host keeps no row in the call log about that refusal; any other refusal still leaves one.
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

export function buildMolisWorkWebView(options: WebViewOptions, projection: PluginProjection = {}): MolisWorkWebView {
  return {
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
    demo: Boolean(options.demo),
    // Which plugins the page shows is the Host's fact (W5-02 PR-B). Without a project's Catalog selection (standalone single-DB fixture):
    // all registered project-scoped plugins plus personal plugins. Real projects always receive their Catalog selection per request.
    ...(options.project ? {} : { shown_plugins: shownProjectPlugins(PROJECT_SCOPED_PLUGIN_IDS) }),
    ...projection,
  };
}

/** Platform page shell view; plugin-owned data is read per request only for enabled plugins via `stage_data` (PEQ-01, PEQ-03). */
export function cachedMolisWorkWebView(
  cache: MolisWorkWebViewCache,
  options: WebViewOptions,
): MolisWorkWebView {
  const dev = developerMode();
  const optionsFingerprint = JSON.stringify({
    project_id: options.projectId,
    locale: currentLocale(),
    demo: Boolean(options.demo),
    developer_mode: dev,
    project_root: options.projectRoot ?? "",
    project: options.project ?? null,
    projects: options.projects ?? [],
    route_prefix: options.routePrefix ?? "",
    home_directory: options.homeDirectory ?? "",
  });
  const cached = cache.get(options.databasePath);
  const base = cached?.optionsFingerprint === optionsFingerprint
    ? cached.view
    : { ...buildMolisWorkWebView(options), developer_mode: dev };
  if (!inLanguagePreview()) cache.set(options.databasePath, { optionsFingerprint, view: base });
  return base;
}
