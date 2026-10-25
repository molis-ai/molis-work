import type { ProjectDataDeclaration, ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { PAGES_DATABASE, PAGES_HOME_STORE } from "./store.js";

/**
 * The project is deleted: its documents and folders go, with the generation and import receipts and the edits that
 * could still be taken back. Works on the library's file, so any process on the Home can run it; running it again
 * finds nothing.
 */
export function purgePagesProject(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, PAGES_HOME_STORE.path, PAGES_DATABASE, (db) => {
    control?.assertCurrent();
    db.prepare("DELETE FROM page_changes WHERE page_id IN (SELECT id FROM pages WHERE project_id = ?)").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM pages WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM folders WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM page_generations WHERE project_id = ?").run(projectId);
    control?.assertCurrent();
    db.prepare("DELETE FROM page_imports WHERE project_id = ?").run(projectId);
  }, control);
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const pagesProjectData: ProjectDataDeclaration = { label: "Pages 文稿与文件夹", order: 10, purge: purgePagesProject };
