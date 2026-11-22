import { lstatSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { listProjectRoots, projectDatabasePath, projectDirectoryPath, stagedProjectDirectoryPath } from "@molis-ai/molis-work-module-projects";
import { openSqliteConnection } from "@molis-ai/molis-work-storage";
import { catalogErrors } from "./project-catalog-contract.js";

function requireProjectLibrary(projects: string, id: string, directory: string): void {
  const library = join(directory, basename(projectDatabasePath(projects, id)));
  if (!lstatSync(directory).isDirectory() || !lstatSync(library).isFile()) {
    throw catalogErrors.project_storage_invalid("托管目录或项目库不是本机普通目录和文件，已保留原件");
  }
  const db = openSqliteConnection(library, { readonly: true });
  try {
    const roots = listProjectRoots(db);
    if (roots.length !== 1 || roots[0]!.project_id !== id) throw catalogErrors.project_storage_invalid("暂存目录里的数据库不属于这个项目，已保留原件");
  } finally { db.close(); }
}

/** Called under the catalog writer before recording the deletion. The receipt names the stage before anything moves, so a stage
 * with no receipt is never this deletion's: it is left where it is. */
export function planProjectStage(projects: string, id: string): string {
  requireProjectLibrary(projects, id, projectDirectoryPath(projects, id));
  return stagedProjectDirectoryPath(projects, id, randomUUID());
}

/** A process exit after rename leaves the verified stage in place for the next sweep. */
export function stageProjectDirectory(projects: string, id: string, stage: string): void {
  const source = projectDirectoryPath(projects, id);
  if (lstatSync(stage, { throwIfNoEntry: false })) {
    if (lstatSync(source, { throwIfNoEntry: false })) throw catalogErrors.project_storage_invalid("原目录和暂存目录同时存在，已保留两处内容");
    requireProjectLibrary(projects, id, stage);
    return;
  }
  requireProjectLibrary(projects, id, source);
  renameSync(source, stage);
}
