import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

/** A project made without Goals: a new project has none (PEQ-12), so this only names the intent. */
export async function createProjectWithoutGoals(home: string, name = "没有 Goals") {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try { return await catalog.createProject({ display_name: name, actor_id: "browser-test" }); } finally { catalog.close(); }
}
