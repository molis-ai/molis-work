import {installProjectReplicationJournal} from '@molis-ai/molis-work-module-projects';
import {replicaSchemaSql,replicaMarkSql,initializeReplica,namespacedReplicaDatabase,borrowedReplicaDatabase,type SqliteDatabase,type ReplicaInputValue} from '@molis-ai/molis-work-storage';
import {PERSONAL_SPACE_PROJECT_ID} from './personal-space.js';

export const projectCatalogJournal=(db:SqliteDatabase)=>namespacedReplicaDatabase(borrowedReplicaDatabase({exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[]>(sql)}),'project_catalog');
/** Fresh catalog baseline only. Normal opens never create tables or restore missing journal state. */
export function createProjectCatalogReplicationSchema(db:SqliteDatabase,personal:boolean){
  db.exec(replicaSchemaSql('project_catalog'));initializeReplica(projectCatalogJournal(db));
  installProjectReplicationJournal(db,(key,condition)=>replicaMarkSql(key,personal?`(${condition}) AND ${key}<>'${PERSONAL_SPACE_PROJECT_ID.replaceAll("'","''")}'`:'0=1').replace(/\breplica_/g,'project_catalog_replica_'));
}
