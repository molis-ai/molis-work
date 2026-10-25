import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { PPT_DATABASE, PPT_HOME_STORE } from "./store.js";

/**
 * The project is deleted: its presentations go with the receipts of copies made into it. Works on the library's file,
 * so any process on the Home can run it; running it again finds nothing.
 */
export function purgePptProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, PPT_HOME_STORE.path, PPT_DATABASE, (db) => {
    control?.assertCurrent();
    db.prepare("DELETE FROM presentations WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM presentation_copies WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const pptProjectData: ProjectDataDeclaration = { label: "PPT 演示稿", order: 40, purge: purgePptProject };
