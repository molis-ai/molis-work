import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { FUNCTIONS_STORE_BASELINE } from "./store-schema.js";

/**
 * The project is deleted: the rules it bound to its scenes and every judgment made there go. The functions
 * themselves are the person's and stay. Works on the library's file, so any process on the Home can run it; running it
 * again finds nothing.
 */
export function purgeFunctionsProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, "functions", FUNCTIONS_STORE_BASELINE, (db) => {
    control?.assertCurrent();
    db.prepare("DELETE FROM function_scene_bindings WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM function_judgments WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this module keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the Host lists it by hand. */
export const functionsProjectData: ProjectDataDeclaration = { label: "判断规则在这个项目里的场景绑定和判断记录", order: 70, purge: purgeFunctionsProject };
