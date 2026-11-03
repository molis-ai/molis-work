import type { PluginDirectory, PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { hostLog } from "./host-log.js";
import type { HomePluginHost } from "./home-plugins.js";
import { alwaysOnProjectPlugins } from "./always-on-plugins.js";
import { BUILTIN_PLUGIN_REGISTRY, PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** What the directory reads of a Runtime's supervisor: which plugins it holds enabled, how each one is doing, and its Manifest. */
export interface DirectorySource {
  enabledPluginIds(): readonly string[];
  state(pluginId: string): { readonly status: string } | null;
  manifest(pluginId: string): {
    readonly plugin_id: string;
    readonly name: string;
    readonly name_en?: string;
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
 * The key is the Host's to give, never read from the Manifest, and so are a built-in's marks (W5-02 B1): `personal` and `companions`
 * from the platform's own registration, `always_on` from what this Home agreed to (`alwaysOnProjectPlugins`; without a Home, none).
 */
export function runningPluginDirectory(source: DirectorySource, home?: string): PluginDirectoryEntry[] {
  const alwaysOn = home ? alwaysOnProjectPlugins(home) : [];
  return source.enabledPluginIds().flatMap(pluginId => {
    const manifest = source.manifest(pluginId), state = source.state(pluginId);
    if (!manifest || !state || state.status === "blocked") return [];
    const builtin = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === manifest.plugin_id
      && entry.manifest.publisher.signature === manifest.publisher.signature);
    return [{ id: builtin?.project_plugin_id ?? manifest.plugin_id, plugin_id: manifest.plugin_id, name: manifest.name, ...(manifest.name_en !== undefined ? { name_en: manifest.name_en } : {}),
      chosen: builtin !== undefined, ...(builtin ? builtinMarks(builtin, alwaysOn) : {}), ui: { views: manifest.ui.views ?? [] } }];
  });
}

function builtinMarks(builtin: PluginRegistration, alwaysOn: readonly string[]): Pick<PluginDirectoryEntry, "personal" | "always_on" | "companions"> {
  const companions = BUILTIN_PLUGIN_REGISTRY.companions(builtin.project_plugin_id);
  return { ...(builtin.personal === true ? { personal: true as const } : {}), ...(alwaysOn.includes(builtin.project_plugin_id) ? { always_on: true as const } : {}),
    ...(companions.length ? { companions } : {}) };
}

/**
 * The built-ins as the market lists them, with the same marks as a running one: the directory a page is drawn with ends with these, so
 * a built-in no Runtime here runs stays one to add, and the shell reads what it adds along or locks from the Host, never from its own copy.
 */
export function builtinMarketDirectory(home?: string): PluginDirectoryEntry[] {
  const alwaysOn = home ? alwaysOnProjectPlugins(home) : [];
  return PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ id: entry.project_plugin_id, plugin_id: entry.manifest.plugin_id, name: entry.manifest.name, ...(entry.manifest.name_en !== undefined ? { name_en: entry.manifest.name_en } : {}),
    chosen: true, ...builtinMarks(entry, alwaysOn), ui: { views: entry.manifest.ui.views ?? [] } }));
}

/** The Home Runtime's plugins; a Home that did not start has none. */
export async function homePluginDirectory(host?: HomePluginHost, home?: string): Promise<PluginDirectoryEntry[]> {
  if (!host) return [];
  try { return runningPluginDirectory((await host.ready()).supervisor, home); }
  catch (error) { hostLog.warn("plugins", "home_directory_unavailable", error); return []; }
}

/** Several Runtimes' entries as one directory: a plugin that runs in more than one (a dual-instance one) is listed once, by its first. */
export function mergePluginDirectories(...parts: readonly PluginDirectory[]): PluginDirectoryEntry[] {
  const seen = new Set<string>();
  return parts.flat().filter(entry => !seen.has(entry.id) && (seen.add(entry.id), true));
}
