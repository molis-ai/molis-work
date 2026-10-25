import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG, shownProjectPlugins } from "@molis-ai/molis-work-app-workbench";
import type { ActionAvailability, ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/**
 * The plugins a project's actions and routes may reach right now (PG-013): what it shows (enabled ones, and personal ones the person
 * did not hide there) and what those embed. `null` where there is no project record (a deleted project): nothing is hidden there.
 * The one list actions and routes share; it reads the catalog on every call, so hiding and unhiding count at once.
 */
export function projectReachablePlugins(catalog: Pick<MolisWorkProjectCatalog, "listProjectPlugins" | "listHiddenPlugins">, projectId: string): ReadonlySet<string> | null {
  try { return availableProjectPluginIds(shownProjectPlugins(catalog.listProjectPlugins(projectId), catalog.listHiddenPlugins(projectId))); }
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

/** Bundled plugins use the existing project installation record; Runtime plugins enforce their own grants. */
export function projectActionAvailability(withCatalog: LocalWebCatalogRunner, homeDirectory: string) {
  const entryOf = (action: Pick<ActionView, "provider">) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === action.provider.plugin_id);
  const read = async (caller: ActionCallContext): Promise<ReadonlySet<string> | null> => {
    if (!caller.project_id) return null;
    return withCatalog({ homeDirectory }, catalog => projectReachablePlugins(catalog, caller.project_id!));
  };
  const state = (action: Pick<ActionView, "provider">, reachable: ReadonlySet<string> | null): ActionAvailability => {
    const entry = entryOf(action);
    return !entry || pluginReachable(entry, reachable) ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  };
  const live = (caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability | Promise<ActionAvailability> =>
    entryOf(action) ? read(caller).then(reachable => state(action, reachable)) : { available: true };
  return Object.assign(live, { snapshotForDiscovery: async (caller: ActionCallContext) => {
    const reachable = await read(caller);
    return (_caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability => state(action, reachable);
  } });
}
