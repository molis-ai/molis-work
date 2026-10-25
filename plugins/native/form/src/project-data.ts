import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { FORM_DATABASE, FORM_HOME_STORE } from "./store.js";

/**
 * The project is deleted: its forms go with every answer people gave them, and the receipts of copies made into it.
 * Works on the library's file, so any process on the Home can run it; running it again finds nothing.
 */
export function purgeFormProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, FORM_HOME_STORE.path, FORM_DATABASE, (db) => {
    control?.assertCurrent();
    db.prepare("DELETE FROM submissions WHERE form_id IN (SELECT id FROM forms WHERE project_id = ?)").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM forms WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM form_copies WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const formProjectData: ProjectDataDeclaration = { label: "Forms 问卷及收到的全部回答", order: 20, purge: purgeFormProject };
