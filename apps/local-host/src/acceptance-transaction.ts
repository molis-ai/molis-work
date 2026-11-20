import { realpathSync } from "node:fs";
import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_HOME_STORE, openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { listProjectRoots, projectDatabasePath } from "@molis-ai/molis-work-module-projects";
import { homeSqlitePath, readDatabaseSpace, readStorageSpace, snapshotFileStat, withSqliteLibraryTransaction, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

const schema = "molis_acceptance";
const wrongLibrary = () => new ActionError("actions.home_mismatch", "认可决定的存储库与当前项目不一致");

/** The Host composes the two owners; Acceptance still owns every rule and SQL statement in its library. */
export function withAcceptanceTransaction<T>(home: string, projectId: string, db: SqliteDatabase, committed: () => void, write: (schema: string) => T): T {
  const root = realpathSync(home), path = homeSqlitePath(root, ACCEPTANCE_HOME_STORE.path);
  if (db.name !== projectDatabasePath(join(root, "projects"), projectId)) throw wrongLibrary();
  // Ordinary opening establishes the existing owner baseline, and refuses pending recovery before any SQLite open.
  openAcceptance(root).close();
  return withSqliteLibraryTransaction(db, {
    path, schema, identity: { database: snapshotFileStat(db.name), library: snapshotFileStat(path) }, committed,
    check() {
      const space = readStorageSpace(root), descriptor = JSON.stringify(space), roots = listProjectRoots(db);
      const stored = db.prepare<[], { space_id: string; descriptor: string }>(`SELECT space_id, descriptor FROM ${schema}.molis_storage_space WHERE singleton=1`).get();
      if (!space || JSON.stringify(readDatabaseSpace(db)) !== descriptor || stored?.space_id !== space.spaceId || stored.descriptor !== descriptor
        || roots.length !== 1 || roots[0]?.project_id !== projectId
        || db.pragma("main.user_version", { simple: true }) !== PROJECT_DATABASE_BASELINE.version
        || db.pragma(`${schema}.user_version`, { simple: true }) !== ACCEPTANCE_HOME_STORE.library!.baseline.version) throw wrongLibrary();
    },
  }, () => write(schema));
}
