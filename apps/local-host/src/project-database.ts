import type {ReplicaInputValue,ReplicaOutputValue} from "@molis-ai/molis-work-storage";
import type {ReplicaDatabase} from "@molis-ai/molis-work-storage";
import { catalogErrors } from "./project-catalog-contract.js";
import { shareReplicaTriggerDefinitions, applySqliteBaseline, LocalSqliteStorage, SqliteSchemaVersionError, ensureStorageSpace, bindDatabaseSpace, namespacedReplicaDatabase, initializeReplica, replicaMarkSql, queueReplicaChange } from "@molis-ai/molis-work-storage";
import { installArtifactReplicationJournal, installProcessItemReplicationJournal } from '@molis-ai/molis-work-module-artifacts';
import { installProjectGoalReplication } from './project-replication.js';
import pathUtil from 'node:path';
import fs from 'node:fs';
import { createGoalReadServices } from "@molis-ai/molis-work-module-goals";
import { createGovernanceReadServices } from "@molis-ai/molis-work-module-governance-collaboration";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { readMolisWorkSnapshot, type BoardSnapshot, type MolisWorkSnapshotPorts } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { installPersonalProjectPluginReplication } from "./project-content-replication.js";
import { openProjectPluginDatabases, projectPluginDatabaseRefusal, type ProjectPluginDatabaseOutcome } from "./project-plugin-databases.js";

/** A project database recovery cannot open: gone, or at another schema version than this build's baseline. */


/**
 * One local connection at the project database baseline, with the built-in plugins' own tables opened on it, and public read
 * services for a Project. Recovery (`existingOnly`) opens a library already at this version and leaves its plugins' tables as
 * they are.
 */
export class LocalProjectDatabase extends LocalSqliteStorage {
  readonly replicationDatabase:ReplicaDatabase;
  readonly goalsQuery: GoalsQueryApi;
  /** What happened to each built-in plugin's tables when this library opened; a refused one stops only that plugin. */
  readonly pluginDatabases: ReadonlyMap<string, ProjectPluginDatabaseOutcome>;
  private readonly snapshotQueries: MolisWorkSnapshotPorts;

  constructor(path: string, options: { existingOnly?: boolean } = {}) {
    super(options.existingOnly ? inspectExistingDatabase(path) : inspectCurrentDatabase(path), { fileMustExist: options.existingOnly });
    this.replicationDatabase = {exec: sql => this.db.exec(sql), prepare: sql => this.db.prepare<ReplicaInputValue[], Record<string, ReplicaOutputValue>>(sql)};
    shareReplicaTriggerDefinitions(this.db, this.replicationDatabase);
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      this.pluginDatabases = options.existingOnly ? new Map() : openProjectPluginDatabases(this.db, path);
      // Managed projects inherit their Home even when opened by CLI/background code.
      const candidate=pathUtil.resolve(pathUtil.dirname(path),'../..');
      // Standalone fixtures/inspection paths are not implicitly assigned to the
      // process default Home. Only managed project paths have an owning Home.
      if (pathUtil.basename(pathUtil.dirname(pathUtil.dirname(path)))==='projects' && fs.existsSync(pathUtil.join(candidate,'storage-space.json'))) {
        const space=ensureStorageSpace(candidate);bindDatabaseSpace(this.db,space);
        if(space.kind==='personal'){
          const available=(id:string)=>!projectPluginDatabaseRefusal(this.db,id);
          if(available('io.molis.work.goals'))installProjectGoalReplication(this.replicationDatabase);
          const managedProjectId=pathUtil.basename(pathUtil.dirname(path));
          // Newly created projects use a temporary staging directory before their final ID path exists.
          if(!managedProjectId.startsWith('.staging-'))installPersonalProjectPluginReplication(this.replicationDatabase, managedProjectId, available);
          const ledger=namespacedReplicaDatabase(this.replicationDatabase,'artifacts');initializeReplica(ledger);
          installArtifactReplicationJournal(this.db,key=>replicaMarkSql(key).replace(/\breplica_/g,'artifacts_replica_'),(project,id)=>queueReplicaChange(ledger,JSON.stringify([project,'artifact',id])));
          const processLedger=namespacedReplicaDatabase(this.replicationDatabase,'process_items');initializeReplica(processLedger);
          installProcessItemReplicationJournal(this.db,key=>replicaMarkSql(key).replace(/\breplica_/g,'process_items_replica_'),(project,id)=>queueReplicaChange(processLedger,JSON.stringify([project,'process_item',id])));
        }
      }
      const goals = createGoalReadServices(this.db);
      const governance = createGovernanceReadServices(this.db);
      this.goalsQuery = goals.query;
      this.snapshotQueries = { goals: goals.query, governance: governance.query };
    } catch (error) { this.close(); throw error; }
  }

  snapshot(projectId: string): BoardSnapshot {
    return readMolisWorkSnapshot(this.snapshotQueries, projectId);
  }
}

/** Check the current baseline before the writable connection can change journal mode or bind ownership. */
function inspectCurrentDatabase(path:string):string{
 if(!fs.existsSync(path))return path;
 const inspection=new LocalSqliteStorage(path,{readonly:true});
 try{
  const row=inspection.db.prepare('PRAGMA user_version').get() as {user_version:number};
  const empty=!inspection.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='molis_storage_space' LIMIT 1").get();
  if(row.user_version!==PROJECT_DATABASE_BASELINE.version&&(row.user_version!==0||!empty))throw new SqliteSchemaVersionError(path,row.user_version,PROJECT_DATABASE_BASELINE.version);
  return path;
 }finally{inspection.close();}
}

/** Recovery opens only a database already at this build's version, and changes nothing before it knows. */
function inspectExistingDatabase(path: string): string {
  const inspection = new LocalSqliteStorage(path, { readonly: true });
  try {
    const { user_version: version } = inspection.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version !== PROJECT_DATABASE_BASELINE.version) throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
    return path;
  } finally { inspection.close(); }
}
