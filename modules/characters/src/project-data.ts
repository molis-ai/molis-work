import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import { applySqliteBaseline } from "@molis-ai/molis-work-storage";
import { CHARACTERS_HOME_STORE, CHARACTERS_STORE_BASELINE } from "./open.js";

/**
 * The project is deleted: the native runs Characters recorded in it go, whoever launched them. The drafts are the person's
 * and name no project, so they stay. Works on the library's file, so any process on the Home can run it; a Home with no
 * library has nothing to clear and gets none, a store at another version is refused like anywhere else, and running it again
 * finds nothing.
 */
export function purgeCharactersProject(homeDirectory: string, projectId: string): void {
  const filename = join(homeDirectory, CHARACTERS_HOME_STORE.path, CHARACTERS_HOME_STORE.library.file);
  if (!existsSync(filename)) return;
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    applySqliteBaseline(db, filename, CHARACTERS_STORE_BASELINE);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM character_runs WHERE project_id = ?").run(projectId);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

/** What this module keeps in the Home for a project and how the project's deletion clears it. Not a plugin, so the Host lists it by hand. */
export const charactersProjectData: ProjectDataDeclaration = { label: "角色在这个项目里的执行记录", order: 110, purge: purgeCharactersProject };
