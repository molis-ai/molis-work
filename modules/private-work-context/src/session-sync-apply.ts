import type Database from 'better-sqlite3';
import type {ContextHistoryReplication,ContextLedgerApi} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import type {SessionContentStore} from './content-store.js';
import {SessionAssociationRepository} from './session-associations.js';
import {HandoffAssociationRepository} from './handoff-associations.js';
import {sessionReference} from './session-reference-scope.js';
import {validateSessionSyncValue,type SessionSyncValue} from './session-sync-shape.js';
import {workSyncErrors as errors} from './session-sync-errors.js';

type Row=Record<string,unknown>;
const waiting=(reason:string):never=>{throw errors.sync_busy(reason,{sync_waiting:true});};
function idle(db:Database.Database,key:string,value:SessionSyncValue|null):void {
  const row=db.prepare('SELECT * FROM sessions WHERE session_id=?').get(key) as Row|undefined;
  if(db.prepare("SELECT 1 FROM session_messages WHERE session_id=? AND state IN ('pending','uncertain') LIMIT 1").get(key)
    ||db.prepare("SELECT 1 FROM session_handoffs WHERE (source_session_id=? OR destination_session_id=?) AND sync_passive=0 AND state='sending' LIMIT 1").get(key,key))waiting('本机会话仍有未决发送，不能用同步历史覆盖');
  if(!row)return;
  const bound=!!row.native_runtime_session_id||!!row.surface_id||!!row.correlation_token&&Date.parse(String(row.correlation_expires_at))>=Date.now();
  if(bound&&row.status!=='closed')waiting('本机会话仍在使用，请先关闭后再接收同步历史');
  if(value&&bound&&(value.session.runtime_id!==row.runtime_id||value.session.status!==row.status))waiting('同步历史不能改变本机 Runtime 的身份或运行状态');
  if(value&&value.session.created_at!==row.created_at)throw errors.sync_invalid('会话稳定身份的创建事实不一致');
}
function rejectForeignIds(db:Database.Database,key:string,value:SessionSyncValue):void {
  for(const event of value.events){const existing=db.prepare('SELECT session_id FROM session_events WHERE event_id=?').get(event.event_id) as Row|undefined;
    if(existing&&existing.session_id!==key)throw errors.sync_scope('会话事件 ID 已属于其他会话');}
  for(const handoff of value.handoffs){const existing=db.prepare('SELECT source_session_id FROM session_handoffs WHERE package_id=?').get(handoff.package_id) as Row|undefined;
    if(existing&&existing.source_session_id!==key)throw errors.sync_scope('交接 ID 已属于其他会话');}
}
function clearHandoffs(db:Database.Database,key:string,refs:ContextHistoryReplication,ledger:ContextLedgerApi):void {
  const local=new HandoffAssociationRepository(ledger);
  for(const row of db.prepare('SELECT package_id FROM session_handoffs WHERE source_session_id=?').all(key) as Row[]){
    const id=String(row.package_id);local.release(id,'system:session-sync',new Date().toISOString());refs.replace(sessionReference(id,true),[]);
  }
  db.prepare('DELETE FROM session_handoffs WHERE source_session_id=?').run(key);
}
/** Only this owner writes its records. Restored handoffs are permanently passive, irrespective of their observed state. */
export function applySessionSyncValue(db:Database.Database,content:SessionContentStore,refs:ContextHistoryReplication,ledger:ContextLedgerApi,spaceId:string,key:string,input:unknown|null,authorize:()=>void):void {
  const value=input===null?null:validateSessionSyncValue(input,spaceId,key,refs);
  db.transaction(()=>{
    authorize();idle(db,key,value);
    if(value){
      rejectForeignIds(db,key,value);
      const current=new SessionAssociationRepository(ledger).read(key),heads=new Map(value.references.map(edge=>[edge.key,edge]));
      const project=heads.get('work.project:'+key),nextProject=project?.state==='active'?project.target.id:null;
      const row=db.prepare('SELECT workspace_path FROM sessions WHERE session_id=?').get(key) as Row|undefined;
      if((current.workspace_id||row?.workspace_path)&&current.project_id!==nextProject)waiting('会话项目已变化，请先明确解除本机工作目录再采用同步历史');
    }
    clearHandoffs(db,key,refs,ledger);db.prepare('DELETE FROM session_events WHERE session_id=?').run(key);
    if(!value){
      new SessionAssociationRepository(ledger).release(key,'system:session-sync',new Date().toISOString());refs.replace(sessionReference(key),[]);
      db.prepare('DELETE FROM session_messages WHERE session_id=?').run(key);db.prepare('DELETE FROM sessions WHERE session_id=?').run(key);authorize();return;
    }
    const s=value.session;
    db.prepare(`INSERT INTO sessions(session_id,runtime_id,title,status,provenance,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,'{}',?,?)
      ON CONFLICT(session_id) DO UPDATE SET runtime_id=excluded.runtime_id,title=excluded.title,status=excluded.status,provenance=excluded.provenance,updated_at=excluded.updated_at`)
      .run(key,s.runtime_id,s.title,s.status,s.provenance,s.created_at,s.updated_at);
    refs.replace(sessionReference(key),value.references);
    const insertEvent=db.prepare(`INSERT INTO session_events(event_id,session_id,source,kind,source_id,source_order,occurred_at,content_ref,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for(const event of value.events){authorize();const stored=content.write(event.content);authorize();
      insertEvent.run(event.event_id,key,event.source,event.kind,event.source_id,event.source_order,event.occurred_at,stored.content_ref,JSON.stringify(event.metadata),event.created_at);}
    const insertHandoff=db.prepare(`INSERT INTO session_handoffs(package_id,source_session_id,source_project_id,source_goal_id,target_runtime_id,target_project_id,target_workspace_id,target_workspace_path,
      destination_session_id,state,delivery_mode,content_ref,content_digest,attempt_count,error_code,error_message,retryable,sync_passive,sync_destination_session_id,created_by,created_at,updated_at,sent_at)
      VALUES (?,?,'','',?,'',NULL,NULL,NULL,?,?,?,?,?,?,NULL,?,1,?,?,?,?,?)`);
    for(const handoff of value.handoffs){authorize();const stored=content.write(handoff.content);authorize();
      insertHandoff.run(handoff.package_id,key,handoff.target_runtime_id,handoff.state,handoff.delivery_mode,stored.content_ref,handoff.content_digest,handoff.attempt_count,handoff.error_code,handoff.retryable?1:0,handoff.destination_session_id,handoff.created_by,handoff.created_at,handoff.updated_at,handoff.sent_at);
      refs.replace(sessionReference(handoff.package_id,true),handoff.references);
    }
    authorize();
  }).immediate();
}
