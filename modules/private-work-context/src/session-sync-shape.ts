import type {ContextEdge,ContextHistoryReplication} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import type {WorkSessionRecord,WorkSessionEventRecord,WorkSessionHandoffRecord} from '@molis-ai/molis-work-contracts/modules/private-work-context';
import {WORK_SESSION_EVENT_KINDS,WORK_SESSION_EVENT_SOURCES} from '@molis-ai/molis-work-contracts/modules/private-work-context';
import {createHash} from 'node:crypto';
import {sessionReference} from './session-reference-scope.js';
import {workSyncErrors as errors} from './session-sync-errors.js';

export type SessionSyncRoot=Pick<WorkSessionRecord,'session_id'|'runtime_id'|'title'|'status'|'provenance'|'created_at'|'updated_at'>;
export type SessionSyncEvent=Pick<WorkSessionEventRecord,'event_id'|'session_id'|'source'|'kind'|'source_id'|'source_order'|'occurred_at'|'created_at'> & {content:string;metadata:Record<string,unknown>};
export type SessionSyncHandoff=Pick<WorkSessionHandoffRecord,'package_id'|'source_session_id'|'target_runtime_id'|'destination_session_id'|'state'|'delivery_mode'|'content_digest'|'attempt_count'|'error_code'|'retryable'|'created_by'|'created_at'|'updated_at'|'sent_at'> & {content:string;references:ContextEdge[]};
export interface SessionSyncValue {format:1;spaceId:string;session:SessionSyncRoot;events:SessionSyncEvent[];handoffs:SessionSyncHandoff[];references:ContextEdge[]}
export const SESSION_SYNC_ROOT_FIELDS=['session_id','runtime_id','title','status','provenance','created_at','updated_at'] as const;
export const SESSION_SYNC_EVENT_FIELDS=['event_id','session_id','source','kind','source_id','source_order','occurred_at','created_at','content','metadata'] as const;
export const SESSION_SYNC_HANDOFF_FIELDS=['package_id','source_session_id','target_runtime_id','destination_session_id','state','delivery_mode','content_digest','attempt_count','error_code','retryable','created_by','created_at','updated_at','sent_at','content','references'] as const;
function invalid():never{throw errors.sync_invalid('同步会话内容或引用格式无效，原内容已保留');}
export function workSyncRecord(input:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key)))invalid();
  return input as Record<string,unknown>;
}
function text(input:unknown,max=1000):input is string{return typeof input==='string'&&input.trim().length>0&&input.length<=max;}
function timestamp(input:unknown):boolean{return typeof input==='string'&&Number.isFinite(Date.parse(input));}
function content(input:unknown):input is string{
  if(typeof input!=='string')invalid();if(Buffer.byteLength(input,'utf8')>512*1024)throw errors.sync_limit('单条会话正文超过原 owner 保留上限');return true;
}
function list(input:unknown):unknown[]{if(!Array.isArray(input)||input.length>100000)invalid();return input;}
/** Only established portable observation fields; panel/workspace/runtime hints never enter this projection. */
export function sessionSyncMetadata(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))invalid();const metadata:Record<string,unknown>={};
  for(const key of ['tool','goal_id','state','partial_terminal_history']){
    if(!Object.hasOwn(input,key))continue;const v=Reflect.get(input,key);
    if(key==='partial_terminal_history'){if(typeof v!=='boolean')invalid();}
    else if(v!==null&&!text(v,1000))invalid();metadata[key]=v;
  }
  return metadata;
}
function validateRoot(input:unknown,key:string):SessionSyncRoot {
  const r=workSyncRecord(input,SESSION_SYNC_ROOT_FIELDS);
  if(r.session_id!==key||!text(key,500)||!text(r.runtime_id)||!(r.title===null||typeof r.title==='string'&&r.title.length<=10000)
    ||!['active','closed','discovered'].includes(String(r.status))||!['molis_work_created','runtime_discovered','explicitly_linked'].includes(String(r.provenance))
    ||!timestamp(r.created_at)||!timestamp(r.updated_at))invalid();return input as SessionSyncRoot;
}
function validateEvents(input:unknown,key:string):SessionSyncEvent[]{
  const ids=new Set<string>(),sources=new Set<string>();
  for(const value of list(input)){
    const e=workSyncRecord(value,SESSION_SYNC_EVENT_FIELDS);
    if(e.session_id!==key||!text(e.event_id)||ids.has(e.event_id)||!text(e.source_id)||!WORK_SESSION_EVENT_SOURCES.some(v=>v===e.source)
      ||!WORK_SESSION_EVENT_KINDS.some(v=>v===e.kind)||!Number.isSafeInteger(e.source_order)||Number(e.source_order)<0
      ||!timestamp(e.occurred_at)||!timestamp(e.created_at)||!content(e.content))invalid();
    const identity=JSON.stringify([e.source,e.source_id]);if(sources.has(identity))invalid();ids.add(e.event_id);sources.add(identity);
    const m=sessionSyncMetadata(e.metadata);if(Object.keys(m).length!==Object.keys(e.metadata as object).length)invalid();
  }
  return input as SessionSyncEvent[];
}
function validateHandoffs(input:unknown,key:string,refs:ContextHistoryReplication):SessionSyncHandoff[]{
  const ids=new Set<string>();
  for(const value of list(input)){
    const h=workSyncRecord(value,SESSION_SYNC_HANDOFF_FIELDS);
    if(h.source_session_id!==key||!text(h.package_id)||ids.has(h.package_id)||!text(h.target_runtime_id)||!(h.destination_session_id===null||text(h.destination_session_id))
      ||!['draft','sending','failed','sent','cancelled'].includes(String(h.state))||![null,'native','molis_work_fallback'].includes(h.delivery_mode as null|string)
      ||!Number.isSafeInteger(h.attempt_count)||Number(h.attempt_count)<0||!(h.error_code===null||text(h.error_code))||typeof h.retryable!=='boolean'
      ||!text(h.created_by)||!timestamp(h.created_at)||!timestamp(h.updated_at)||!(h.sent_at===null||timestamp(h.sent_at))||!content(h.content)
      ||h.content_digest!==createHash('sha256').update(String(h.content)).digest('hex')||h.destination_session_id===key
      ||(h.destination_session_id!==null&&h.delivery_mode===null)
      ||(h.state==='sent'&&(h.delivery_mode===null||h.sent_at===null||h.retryable!==false))
      ||(h.state==='cancelled'&&h.retryable!==false)||(h.state==='failed'&&h.error_code===null))invalid();
    ids.add(h.package_id);const history=refs.validate(sessionReference(h.package_id,true),h.references);
    const latest=new Map(history.map(edge=>[edge.key,edge]));
    if(history.some(edge=>edge.key!==edge.type+':'+h.package_id||(edge.type==='handoff.goal'&&!text(edge.target.project_id))
      ||(edge.type==='handoff.project'&&edge.target.project_id!==edge.target.id)))invalid();
    if(![...latest.values()].some(edge=>edge.type==='handoff.goal'&&edge.state==='active')||![...latest.values()].some(edge=>edge.type==='handoff.project'&&edge.state==='active'))invalid();
  }
  return input as SessionSyncHandoff[];
}
/** Validation is side-effect free except the injected authorization fence. No file read or command replay. */
export function validateSessionSyncValue(input:unknown,spaceId:string,key:string,refs:ContextHistoryReplication):SessionSyncValue {
  const value=workSyncRecord(input,['format','spaceId','session','events','handoffs','references']);
  if(value.format!==1||value.spaceId!==spaceId)throw errors.sync_scope('同步会话不属于当前个人空间');
  validateRoot(value.session,key);validateEvents(value.events,key);validateHandoffs(value.handoffs,key,refs);
  const history=refs.validate(sessionReference(key),value.references),heads=[...new Map(history.map(edge=>[edge.key,edge])).values()];
  if(history.some(edge=>edge.type==='work.project'&&(edge.key!=='work.project:'+key||edge.target.project_id!==edge.target.id)))invalid();
  const projects=heads.filter(edge=>edge.type==='work.project'&&edge.state==='active'),goals=heads.filter(edge=>edge.type==='work.goal'&&edge.state==='active');
  if(projects.length>1||goals.length>1||goals.some(edge=>(edge.target.project_id??null)!==(projects[0]?.target.id??null)))invalid();
  if(Buffer.byteLength(JSON.stringify(input),'utf8')>100000000)throw errors.sync_limit('会话聚合超过账号容量上限');
  return structuredClone(input) as SessionSyncValue;
}
