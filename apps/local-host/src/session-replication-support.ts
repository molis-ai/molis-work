import type {SessionReplicationSupport} from '@molis-ai/molis-work-module-private-work-context';
import {replicaSchemaSql,STORAGE_SPACE_SCHEMA_SQL,ensureStorageSpace,bindDatabaseSpace,readDatabaseSpace,borrowedReplicaDatabase,namespacedReplicaDatabase,initializeReplica,replicaMarkSql,createSqliteReplica,hasReplicaBodies,type ReplicaInputValue} from '@molis-ai/molis-work-storage';

/** Same current schema for normal and passive opens. No network or credential access during initialization. */
const sessionJournal=(db:Parameters<SessionReplicationSupport['open']>[0])=>namespacedReplicaDatabase(borrowedReplicaDatabase({exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[]>(sql)}),'work_sessions');
export function createSessionReplicationSupport():SessionReplicationSupport {
  return {schema:replicaSchemaSql('work_sessions')+STORAGE_SPACE_SCHEMA_SQL,hasProtectedData:db=>hasReplicaBodies(sessionJournal(db)),open(db,home,fresh){
    const space=ensureStorageSpace(home);if(!fresh&&!readDatabaseSpace(db))throw new Error('会话库的不可变空间记录缺失，原数据已保留');bindDatabaseSpace(db,space);
    const ledger=sessionJournal(db);
    if(space.kind==='personal')initializeReplica(ledger,fresh);
    return {
      spaceId:space.kind==='personal'?space.spaceId:null,
      markSql:(key,condition='1=1')=>replicaMarkSql(key,space.kind==='personal'?condition:'0=1').replace(/\breplica_/g,'work_sessions_replica_'),
      replica(owner){if(space.kind!=='personal')throw new Error('仅个人空间允许同步会话');return createSqliteReplica(ledger,owner);},
      hasProtectedData:()=>hasReplicaBodies(ledger),
    };
  }};
}
