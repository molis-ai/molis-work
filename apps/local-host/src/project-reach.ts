import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionRegistryPort, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginProjectReach } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { capabilityCatalog, type ProjectActions } from "./plugin-builder/catalog.js";
import { pluginCatalogFor } from "./home-side.js";
import { pluginReachable, projectReachablePlugins, reachEntry } from "./project-action-availability.js";
import { homePluginsOutsideBuild } from "./home-registration.js";

interface ProjectReachActions {
  actionRegistry(reference: LocalHostProjectReference): ActionRegistryPort;
  actionClient(reference: LocalHostProjectReference): ActionClient;
  inspectActions(caller: ActionCallContext, reference: LocalHostProjectReference): Promise<readonly ActionView[]> | readonly ActionView[];
  homeActionClient(): ActionClient;
  projectPluginReach(projectId: string): Promise<(pluginId: string) => boolean | undefined>;
}

interface ProjectReachHome {
  projects(): LocalHostStatus["projects"];
  actionRegistry(): ActionRegistryPort;
  inspectActions(caller: ActionCallContext): Promise<readonly ActionView[]> | readonly ActionView[];
}

type ProjectReference = (input: { projectId: string; databasePath: string }) => LocalHostProjectReference;

/** Resolve a Home package's triggering project only while that project still reaches this plugin. */
export async function homePackageProjectActions(projectId: string, pluginId: string, homeDirectory: string | undefined,
  catalog: LocalWebCatalogRunner | undefined, actions: ProjectReachActions, homeHost: ProjectReachHome, projectReference: ProjectReference): Promise<ProjectActions> {
  if (!catalog) throw new ActionError("actions.unavailable", "项目目录尚未就绪");
  const project = await catalog({ homeDirectory }, catalog => catalog.getProject(projectId));
  if (homeHost.projects().some(item => item.project_id === projectId && item.state === "closing") || !(await actions.projectPluginReach(projectId))(pluginId)) {
    throw new ActionError("actions.forbidden", "项目已关闭或不再启用这个 Home 插件");
  }
  const reference = projectReference({ projectId, databasePath: project.database_path });
  return { project_id: projectId, registry: actions.actionRegistry(reference), client: actions.actionClient(reference), inspect: caller => actions.inspectActions(caller, reference) };
}

/** The person's consent view combines Home actions with the project's distinct capabilities. */
export async function projectReachDetails(projectId: string, homeDirectory: string | undefined, catalog: LocalWebCatalogRunner | undefined,
  actions: ProjectReachActions, homeHost: ProjectReachHome, projectReference: ProjectReference) {
  if (!catalog) throw new ActionError("actions.unavailable", "项目目录尚未就绪");
  const project = await catalog({ homeDirectory }, catalog => catalog.getProject(projectId));
  const reference = projectReference({ projectId, databasePath: project.database_path });
  const [home, scoped] = await Promise.all([
    capabilityCatalog({ project_id: null, registry: homeHost.actionRegistry(), client: actions.homeActionClient(), inspect: caller => homeHost.inspectActions(caller) }, LOCAL_PERSON_ACTOR_ID),
    capabilityCatalog({ project_id: projectId, registry: actions.actionRegistry(reference), client: actions.actionClient(reference), inspect: caller => actions.inspectActions(caller, reference) }, LOCAL_PERSON_ACTOR_ID),
  ]);
  return { project_name: project.display_name, capabilities: [...home, ...scoped.filter(entry => entry.scope === "project" && !home.some(item => item.id === entry.id))] };
}

/**
 * The projects the person may reach through a Home-level plugin (PG-014, S-74): the projects in the catalog right now, excluding those
 * the Host is closing, in which the plugin is shown, with the one judgement actions and routes read (`projectReachablePlugins`, so a
 * project that hides the plugin is not in it). Read on every call, never kept. Only the local person gets one; the plugin runtime has
 * already checked the rest (the action declares `project_reach`, the installation holds `projects:reach`, the audience is `user`).
 * A personal Home plugin outside the build is judged the same way by its plugin id (#679); any other plugin with no catalog entry is
 * given every project: nothing can be hidden from it by name.
 * A catalog project need not have an open runtime: only the Host's explicit closing entries exclude it.
 */
export function homeProjectReach(home: string, currentProjects: () => LocalHostStatus["projects"]): PluginProjectReach {
  return async (manifest, context) => {
    if (context.actor_id !== LOCAL_PERSON_ACTOR_ID) return undefined;
    const catalog = pluginCatalogFor(home);
    if (!catalog) return undefined;
    const entry = reachEntry(home, manifest.plugin_id), outsideBuild = homePluginsOutsideBuild(home);
    return catalog({ homeDirectory: home }, projects => {
      const closing = new Set(currentProjects().filter(project => project.state === "closing").map(project => project.project_id));
      return projects.listProjects()
        .filter(project => !closing.has(project.project_id) && (!entry || pluginReachable(entry, projectReachablePlugins(projects, project.project_id, outsideBuild))))
        .map(project => project.project_id);
    });
  };
}
