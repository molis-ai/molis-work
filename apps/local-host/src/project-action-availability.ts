import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ActionAvailability, ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Bundled plugins use the existing project installation record; Runtime plugins enforce their own grants. */
export function projectActionAvailability(withCatalog: LocalWebCatalogRunner, homeDirectory: string) {
  const projectPlugin = (action: Pick<ActionView, "provider">) => {
    const plugin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === action.provider.plugin_id);
    return plugin && !plugin.personal ? plugin.project_plugin_id : null;
  };
  const read = async (caller: ActionCallContext): Promise<ReadonlySet<string>> => {
    if (!caller.project_id) return new Set();
    return withCatalog({ homeDirectory }, catalog => {
      try { return availableProjectPluginIds(catalog.listProjectPlugins(caller.project_id!)); }
      catch (error) {
        // Deleted or standalone projects have no catalog installation; never crash MCP discovery or grant access.
        if ((error as { code?: string })?.code === "catalog.project_not_found") return new Set<string>();
        throw error;
      }
    });
  };
  const state = (enabled: boolean): ActionAvailability => enabled ? { available: true }
    : { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  const live = (caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability | Promise<ActionAvailability> => {
    const pluginId = projectPlugin(action);
    return pluginId ? read(caller).then(enabled => state(enabled.has(pluginId))) : { available: true };
  };
  return Object.assign(live, { snapshotForDiscovery: async (caller: ActionCallContext) => {
    const enabled = await read(caller);
    return (_caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability => {
      const pluginId = projectPlugin(action);
      return state(!pluginId || enabled.has(pluginId));
    };
  } });
}
