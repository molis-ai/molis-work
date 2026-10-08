import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { WORKFLOWS_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: its workflows go, the hidden ones too, with every instance that ran them. Works on the
 * library's file, so any process on the Home can run it; running it again finds nothing.
 */
export function purgeWorkflowsProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "workflows", WORKFLOWS_STORE_BASELINE, (db) => {
    db.prepare("DELETE FROM instances WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM workflows WHERE project_id = ?").run(projectId);
  });
}
