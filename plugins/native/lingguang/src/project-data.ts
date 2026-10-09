import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { LINGGUANG_STORE_BASELINE } from "./store.js";

/**
 * The project is deleted: its sparks go with their conversations, the messages in them and the request receipts. Works
 * on the library's file, so any process on the Home can run it; running it again finds nothing.
 */
export function purgeLingguangProject(homeDirectory: string, projectId: string): void {
  clearInExistingHomeSqlite(homeDirectory, "lingguang", LINGGUANG_STORE_BASELINE, (db) => {
    db.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM conversations WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM spark_requests WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM sparks WHERE project_id = ?").run(projectId);
  });
}

/** What this package keeps in the Home for a project and how the project's deletion clears it; the Host reads it from the catalog. */
export const lingguangProjectData: ProjectDataDeclaration = { label: "灵光里的想法与对话", order: 80, purge: purgeLingguangProject };
