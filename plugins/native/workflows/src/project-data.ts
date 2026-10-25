import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { WORKFLOWS_DATABASE, WORKFLOWS_HOME_STORE } from "./store.js";

/**
 * The project is deleted: its workflows go, the hidden ones too, with every instance that ran them. Works on the
 * library's file, so any process on the Home can run it; running it again finds nothing.
 */
export function purgeWorkflowsProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, WORKFLOWS_HOME_STORE.path, WORKFLOWS_DATABASE, (db) => {
    control?.assertCurrent();
    db.prepare("DELETE FROM instances WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM workflows WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const workflowsProjectData: ProjectDataDeclaration = { label: "工作流程及其运行记录", order: 50, purge: purgeWorkflowsProject };
