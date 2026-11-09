import { projectReplicationTriggers } from './project-replication-triggers.js';
import type {ReplicaInputValue,ReplicaOutputValue} from "@molis-ai/molis-work-storage";
import type {ReplicaDatabase} from "@molis-ai/molis-work-storage";
import { catalogErrors } from "./project-catalog-contract.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { shareReplicaTriggerDefinitions, applySqliteBaseline, LocalSqliteStorage, checkSqliteBaselineVersion, ensureStorageSpace, bindDatabaseSpace, readDatabaseSpace, readStorageSpace, type StorageSpace } from "@molis-ai/molis-work-storage";
import pathUtil from 'node:path';
import fs from 'node:fs';
import { existsSync } from "node:fs";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { openProjectPluginDatabases, type ProjectPluginDatabaseOutcome } from "./project-plugin-databases.js";
import { artifactRowLibraryDeclarations, assertArtifactLibraryReady, assertArtifactProjectIdentity } from "./artifact-row-storage-policy.js";
import { projectDatabases } from "./platform-upgrade-stores.js";

/** A project database recovery cannot open: gone, or at another schema version than this build's baseline. */


/**
 * One local connection at the project database baseline, with the built-in plugins' own tables opened on it. Goals' facts are not
 * read through it: they are Goals' own, asked of its actions. Recovery (`existingOnly`) opens a library already at this version and leaves its plugins' tables as
 * they are.
 */
export class LocalProjectDatabase extends LocalSqliteStorage {
  readonly replicationDatabase:ReplicaDatabase;
  /** What happened to each built-in plugin's tables when this library opened; a refused one stops only that plugin. */
  readonly pluginDatabases: ReadonlyMap<string, ProjectPluginDatabaseOutcome>;

  constructor(path: string, options: { existingOnly?: boolean } = {}) {
    const home = managedProjectHome(path);
    const candidateHome = home && pathUtil.basename(path) === "molis-work.db" && artifactRowLibraryDeclarations().length > 0 ? fs.realpathSync(home) : undefined;
    if (candidateHome) {
      path = pathUtil.join(candidateHome, "projects", pathUtil.basename(pathUtil.dirname(path)), "molis-work.db");
      assertArtifactLibraryReady(path);
    }
    const space = candidateHome && existsSync(path) ? readStorageSpace(candidateHome) : null;
    // Provision and validate staging in the original mode. Only a live Catalog path can join the project/Home transaction.
    const project = candidateHome && space && projectDatabases(candidateHome, space).includes(pathUtil.relative(candidateHome, path))
      ? { space, id: pathUtil.basename(pathUtil.dirname(path)) } : undefined;
    super(inspectDatabase(path, options.existingOnly ?? false, home, project), { fileMustExist: options.existingOnly, journalMode: project ? "preserve" : undefined });
    this.replicationDatabase = {exec: sql => this.db.exec(sql), prepare: sql => this.db.prepare<ReplicaInputValue[], Record<string, ReplicaOutputValue>>(sql)};
    shareReplicaTriggerDefinitions(this.db, this.replicationDatabase);
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      projectReplicationTriggers(this.db);
      this.pluginDatabases = options.existingOnly ? new Map() : openProjectPluginDatabases(this.db, path);
      if (home) bindDatabaseSpace(this.db, ensureStorageSpace(home));
      if (project) {
        this.db.pragma("synchronous=EXTRA");
        if (this.db.pragma("journal_mode=DELETE", { simple: true }) !== "delete") throw new ActionError("actions.service_unavailable", "项目库的回滚日志模式暂不可用");
      }
    } catch (error) { this.close(); throw error; }
  }
}

function managedProjectHome(path: string): string | undefined {
  const candidate = pathUtil.resolve(pathUtil.dirname(path), '../..');
  // Standalone libraries never borrow the process default Home.
  return pathUtil.basename(pathUtil.dirname(pathUtil.dirname(path))) === 'projects'
    && fs.existsSync(pathUtil.join(candidate, 'storage-space.json')) ? candidate : undefined;
}

/** Reject before a writable connection can change journal mode; the normal baseline still rechecks after opening. */
function inspectDatabase(path: string, existingOnly: boolean, home?: string, project?: { space: StorageSpace; id: string }): string {
  if (!existingOnly && !existsSync(path)) return path;
  const inspection = new LocalSqliteStorage(path, { readonly: true });
  try {
    // Reject an existing foreign binding before the writable connection can change WAL or schema, at any version.
    // Reading validates the row and its descriptor; with an existing row the shared binding check performs no write.
    if (home && readDatabaseSpace(inspection.db)) bindDatabaseSpace(inspection.db, ensureStorageSpace(home));
    // Inspect through the project owner's driver so closing another SQLite engine cannot release its locks.
    const { user_version: version } = inspection.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (existingOnly && version !== PROJECT_DATABASE_BASELINE.version) throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
    if (!existingOnly) checkSqliteBaselineVersion(inspection.db, path, PROJECT_DATABASE_BASELINE, home);
    if (project) assertArtifactProjectIdentity(inspection.db, project.space, project.id);
    if (version === PROJECT_DATABASE_BASELINE.version) projectReplicationTriggers(inspection.db);
    return path;
  } finally { inspection.close(); }
}
