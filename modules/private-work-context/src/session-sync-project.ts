import type Database from 'better-sqlite3';
import type {ContextEdge,ContextHistoryReplication} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import type {SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {sessionReference} from './session-reference-scope.js';
import {validateSessionSyncValue} from './session-sync-shape.js';
import {workSyncErrors as errors} from './session-sync-errors.js';

/** Ownership is work.project, never a Goal or a handoff destination. Removed edges retain deleted identity. */
function project(history:readonly ContextEdge[],key:string,deleted=false):string|null {
  const head=history.filter(edge=>edge.type==='work.project'&&edge.key==='work.project:'+key).at(-1);
  return head&&(head.state==='active'||deleted)?head.target.id:null;
}
export function sessionProjectChanges(db:Database.Database,refs:ContextHistoryReplication,spaceId:string,key:string,projectId:string,retained:()=>readonly SyncMutation[]):boolean {
  const exists=!!db.prepare('SELECT 1 FROM sessions WHERE session_id=?').get(key);
  if(project(refs.read(sessionReference(key)),key,!exists)===projectId)return true;
  return retained().some(event=>{
    if(event.key!==key)throw errors.sync_invalid('会话保留记录标识不一致');
    if(event.value===null)return false;
    const value=validateSessionSyncValue(event.value,spaceId,key,refs);
    return project(value.references,key)===projectId;
  });
}
