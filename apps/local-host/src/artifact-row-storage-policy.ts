import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots, partitionRootsOnDisk } from "@molis-ai/molis-work-module-projects";
import { homeSqlitePath, readDatabaseSpace, sqliteRollbackSidecars, pendingSqliteRecovery, type SqliteDatabase, type StorageSpace } from "@molis-ai/molis-work-storage";

export const wrongArtifactSpace = () => new ActionError("actions.home_mismatch", "成果固定的库与当前 Home 空间不一致");

/** The library holds exactly this project's root row: a copy registered under another project id cannot change its journal mode. */
export function assertArtifactProjectRoot(db: SqliteDatabase, project: string): void {
  const roots = listProjectRoots(db);
  if (roots.length !== 1 || roots[0]?.project_id !== project) throw pendingSqliteRecovery();
}

/** Recovery replays only a library already bound to this Home's space; an ordinary open binds an unbound one first (`bindDatabaseSpace`). */
export function assertArtifactProjectIdentity(db: SqliteDatabase, space: StorageSpace, project: string): void {
  if (JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
  assertArtifactProjectRoot(db, project);
}

/** Filesystem-only detection works before Catalog inspection and on an opaque restore target. These names confer no recovery authority. */
export function homeLibraryRollbackSidecars(root: string, libraries: readonly string[], registeredProjects?: readonly string[]): string[] {
  const found = libraries.flatMap(name => sqliteRollbackSidecars(homeSqlitePath(root, name)));
  if (registeredProjects) return [...found, ...registeredProjects.flatMap(path => sqliteRollbackSidecars(join(root, path)))];
  for (const partition of partitionRootsOnDisk(root)) found.push(...sqliteRollbackSidecars(join(partition, "molis-work.db")));
  return found;
}
