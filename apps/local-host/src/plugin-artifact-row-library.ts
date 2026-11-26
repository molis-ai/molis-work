import { lstatSync, realpathSync, type Stats } from "node:fs";
import { resolve } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots, partitionDatabasePath, partitionRoot } from "@molis-ai/molis-work-module-projects";
import { homeSqlitePath, readDatabaseSpace, readStorageSpace, snapshotFileStat, withSqliteLibraryTransaction, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { ARTIFACT_HOME_SCHEMA, boundArtifactRootRow, type artifactRowReplication } from "./plugin-artifact-row-sql.js";
import type { ArtifactRootStore } from "./plugin-artifact-row-transaction.js";
import type { ProjectArtifactRoot } from "./plugin-artifact-root.js";
import type { ProjectLibrary } from "./plugin-project-library.js";
import { partitionLibraryPath } from "./partition-plugin-assembly.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

export interface ArtifactHomeLibrary {
  readonly home: string;
  readonly storeName: string;
  readonly path: string;
  readonly identity: Stats;
  readonly version: number;
  readonly readPermission: string;
  readonly writePermission: string;
  readonly root: ProjectArtifactRoot;
  readonly triggers: ReadonlyMap<string, string>;
  readonly replication: ReturnType<typeof artifactRowReplication>;
  /** The partition whose own library this is (`databases.partition`); absent for a Home library shared by every project. */
  readonly partition_id?: string;
}

const attached = ARTIFACT_HOME_SCHEMA;
const wrongLibrary = () => new ActionError("actions.forbidden", "成果固定需要同一个 Home 中登记的项目库和插件库");

function assertSpace(db: SqliteDatabase, library: ArtifactHomeLibrary, projectId: string): void {
  const space = readStorageSpace(library.home);
  const descriptor = JSON.stringify(space);
  const roots = listProjectRoots(db);
  const stored = db.prepare<[], { space_id: string; descriptor: string }>(`SELECT space_id, descriptor FROM ${attached}.molis_storage_space WHERE singleton=1`).get();
  if (!space || JSON.stringify(readDatabaseSpace(db)) !== descriptor || stored?.space_id !== space.spaceId || stored.descriptor !== descriptor
    || roots.length !== 1 || roots[0]?.project_id !== projectId
    || db.pragma("main.user_version", { simple: true }) !== PROJECT_DATABASE_BASELINE.version
    || db.pragma(`${attached}.user_version`, { simple: true }) !== library.version) throw wrongLibrary();
}

/** The project artifact owner and the joined transaction use exactly the same connection. */
export function artifactRootStore(project: ProjectLibrary, library: ArtifactHomeLibrary, projectId: string): ArtifactRootStore | undefined {
  const db = project.journal?.writer.db;
  const path = partitionDatabasePath(library.home, projectId);
  // A partition's own library joins only its own partition's main database; a Home library is the one file at the Home's store.
  const libraryPath = library.partition_id === undefined ? homeSqlitePath(library.home, library.storeName)
    : library.partition_id === projectId ? partitionLibraryPath(partitionRoot(library.home, projectId), library.storeName) : undefined;
  if (!db || db !== project.db || project.journal?.project_id !== projectId || !project.path || project.path === ":memory:"
    || !lstatSync(project.path).isFile() || realpathSync(project.path) !== path || resolve(db.name) !== resolve(project.path)
    || library.path !== libraryPath) return undefined;
  const projectFile = snapshotFileStat(path);
  return {
    readPermission: library.readPermission,
    writePermission: library.writePermission,
    transaction(id, run) {
      withSqliteLibraryTransaction(db, {
        path: library.path, schema: attached, identity: { database: projectFile, library: library.identity },
        check: () => assertSpace(db, library, projectId),
      }, () => run(boundArtifactRootRow(db, library.root, library.triggers, library.replication, projectId, id)));
    },
  };
}
