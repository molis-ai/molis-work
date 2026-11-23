import type { ProjectPluginId, ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { availableProjectPluginIds, builtinPluginByManifestId, shownProjectPlugins } from "./plugin-registry.js";
import type { ActionAvailability, ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { homePluginsOutsideBuild } from "./home-registration.js";
import { alwaysOnPluginStamp } from "./always-on-plugins.js";

type ReachEntry = PluginRegistration | { readonly personal: true; readonly project_plugin_id: string; readonly runtime?: never };
type ReachCatalog = Pick<MolisWorkProjectCatalog, "projectPluginMembership"> & {
  readonly catalogDataStamp?: () => string | null;
  readonly homeDirectory?: string;
};

const projectReachCache = new WeakMap<object, Map<string, { readonly stamp: string; readonly reachable: ReadonlySet<string> | null }>>();

/**
 * Live stamp combining catalog file/data/schema state, Home always-on plugin state, and external Home registrations.
 * Returns `null` when the catalog does not expose a live stamp (or is inside a transaction), forcing a direct read.
 */
export function projectReachStamp(
  catalog: ReachCatalog,
  homeDirectory: string | undefined,
  outsideBuild: readonly string[] = [],
): string | null {
  if (typeof catalog.catalogDataStamp !== "function") return null;
  const catalogStamp = catalog.catalogDataStamp();
  if (catalogStamp === null) return null;
  const effectiveHome = homeDirectory ?? catalog.homeDirectory;
  const alwaysOn = effectiveHome ? alwaysOnPluginStamp(effectiveHome) : "none";
  return `${catalogStamp}|${alwaysOn}|${outsideBuild.join("\0")}`;
}

/**
 * Reuses a project's computed reachable-plugin set while both the catalog DB and the Home's always-on plugin store remain
 * at the exact same live stamp. Any membership write, always-on consent change, external SQLite edit, or Home registration
 * change changes the stamp immediately before the cache is consulted.
 */
export function cachedProjectReachablePlugins(
  catalog: ReachCatalog,
  projectId: string,
  homeDirectory: string | undefined,
  outsideBuild: readonly string[] = [],
): ReadonlySet<string> | null {
  const before = projectReachStamp(catalog, homeDirectory, outsideBuild);
  if (before !== null) {
    const cached = projectReachCache.get(catalog)?.get(projectId);
    if (cached && cached.stamp === before) return cached.reachable;
  }
  const reachable = projectReachablePlugins(catalog, projectId, outsideBuild);
  if (before !== null && projectReachStamp(catalog, homeDirectory, outsideBuild) === before) {
    let entries = projectReachCache.get(catalog);
    if (!entries) projectReachCache.set(catalog, entries = new Map());
    entries.set(projectId, { stamp: before, reachable });
    while (entries.size > 64) entries.delete(entries.keys().next().value!);
  }
  return reachable;
}

export function projectMembershipReach({ plugins, hidden }: ProjectPluginMembership): ReadonlySet<string> {
  return availableProjectPluginIds(shownProjectPlugins(plugins, hidden));
}

/**
 * The plugins a project's actions and routes may reach right now (PG-013): what it shows (enabled ones, and personal ones the person
 * did not hide there) and what those embed. `null` where there is no project record (a deleted project): nothing is hidden there.
 * The one list actions and routes share; it reads the catalog on every call, so hiding and unhiding count at once. `outsideBuild` is
 * the Home's personal plugins its build does not ship (`homePluginsOutsideBuild`, #679): reached unless the project hid them. A caller
 * that passes none reaches none of them.
 */
export function projectReachablePlugins(catalog: Pick<MolisWorkProjectCatalog, "projectPluginMembership">, projectId: string,
  outsideBuild: readonly string[] = [], directory?: () => readonly ProjectPluginId[]): ReadonlySet<string> | null {
  try {
    const membership = catalog.projectPluginMembership(projectId, directory);
    const reachable = new Set(projectMembershipReach(membership));
    for (const key of outsideBuild) if (!membership.hidden.includes(key)) reachable.add(key);
    return reachable;
  }
  catch (error) {
    // Deleted or standalone projects have no catalog installation; never crash MCP discovery or grant access.
    if ((error as { code?: string })?.code === "catalog.project_not_found") return null;
    throw error;
  }
}

/** Whether a catalog plugin can be reached from a project: where there is no project list, only a personal plugin (it has nothing to hide). */
export function pluginReachable(entry: Pick<PluginRegistration, "personal" | "project_plugin_id">, reachable: ReadonlySet<string> | null): boolean {
  return reachable === null ? entry.personal === true : reachable.has(entry.project_plugin_id);
}

/**
 * What the reach judgement knows of a plugin in this Home: its catalog entry, or, for a personal Home plugin outside the build, the same
 * shape keyed by its plugin id. Anything else (a project's own Runtime plugin) is not the catalog's to judge.
 */
export function reachEntry(homeDirectory: string | undefined, pluginId: string): ReachEntry | undefined {
  return builtinPluginByManifestId(pluginId)
    ?? (homePluginsOutsideBuild(homeDirectory).includes(pluginId) ? { personal: true, project_plugin_id: pluginId } : undefined);
}

/**
 * The judgement of whether this project reaches the plugin behind a provider, by the same rule `projectActionAvailability` applies:
 * the project's shown plugins are read once here, and each Manifest id is resolved to its catalog key (`reachEntry`) before asking.
 * `undefined` is "not this list's to judge" — a Runtime plugin (installed per project, its grants are its own), where the caller keeps
 * the old rule. Returned once, so a caller outside the catalog's callback never holds its database open.
 */
export function projectPluginJudge(catalog: ReachCatalog, projectId: string,
  homeDirectory: string | undefined): (pluginId: string) => boolean | undefined {
  const reachable = cachedProjectReachablePlugins(catalog, projectId, homeDirectory, homePluginsOutsideBuild(homeDirectory));
  return pluginId => {
    const entry = reachEntry(homeDirectory, pluginId);
    return entry ? pluginReachable(entry, reachable) : undefined;
  };
}

/** Bundled plugins use the existing project installation record; Runtime plugins enforce their own grants. */
export function projectActionAvailability(withCatalog: LocalWebCatalogRunner, homeDirectory: string) {
  const entryOf = (action: Pick<ActionView, "provider">) => {
    const entry = action.provider.plugin_id ? reachEntry(homeDirectory, action.provider.plugin_id) : undefined;
    // A Home plugin outside the build has no project half: a project's own provider under its id is another publisher's plugin (BL-586),
    // whose grants are its own, not the Home one the project's list shows or hides.
    return entry && !("manifest" in entry) && action.provider.project_id !== undefined ? undefined : entry;
  };
  const read = async (caller: ActionCallContext): Promise<ReadonlySet<string> | null> => {
    if (!caller.project_id) return null;
    return withCatalog({ homeDirectory }, catalog => cachedProjectReachablePlugins(catalog, caller.project_id!, homeDirectory, homePluginsOutsideBuild(homeDirectory)));
  };
  const state = (caller: ActionCallContext, action: Pick<ActionView, "provider">, entry: ReachEntry | undefined, reachable: ReadonlySet<string> | null): ActionAvailability => {
    // Only Runtime stamps an installation id. A Home provider belongs to its trusted Home registration,
    // not to a project's shown-plugin list; a missing/deleted project is still a project caller.
    const homeRuntime = caller.project_id == null && action.provider.kind === "plugin"
      && !!action.provider.plugin_install_id && action.provider.project_id === undefined && !!entry?.runtime;
    return !entry || homeRuntime || pluginReachable(entry, reachable) ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  };
  const live = (caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability | Promise<ActionAvailability> => {
    const entry = entryOf(action);
    if (!entry) return { available: true };
    // Only the built-in declaration survives the await. The Home's external registration may have changed.
    return read(caller).then(reachable => state(caller, action, "manifest" in entry ? entry : entryOf(action), reachable));
  };
  return Object.assign(live, { snapshotForDiscovery: async (caller: ActionCallContext) => {
    // A later discovery can be the post-await withdrawal check of an aggregate. Never reuse its presentation directory here.
    const reachable = await read(caller);
    return (_caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability => state(caller, action, entryOf(action), reachable);
  } });
}
