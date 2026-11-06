import { projectReplicationTriggers } from './project-replication-triggers.js';
import type {ReplicaInputValue,ReplicaOutputValue} from "@molis-ai/molis-work-storage";
import type {ReplicaDatabase} from "@molis-ai/molis-work-storage";
import { catalogErrors } from "./project-catalog-contract.js";
import { shareReplicaTriggerDefinitions, applySqliteBaseline, LocalSqliteStorage, checkSqliteBaselineVersion, ensureStorageSpace, bindDatabaseSpace } from "@molis-ai/molis-work-storage";
import pathUtil from 'node:path';
import fs from 'node:fs';
import { existsSync } from "node:fs";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { openProjectPluginDatabases, type ProjectPluginDatabaseOutcome } from "./project-plugin-databases.js";

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
    super(inspectDatabase(path, options.existingOnly ?? false), { fileMustExist: options.existingOnly });
    this.replicationDatabase = {exec: sql => this.db.exec(sql), prepare: sql => this.db.prepare<ReplicaInputValue[], Record<string, ReplicaOutputValue>>(sql)};
    shareReplicaTriggerDefinitions(this.db, this.replicationDatabase);
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      projectReplicationTriggers(this.db);
      this.pluginDatabases = options.existingOnly ? new Map() : openProjectPluginDatabases(this.db, path);
      // Managed projects inherit their Home even when opened by CLI/background code.
      const candidate=pathUtil.resolve(pathUtil.dirname(path),'../..');
      // Standalone fixtures/inspection paths are not implicitly assigned to the
      // process default Home. Only managed project paths have an owning Home.
      if (pathUtil.basename(pathUtil.dirname(pathUtil.dirname(path)))==='projects' && fs.existsSync(pathUtil.join(candidate,'storage-space.json'))) {
        const space=ensureStorageSpace(candidate);bindDatabaseSpace(this.db,space);
      }
    } catch (error) { this.close(); throw error; }
  }
}

/** Reject before a writable connection can change journal mode; the normal baseline still rechecks after opening. */
function inspectDatabase(path: string, existingOnly: boolean): string {
  if (!existingOnly && !existsSync(path)) return path;
  const inspection = new LocalSqliteStorage(path, { readonly: true });
  try {
    // Inspect through the project owner's driver so closing another SQLite engine cannot release its locks.
    const { user_version: version } = inspection.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (existingOnly && version !== PROJECT_DATABASE_BASELINE.version) throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
    if (!existingOnly) checkSqliteBaselineVersion(inspection.db, path, PROJECT_DATABASE_BASELINE);
    if (version === PROJECT_DATABASE_BASELINE.version) projectReplicationTriggers(inspection.db);
    return path;
  } finally { inspection.close(); }
}
