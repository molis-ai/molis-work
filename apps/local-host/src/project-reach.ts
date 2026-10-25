import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginProjectReach } from "@molis-ai/molis-work-plugin-runtime";
import { pluginCatalogFor } from "./home-side.js";
import { pluginReachable, projectReachablePlugins } from "./project-action-availability.js";

/**
 * The projects the person may reach through a Home-level plugin (PG-014, S-70): the projects in the catalog right now (a deleted or
 * deleting project has no row) in which the plugin is shown, with the one judgement actions and routes read (`projectReachablePlugins`, so a
 * project that hides the plugin is not in it). Read on every call, never kept. Only the local person gets one; the plugin runtime has
 * already checked the rest (the action declares `project_reach`, the installation holds `projects:reach`, the audience is `user`).
 * Projects the plugin has no catalog entry in (a plugin from outside the build) are listed whole: nothing can be hidden from it by name.
 */
export function homeProjectReach(home: string): PluginProjectReach {
  return async (manifest, context) => {
    if (context.actor_id !== LOCAL_PERSON_ACTOR_ID) return undefined;
    const catalog = pluginCatalogFor(home);
    if (!catalog) return undefined;
    const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === manifest.plugin_id);
    return catalog({ homeDirectory: home }, projects => projects.listProjects()
      .filter(project => !entry || pluginReachable(entry, projectReachablePlugins(projects, project.project_id)))
      .map(project => project.project_id));
  };
}
