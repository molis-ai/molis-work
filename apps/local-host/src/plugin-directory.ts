import { installedRepairStage } from "./installed-stage-section.js";
import type { PluginActiveInstance } from "@molis-ai/molis-work-plugin-runtime";
import { directoryWordResolver, drawRegisteredText } from "./ui-text-provider.js";
import { pluginTextReader, projectDirectoryWords, type DirectoryWordSource, type PluginDirectory, type PluginDirectoryEntry } from "@molis-ai/molis-work-ui-host";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { hostLog } from "./host-log.js";
import type { HomePluginHost } from "./home-plugins.js";
import { BUILTIN_PLUGIN_REGISTRY, PLATFORM_PLUGIN_REGISTRATIONS, builtinPluginByManifestId } from "./plugin-registry.js";
import { HOSTED_SURFACES } from "./host-surface-list.js";

/** What the directory reads of a Runtime's supervisor: which plugins it holds enabled, how each one is doing, and its Manifest. */
export interface DirectorySource {
  enabledPluginIds(): readonly string[];
  activeInstance?(pluginId: string): PluginActiveInstance | undefined;
  state(pluginId: string): { readonly status: string } | null;
  manifest(pluginId: string): (DirectoryWordSource & { readonly publisher: { readonly signature: string } }) | undefined;
}

/**
 * The plugins one Runtime runs, as the shell reads them (W5-06 余项 2): the declarations of each enabled plugin's Manifest. A
 * plugin the person turned off, one that was uninstalled or whose consent was withdrawn (not enabled), and one the Runtime
 * refuses to run (blocked) are not in it; one that failed to start still is, because its place in the project stays until it is
 * restarted. Read per page, so the next read after any of those has no entry for it.
 *
 * A built-in is the one the catalog names with the same id and publisher; its entry carries the catalog's project key and is
 * chosen by the project's plugin list. Any other plugin is keyed by its Manifest id and is in the project because it runs there.
 * The key is the Host's to give, never read from the Manifest, and so are a built-in's marks (W5-02 B1): `companions`
 * from the platform's own registration, `home` from that registration's own Manifest (its Runtime is the Home's).
 * A platform part the Runtime hosts (Shelf, 44B PR2b) is not in it: the shell frames it from its own surface list in every project.
 */
export function runningPluginDirectory(source: DirectorySource): PluginDirectoryEntry[] {
  return source.enabledPluginIds().flatMap(pluginId => {
    const state = source.state(pluginId), running = source.activeInstance?.(pluginId)?.source?.();
    const producer = running?.manifest.plugin_id === pluginId ? running : null;
    const manifest = producer ? producer.manifest : source.manifest(pluginId);
    if (!manifest || !state || state.status === "blocked" || hostedPart(manifest)) return [];
    const registration = builtinPluginByManifestId(manifest.plugin_id);
    const builtin = registration?.manifest.publisher.signature === manifest.publisher.signature ? registration : undefined;
    return [{ id: builtin?.project_plugin_id ?? manifest.plugin_id, plugin_id: manifest.plugin_id,
      chosen: builtin !== undefined, ...(builtin ? builtinMarks(builtin) : {}), ...projectDirectoryWords(manifest, directoryWordResolver(producer ? pluginTextReader(producer.activation) : null)) }];
  });
}

function hostedPart(manifest: { readonly plugin_id: string; readonly publisher: { readonly signature: string } }): boolean {
  return HOSTED_SURFACES.some(surface => surface.manifest.plugin_id === manifest.plugin_id && surface.manifest.publisher.signature === manifest.publisher.signature);
}

function builtinMarks(builtin: PluginRegistration): Pick<PluginDirectoryEntry, "home" | "companions"> {
  const companions = BUILTIN_PLUGIN_REGISTRY.companions(builtin.project_plugin_id);
  return { ...(builtin.manifest.runtime?.scope === "home" ? { home: true as const } : {}),
    ...(companions.length ? { companions } : {}) };
}

/**
 * The built-ins as the market lists them, with the same marks as a running one: the directory a page is drawn with ends with these, so
 * a built-in no Runtime here runs stays one to add, and the shell reads what it adds along or locks from the Host, never from its own copy.
 */
export function builtinMarketDirectory(): PluginDirectoryEntry[] {
  return PLATFORM_PLUGIN_REGISTRATIONS.map(entry => ({ id: entry.project_plugin_id, plugin_id: entry.manifest.plugin_id,
    chosen: true, ...builtinMarks(entry), ...drawRegisteredText(entry.manifest, resolve => projectDirectoryWords(entry.manifest, resolve)) }));
}

/** Home installations keep their stage address and health. Membership decides where each is offered. */
export async function homePluginDirectory(host?: HomePluginHost): Promise<PluginDirectoryEntry[]> {
  if (!host) return [];
  try {
    const running = runningPluginDirectory((await host.ready()).supervisor)
      .map(entry => entry.chosen || host.dualInstance(entry.plugin_id) ? entry : { ...entry, home: true as const });
    const present = new Set(running.map(entry => entry.plugin_id));
    let installed: ReturnType<HomePluginHost["registered"]> = [];
    try { installed = host.registered(); } catch { /* A library that cannot be read now has no stalled package to add; the running ones stay. */ }
    const stalled = installed.filter(({ manifest }) => !present.has(manifest.plugin_id) && host.packageError(manifest.plugin_id) !== undefined)
      .map(({ key, manifest }): PluginDirectoryEntry => ({ id: key, plugin_id: manifest.plugin_id,
        chosen: false, home: true, ...projectDirectoryWords(manifest) }));
    const repairs = host.damagedPackages().flatMap(damaged => {
      const repair = installedRepairStage(damaged, "home", "");
      return repair ? [repair.directory] : [];
    });
    return mergePluginDirectories(running, repairs, stalled);
  }
  catch (error) { hostLog.warn("plugins", "home_directory_unavailable", error); return []; }
}

/** The directory a Home's pages read (the project list's as well as each project's): its own Runtimes' plugins, then the market's. */
export async function pagePluginDirectory(host: HomePluginHost | undefined): Promise<PluginDirectoryEntry[]> {
  return mergePluginDirectories(await homePluginDirectory(host), builtinMarketDirectory());
}

/** Several Runtimes' entries as one directory: a plugin that runs in more than one (a dual-instance one) is listed once, by its first. */
export function mergePluginDirectories(...parts: readonly PluginDirectory[]): PluginDirectoryEntry[] {
  const seen = new Set<string>();
  return parts.flat().filter(entry => !seen.has(entry.id) && (seen.add(entry.id), true));
}
