import {SessionAssociationRepository} from './session-associations.js';
import type Database from 'better-sqlite3';
import type {ContextHistoryReplication,ContextLedgerApi} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import type {SyncReplicaAdapter,SyncConflictState,SyncLocalProtection} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SessionReplicationSupport} from './session-replication-journal.js';
import {openSessionOwnerDatabase} from './session-database.js';
import {sessionProjectChanges} from './session-sync-project.js';
import {readSessionSyncValue} from './session-sync-read.js';
import {applySessionSyncValue} from './session-sync-apply.js';
import {workSyncErrors as errors} from './session-sync-errors.js';

export interface WorkSessionReplicationOptions {
  home:string;spaceId:string;replication:SessionReplicationSupport;
  createLedger(db:Database.Database,initializeSchema:boolean):ContextLedgerApi;
  createReferences(db:Database.Database):ContextHistoryReplication;
  authorize():void;conflictState:SyncConflictState;protection:SyncLocalProtection;
}
/** Passive owner access: never opens the normal Registry, recovers a handoff, sends a message or discovers a runtime. */
export function withWorkSessionReplica<T>(options:WorkSessionReplicationOptions,run:(replica:SyncReplicaAdapter)=>T):T {
  options.authorize();
  if(typeof options.protection?.open!=='function'||typeof options.protection?.seal!=='function'||typeof options.conflictState!=='function')throw errors.sync_unavailable('会话同步缺少可信正文保护或比较端口');
  const opened=openSessionOwnerDatabase(options.home,options.replication,(db,_home,content,journal,fresh)=>{
    if(journal.spaceId!==options.spaceId)throw errors.sync_scope('会话库不属于当前个人空间');
    const ledger=options.createLedger(db,fresh),refs=options.createReferences(db);
    const key=(value:string)=>{options.authorize();if(typeof value!=='string'||!value.trim()||value.length>500)throw errors.sync_invalid('同步会话键无效');};
    const replica=journal.replica({authorize:options.authorize,conflictState:options.conflictState,protection:options.protection,
      locate(value){key(value);if(!db.prepare('SELECT 1 FROM sessions WHERE session_id=?').get(value))return null;const project=new SessionAssociationRepository(ledger).read(value).project_id;return (project?'/projects/'+encodeURIComponent(project)+'/':'/')+'?openPlugin=sessions&openRecord='+encodeURIComponent(value);},
      belongsToProject(value,projectId,retained){key(value);return sessionProjectChanges(db,refs,options.spaceId,value,projectId,retained);},
      read(value){key(value);return readSessionSyncValue(db,content,refs,options.spaceId,value,options.authorize);},
      apply(value,body){key(value);applySessionSyncValue(db,content,refs,ledger,options.spaceId,value,body,options.authorize);},
    });options.authorize();return {db,replica};
  });
  try{options.authorize();return run(opened.replica);}finally{opened.db.close();}
}
