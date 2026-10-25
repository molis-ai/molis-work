import { BUILTIN_PLUGIN_CATALOG, type PluginDirectory, type PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import type { UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { hostLog } from "./host-log.js";
import type { HomePluginHost } from "./home-plugins.js";

/** What the directory reads of a Runtime's supervisor: which plugins it holds enabled, how each one is doing, and its Manifest. */
export interface DirectorySource {
  enabledPluginIds(): readonly string[];
  state(pluginId: string): { readonly status: string } | null;
  manifest(pluginId: string): {
    readonly plugin_id: string;
    readonly name: string;
    readonly publisher: { readonly signature: string };
    readonly ui: { readonly views?: readonly UiViewDeclaration[] };
  } | undefined;
}

/**
 * The plugins one Runtime runs, as the shell reads them (W5-06 余项 2): the declarations of each enabled plugin's Manifest. A
 * plugin the person turned off, one that was uninstalled or whose consent was withdrawn (not enabled), and one the Runtime
 * refuses to run (blocked) are not in it; one that failed to start still is, because its place in the project stays until it is
 * restarted. Read per page, so the next read after any of those has no entry for it.
 *
 * A built-in is the one the catalog names with the same id and publisher; its entry carries the catalog's project key and is
 * chosen by the project's plugin list. Any other plugin is keyed by its Manifest id and is in the project because it runs there.
 * The key is the Host's to give, never read from the Manifest.
 */
export function runningPluginDirectory(source: DirectorySource): PluginDirectoryEntry[] {
  return source.enabledPluginIds().flatMap(pluginId => {
    const manifest = source.manifest(pluginId), state = source.state(pluginId);
    if (!manifest || !state || state.status === "blocked") return [];
    const builtin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === manifest.plugin_id
      && entry.manifest.publisher.signature === manifest.publisher.signature);
    return [{ id: builtin?.project_plugin_id ?? manifest.plugin_id, plugin_id: manifest.plugin_id, name: manifest.name,
      chosen: builtin !== undefined, ui: { views: manifest.ui.views ?? [] } }];
  });
}

/** The Home Runtime's plugins; a Home that did not start has none. */
export async function homePluginDirectory(host?: HomePluginHost): Promise<PluginDirectoryEntry[]> {
  if (!host) return [];
  try { return runningPluginDirectory((await host.ready()).supervisor); }
  catch (error) { hostLog.warn("plugins", "home_directory_unavailable", error); return []; }
}

/** Several Runtimes' entries as one directory: a plugin that runs in more than one (a dual-instance one) is listed once, by its first. */
export function mergePluginDirectories(...parts: readonly PluginDirectory[]): PluginDirectoryEntry[] {
  const seen = new Set<string>();
  return parts.flat().filter(entry => !seen.has(entry.id) && (seen.add(entry.id), true));
}
