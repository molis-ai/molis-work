import type Database from 'better-sqlite3';
import type {SyncReplicaAdapter,SyncLocalProtection,SyncConflictState,SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';

export interface SessionReplicaOwner {
  authorize():void;
  read(key:string):unknown|null;
  apply(key:string,value:unknown|null):void;
  canUpload?(key:string):boolean;
  locate?(key:string):string|null;
  belongsToProject?(key:string,projectId:string,retained:()=>readonly SyncMutation[]):boolean;
  conflictState:SyncConflictState;
  protection:SyncLocalProtection;
}
export interface SessionReplicaJournal {
  spaceId:string|null;
  /** SQL expressions originate only from this Module's constants, never payloads. */
  markSql(keyExpression:string,condition?:string):string;
  replica(owner:SessionReplicaOwner):SyncReplicaAdapter;
  hasProtectedData():boolean;
}
/** Trusted composition injects Storage technology; the Work Module does not depend on Storage or SDK. */
export interface SessionReplicationSupport {
  schema:string;
  /** Read-only technical predicate; must not initialize schema, state, Home or credentials. */
  hasProtectedData(db:Database.Database):boolean;
  open(db:Database.Database,home:string,fresh:boolean):SessionReplicaJournal;
}
export function installSessionReplicationJournal(db:Database.Database,journal:SessionReplicaJournal):void {
  for(const op of ['INSERT','UPDATE','DELETE']){
    const ref=op==='DELETE'?'OLD':'NEW';
    db.exec(`CREATE TRIGGER sessions_sync_${op.toLowerCase()} AFTER ${op} ON sessions BEGIN ${journal.markSql(ref+'.session_id')} END;`);
    for(const [table,column] of [['session_events','session_id'],['session_handoffs','source_session_id'],['session_messages','session_id']] as const){
      db.exec(`CREATE TRIGGER ${table}_sync_${op.toLowerCase()} AFTER ${op} ON ${table} BEGIN ${journal.markSql(ref+'.'+column,`EXISTS(SELECT 1 FROM sessions WHERE session_id=${ref}.${column})`)} END;`);
    }
  }
}
