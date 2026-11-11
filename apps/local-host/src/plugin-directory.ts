import type { PluginDirectory, PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { hostLog } from "./host-log.js";
import type { HomePluginHost } from "./home-plugins.js";
import { readOnlyAlwaysOnProjectPlugins } from "./always-on-plugins.js";
import { BUILTIN_PLUGIN_REGISTRY, PLATFORM_PLUGIN_REGISTRATIONS, builtinPluginByManifestId } from "./plugin-registry.js";

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
 * from the platform's own registration, `home` from that registration's own Manifest (its Runtime is the Home's), `always_on` from
 * what this Home agreed to (`alwaysOnProjectPlugins`; without a Home, none).
 */
export function runningPluginDirectory(source: DirectorySource, home?: string): PluginDirectoryEntry[] {
  const alwaysOn = home ? readOnlyAlwaysOnProjectPlugins(home) : [];
  return source.enabledPluginIds().flatMap(pluginId => {
    const manifest = source.manifest(pluginId), state = source.state(pluginId);
    if (!manifest || !state || state.status === "blocked") return [];
    const registration = builtinPluginByManifestId(manifest.plugin_id);
    const builtin = registration?.manifest.publisher.signature === manifest.publisher.signature ? registration : undefined;
    return [{ id: builtin?.project_plugin_id ?? manifest.plugin_id, plugin_id: manifest.plugin_id, name: manifest.name, ...(manifest.name_en !== undefined ? { name_en: manifest.name_en } : {}),
      chosen: builtin !== undefined, ...(builtin ? builtinMarks(builtin, alwaysOn) : {}), ui: { views: manifest.ui.views ?? [] } }];
  });
}

function builtinMarks(builtin: PluginRegistration, alwaysOn: readonly string[]): Pick<PluginDirectoryEntry, "personal" | "home" | "always_on" | "companions"> {
  const companions = BUILTIN_PLUGIN_REGISTRY.companions(builtin.project_plugin_id);
  return { ...(builtin.personal === true ? { personal: true as const } : {}), ...(builtin.manifest.runtime?.scope === "home" ? { home: true as const } : {}),
    ...(alwaysOn.includes(builtin.project_plugin_id) ? { always_on: true as const } : {}), ...(companions.length ? { companions } : {}) };
}

/**
 * The built-ins as the market lists them, with the same marks as a running one: the directory a page is drawn with ends with these, so
 * a built-in no Runtime here runs stays one to add, and the shell reads what it adds along or locks from the Host, never from its own copy.
 */
export function builtinMarketDirectory(home?: string): PluginDirectoryEntry[] {
  const alwaysOn = home ? readOnlyAlwaysOnProjectPlugins(home) : [];
  return PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ id: entry.project_plugin_id, plugin_id: entry.manifest.plugin_id, name: entry.manifest.name, ...(entry.manifest.name_en !== undefined ? { name_en: entry.manifest.name_en } : {}),
    chosen: true, ...builtinMarks(entry, alwaysOn), ui: { views: entry.manifest.ui.views ?? [] } }));
}

/**
 * The Home Runtime's plugins; a Home that did not start has none. What runs in the Home holds the person's data across projects, so a
 * package installed there is the person's as the built-in Home plugins are: the Host marks it `personal` and `home` (07-1 S4b, 口径 9),
 * and the switcher, the bar's right tray and ＋ list it with them (`isPersonalPlugin`). A built-in keeps the marks its registration
 * gives (Goals and Feed are not registered personal, so they are not marked; Shelf, also one instance each side, is). An installed
 * package that runs one instance each side is no one's own tool: it is not marked. A package that did not come back keeps its place, as it kept it on the
 * titlebar before: its stage says why, and wherever it is named it carries the amber point.
 */
export async function homePluginDirectory(host?: HomePluginHost, home?: string): Promise<PluginDirectoryEntry[]> {
  if (!host) return [];
  try {
    const running = runningPluginDirectory((await host.ready()).supervisor, home)
      .map(entry => entry.chosen || host.dualInstance(entry.plugin_id) ? entry : { ...entry, personal: true as const, home: true as const });
    const present = new Set(running.map(entry => entry.plugin_id));
    let installed: ReturnType<HomePluginHost["registered"]> = [];
    try { installed = host.registered(); } catch { /* A library that cannot be read now has no stalled package to add; the running ones stay. */ }
    const stalled = installed.filter(({ manifest }) => !present.has(manifest.plugin_id) && host.packageError(manifest.plugin_id) !== undefined)
      .map(({ key, manifest }): PluginDirectoryEntry => ({ id: key, plugin_id: manifest.plugin_id, name: manifest.name, ...(manifest.name_en !== undefined ? { name_en: manifest.name_en } : {}),
        chosen: false, personal: true, home: true, ui: { views: manifest.ui.views ?? [] } }));
    return [...running, ...stalled];
  }
  catch (error) { hostLog.warn("plugins", "home_directory_unavailable", error); return []; }
}

/** Several Runtimes' entries as one directory: a plugin that runs in more than one (a dual-instance one) is listed once, by its first. */
export function mergePluginDirectories(...parts: readonly PluginDirectory[]): PluginDirectoryEntry[] {
  const seen = new Set<string>();
  return parts.flat().filter(entry => !seen.has(entry.id) && (seen.add(entry.id), true));
}
