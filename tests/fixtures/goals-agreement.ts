import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

/** A project made without Goals: a new project has none (PEQ-12), so this only names the intent. */
export async function createProjectWithoutGoals(home: string, name = "没有 Goals", plugins: readonly string[] = []) {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: name, actor_id: "browser-test" });
    for (const plugin_id of plugins) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "browser-test" });
    return project;
  } finally { catalog.close(); }
}
