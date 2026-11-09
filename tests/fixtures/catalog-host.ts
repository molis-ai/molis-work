import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

type CatalogRunner = ReturnType<MolisWorkLocalHost["configurePersonalPlanning"]>;

/**
 * A project the Home catalog keeps, the way the product makes one: its plugins enabled and, when given, a folder as its output. Plugins that
 * read the project's folders do so through `projects.directories.get`, which only the catalog answers, so a Host without it has no folders.
 */
export async function catalogProject(home: string, options: { name?: string; plugins?: readonly string[]; output?: string } = {}) {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: options.name ?? "Fixture", actor_id: "web-user" });
    for (const plugin_id of options.plugins ?? []) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
    if (options.output) catalog.changeDirectories({ project_id: project.project_id, actor_id: "web-user",
      change: { kind: "set_output", target: { workspace_path: options.output } }, expected_revision: catalog.projectDirectories(project.project_id).revision });
    const output = catalog.listWorkspaceDirectory(project.project_id).find(item => options.output ? item.canonical_path === options.output : true);
    return { project, projectId: project.project_id, reference: molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }),
      workspace: output as ProjectWorkspaceRef };
  } finally { catalog.close(); }
}

/**
 * The Host's folder ports read from the catalog it is bound to: pass `ports` to the Host, then `attach(host)`. The Host holds the Home, so the
 * catalog is reached through the runner the Host hands back, as the web server does.
 */
export function catalogPorts(home: string) {
  let run: CatalogRunner | undefined;
  const runner = (): CatalogRunner => { if (!run) throw new Error("attach the catalog to the Host first"); return run; };
  return {
    ports: { workspacesFor: async (projectId: string) => runner()({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)) },
    attach(host: MolisWorkLocalHost) { run = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog); },
  };
}

/**
 * The folders a Host without a catalog is handed to read (`directoriesFor`): the first is the output, the rest are inputs. Such a Host answers
 * `projects.directories.get` from them and changes none.
 */
export function directoriesOf(workspaces: readonly ProjectWorkspaceRef[]) {
  return (projectId: string) => ({ project_id: projectId, source_links: [], revision: "fixture",
    directories: workspaces.map((workspace, index) => ({ ...workspace, roles: index === 0 ? ["input" as const, "output" as const] : ["input" as const], state: "ok" as const })) });
}
