import type {ProjectReplicaDefinition,ProjectReplicaRow,ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {SOURCE_CONTENT_REPLICA_ID} from '@molis-ai/molis-work-contracts/modules/sources';

const errors=defineErrorCodes('sources',{replica_invalid:'invalid'});
const columns='project_id source_id kind definition_id sync_kind name description status enabled origin config_json schedule_json credential_ref account_label last_sync_at last_outcome last_error_code imported_at updated_at'.split(' ');
const localFields=['status','enabled','schedule_json','credential_ref','account_label','last_sync_at','last_outcome','last_error_code'] as const;
/** Only saved business descriptions and retirement cross devices. Connection setup is this device's own fact. */
export function sourceContentReplicationDefinition():ProjectReplicaDefinition{
 return {id:SOURCE_CONTENT_REPLICA_ID,assetKind:'project_sources',tables:[
  {name:'feed_sources',columns,keys:['project_id','source_id']},
  {name:'source_events',columns:['event_id','project_id','source_id','type','payload_json','at'],keys:['event_id']},
 ],journalTypes:[],receiptOperations:[],sequenceFields:[],
 project(rows){return {...rows,feed_sources:rows.feed_sources!.map(row=>portable(row))};},
 restore(rows,local){const existing=new Map(local.feed_sources!.map(r=>[r.source_id,r]));return {...rows,feed_sources:rows.feed_sources!.map(row=>restore(row,existing.get(row.source_id)))};},
 validate:validate,
 };
}
function lifecycle(row:ProjectReplicaRow):Record<string,string>{
 const config=object(JSON.parse(String(row.config_json))),value=config._molis_work_lifecycle;
 if(value===undefined)return {};
 const entry=object(value);if(Object.keys(entry).some(k=>!['deleted_at','history_decision'].includes(k))||typeof entry.deleted_at!=='string'||!Number.isFinite(Date.parse(entry.deleted_at))||!['retain_history','delete_local_history'].includes(String(entry.history_decision)))invalid();
 return {deleted_at:entry.deleted_at,history_decision:String(entry.history_decision)};
}
function portable(row:ProjectReplicaRow):ProjectReplicaRow{
 const retired=lifecycle(row),config=Object.keys(retired).length?{_molis_work_lifecycle:retired}:{};
 return {...row,status:'paused',enabled:0,config_json:JSON.stringify(config),schedule_json:'{"mode":"manual"}',credential_ref:null,account_label:null,last_sync_at:null,last_outcome:null,last_error_code:null};
}
function restore(row:ProjectReplicaRow,local:ProjectReplicaRow|undefined):ProjectReplicaRow{
 const fresh=portable(row);if(!local)return fresh;
 const config=object(JSON.parse(String(local.config_json))),retired=lifecycle(row);delete config._molis_work_lifecycle;
 if(Object.keys(retired).length)config._molis_work_lifecycle=retired;
 const result={...fresh};
 if(local.kind===row.kind&&local.sync_kind===row.sync_kind&&local.definition_id===row.definition_id){
  for(const key of localFields)result[key]=local[key]!;result.config_json=JSON.stringify(config);
 }
 if(Object.keys(retired).length)Object.assign(result,fresh);
 result.updated_at=new Date(Math.max(Date.now(),Date.parse(String(row.updated_at)),Date.parse(String(local.updated_at))+1)).toISOString();
 return result;
}
function validate(rows:ProjectReplicaRows,projectId:string):void{
 const ids=new Set<string>();
 for(const r of rows.feed_sources!){
  if(r.project_id!==projectId||typeof r.source_id!=='string'||!r.source_id||r.source_id.length>500||ids.has(r.source_id)||typeof r.kind!=='string'||!r.kind||typeof r.name!=='string'||!r.name||typeof r.description!=='string'||!['public_source','github','gmail','connector','manual'].includes(String(r.sync_kind))||r.origin!=='molis_work'||r.status!=='paused'||r.enabled!==0||r.credential_ref!==null||r.account_label!==null||r.last_sync_at!==null||r.last_outcome!==null||r.last_error_code!==null||r.schedule_json!=='{"mode":"manual"}')invalid();
  ids.add(r.source_id);const projected=portable(r);if(JSON.stringify(object(JSON.parse(String(r.config_json))))!==projected.config_json)invalid();
  if(!Number.isFinite(Date.parse(String(r.imported_at)))||!Number.isFinite(Date.parse(String(r.updated_at))))invalid();
 }
 for(const e of rows.source_events!){
  if(e.project_id!==projectId||!['source.created','source.updated','source.status_changed','source.retired'].includes(String(e.type))||!Number.isFinite(Date.parse(String(e.at))))invalid();
  const body=object(JSON.parse(String(e.payload_json)));if(Object.keys(body).sort().join(',')!=='enabled,status'||typeof body.enabled!=='boolean'||!['active','paused','error','disconnected'].includes(String(body.status)))invalid();
 }
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function invalid():never{throw errors.replica_invalid('来源同步描述、归属或历史格式无效');}
