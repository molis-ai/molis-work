import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { PPT_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: its presentations go with the receipts of copies made into it. Works on the library's file,
 * so any process on the Home can run it; running it again finds nothing.
 */
export function purgePptProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "ppt", PPT_STORE_BASELINE, (db) => {
    db.prepare("DELETE FROM presentations WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM presentation_copies WHERE project_id = ?").run(projectId);
  });
}
