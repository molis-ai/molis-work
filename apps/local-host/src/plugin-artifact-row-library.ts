import { lstatSync, realpathSync, type Stats } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots, projectDatabasePath } from "@molis-ai/molis-work-module-projects";
import { homeSqlitePath, readDatabaseSpace, readStorageSpace, snapshotFileStat, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { ARTIFACT_HOME_SCHEMA, boundArtifactRootRow, type artifactRowReplication } from "./plugin-artifact-row-sql.js";
import type { ArtifactRootStore } from "./plugin-artifact-row-transaction.js";
import type { ProjectArtifactRoot } from "./plugin-project-rows.js";
import type { ProjectLibrary } from "./plugin-project-library.js";
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
}

const attached = ARTIFACT_HOME_SCHEMA;
const busyTimeout = 100;
const wrongLibrary = () => new ActionError("actions.forbidden", "成果固定需要同一个 Home 中登记的项目库和插件库");
const wrongMode = () => new ActionError("actions.service_unavailable", "项目库和插件库尚未采用可原子固定成果的日志模式");
const sameNode = (a: Stats, b: Stats) => a.ino === b.ino && a.dev === b.dev;

function assertFiles(path: string, projectFile: Stats, home: ArtifactHomeLibrary): void {
  if (projectFile.dev !== home.identity.dev || sameNode(projectFile, home.identity)
    || !sameNode(projectFile, snapshotFileStat(path)) || !sameNode(home.identity, snapshotFileStat(home.path))) throw wrongLibrary();
}

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
  const path = projectDatabasePath(join(library.home, "projects"), projectId);
  if (!db || db !== project.db || project.journal?.project_id !== projectId || !project.path || project.path === ":memory:"
    || !lstatSync(project.path).isFile() || realpathSync(project.path) !== path || resolve(db.name) !== resolve(project.path)
    || library.path !== homeSqlitePath(library.home, library.storeName)) return undefined;
  const projectFile = snapshotFileStat(path);
  return {
    readPermission: library.readPermission,
    writePermission: library.writePermission,
    transaction(id, run) {
      if (db.inTransaction) throw wrongLibrary();
      assertFiles(path, projectFile, library);
      const databases = db.pragma("database_list") as Array<{ name: string; file: string }>;
      if (databases.some(row => row.name !== "main" && row.name !== "temp")
        || databases.find(row => row.name === "main")?.file !== path) throw wrongLibrary();
      if (db.pragma("main.journal_mode", { simple: true }) !== "delete" || db.pragma("main.synchronous", { simple: true }) !== 3) throw wrongMode();
      const url = pathToFileURL(library.path);
      url.searchParams.set("mode", "rw");
      const previousTimeout = db.pragma("busy_timeout", { simple: true });
      db.pragma(`busy_timeout=${busyTimeout}`);
      try {
        db.prepare(`ATTACH DATABASE ? AS ${attached}`).run(url.href);
        try {
          if (db.pragma(`${attached}.journal_mode`, { simple: true }) !== "delete") throw wrongMode();
          db.pragma(`${attached}.synchronous=EXTRA`);
          if (db.pragma(`${attached}.synchronous`, { simple: true }) !== 3) throw wrongMode();
          db.transaction(() => {
            assertFiles(path, projectFile, library);
            assertSpace(db, library, projectId);
            run(boundArtifactRootRow(db, library.root, library.triggers, library.replication, projectId, id));
            assertFiles(path, projectFile, library);
          }).immediate();
        } finally {
          try { db.exec(`DETACH DATABASE ${attached}`); }
          catch (error) { db.close(); throw error; }
        }
      } finally { if (db.open) db.pragma(`busy_timeout=${previousTimeout}`); }
    },
  };
}
