import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { TODO_DATABASE, TODO_HOME_STORE } from "./store.js";

/**
 * The project is deleted: the todos placed in it go with their history, request receipts, what the organizer remembered
 * about them and its review batches. Personal todos name no project and stay. Works on the library's file, so any
 * process on the Home can run it; running it again finds nothing.
 */
export function purgeTodoProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, TODO_HOME_STORE.path, TODO_DATABASE, (db) => {
    const items = "SELECT id FROM todo_items WHERE project_id = ?";
    control?.assertCurrent();
    db.prepare(`DELETE FROM todo_changes WHERE item_id IN (${items})`).run(projectId);
    control?.assertCurrent();
    db.prepare(`DELETE FROM todo_requests WHERE item_id IN (${items})`).run(projectId);
    control?.assertCurrent();
    db.prepare(`DELETE FROM todo_source_memory WHERE item_id IN (${items})`).run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM todo_batches WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM todo_items WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const todoProjectData: ProjectDataDeclaration = { label: "放在这个项目里的待办", order: 60, purge: purgeTodoProject };
