import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginProjectReach } from "@molis-ai/molis-work-plugin-runtime";
import { pluginCatalogFor } from "./home-side.js";
import { pluginReachable, projectReachablePlugins, reachEntry } from "./project-action-availability.js";
import { homePluginsOutsideBuild } from "./home-registration.js";

/**
 * The projects the person may reach through a Home-level plugin (PG-014, S-70): the projects in the catalog right now (a deleted or
 * deleting project has no row) in which the plugin is shown, with the one judgement actions and routes read (`projectReachablePlugins`, so a
 * project that hides the plugin is not in it). Read on every call, never kept. Only the local person gets one; the plugin runtime has
 * already checked the rest (the action declares `project_reach`, the installation holds `projects:reach`, the audience is `user`).
 * A personal Home plugin outside the build is judged the same way by its plugin id (#679); any other plugin with no catalog entry is
 * given every project: nothing can be hidden from it by name.
 */
export function homeProjectReach(home: string): PluginProjectReach {
  return async (manifest, context) => {
    if (context.actor_id !== LOCAL_PERSON_ACTOR_ID) return undefined;
    const catalog = pluginCatalogFor(home);
    if (!catalog) return undefined;
    const entry = reachEntry(home, manifest.plugin_id), outsideBuild = homePluginsOutsideBuild(home);
    return catalog({ homeDirectory: home }, projects => projects.listProjects()
      .filter(project => !entry || pluginReachable(entry, projectReachablePlugins(projects, project.project_id, outsideBuild)))
      .map(project => project.project_id));
  };
}
