import { projectDirectoryActions, type ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginActionClient } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The project's folders with their roles, read now through `projects.directories.get@1` (specs/shared-sources-and-surfaces §3). */
export async function projectFolders(api: PluginActionClient): Promise<ProjectDirectory[]> {
  return (await api.invoke(projectDirectoryActions.get, {})).directories;
}

/** The project's output: where a round that names no folder runs, and the only folder an Agent writes in (SSC-15, SSC-17). */
export async function outputFolder(api: PluginActionClient): Promise<ProjectDirectory | null> {
  return (await projectFolders(api)).find(folder => folder.roles.includes("output")) ?? null;
}
