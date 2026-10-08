import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { TODO_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: the todos placed in it go with their history, request receipts, what the organizer remembered
 * about them and its review batches. Personal todos name no project and stay. Works on the library's file, so any
 * process on the Home can run it; running it again finds nothing.
 */
export function purgeTodoProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "todo", TODO_STORE_BASELINE, (db) => {
    const items = "SELECT id FROM todo_items WHERE project_id = ?";
    db.prepare(`DELETE FROM todo_changes WHERE item_id IN (${items})`).run(projectId);
    db.prepare(`DELETE FROM todo_requests WHERE item_id IN (${items})`).run(projectId);
    db.prepare(`DELETE FROM todo_source_memory WHERE item_id IN (${items})`).run(projectId);
    db.prepare("DELETE FROM todo_batches WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM todo_items WHERE project_id = ?").run(projectId);
  });
}
