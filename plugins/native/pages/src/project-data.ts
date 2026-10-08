import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { PAGES_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: its documents and folders go, with the generation and import receipts and the edits that
 * could still be taken back. Works on the library's file, so any process on the Home can run it; running it again
 * finds nothing.
 */
export function purgePagesProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "pages", PAGES_STORE_BASELINE, (db) => {
    db.prepare("DELETE FROM page_changes WHERE page_id IN (SELECT id FROM pages WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM pages WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM folders WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM page_generations WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM page_imports WHERE project_id = ?").run(projectId);
  });
}
