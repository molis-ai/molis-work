import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ActionAvailability, ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Bundled plugins use the existing project installation record; Runtime plugins enforce their own grants. */
export function projectActionAvailability(withCatalog: LocalWebCatalogRunner, homeDirectory: string) {
  return (caller: ActionCallContext, action: Pick<ActionView, "provider">): ActionAvailability | Promise<ActionAvailability> => {
    const plugin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === action.provider.plugin_id);
    if (!plugin || plugin.personal) return { available: true };
    return Promise.resolve(caller.project_id && withCatalog({ homeDirectory }, catalog => {
      try { return availableProjectPluginIds(catalog.listProjectPlugins(caller.project_id!)).has(plugin.project_plugin_id); }
      catch (error) {
        // Deleted or standalone projects have no catalog installation; never crash MCP discovery or grant access.
        if ((error as { code?: string })?.code === "catalog.project_not_found") return false;
        throw error;
      }
    })).then(enabled => enabled ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" });
  };
}
