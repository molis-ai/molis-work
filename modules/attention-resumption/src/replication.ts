import {attentionErrors,ATTENTION_CONTENT_REPLICA_ID,type AttentionEntryRecord} from '@molis-ai/molis-work-contracts/modules/attention-resumption';
import type {ProjectReplicaDefinition,ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {assertAttentionEntryShape} from './entry-shape.js';

const statuses=['open','in_progress','done','dismissed'];
const subjects=['feed_item','goal_decision','source_fault'];
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const id=(value:unknown)=>typeof value==='string'&&!!value.trim()&&value.length<=500;
/** References and saved dispositions only. Receiving never invokes the subject or judgment services. */
export function attentionContentReplicationDefinition():ProjectReplicaDefinition{
 return {id:ATTENTION_CONTENT_REPLICA_ID,assetKind:'project_attention',tables:[
  {name:'inbox_entries',columns:'project_id entry_id subject_type subject_id reason status detail_json revision created_at updated_at completed_at'.split(' '),keys:['project_id','entry_id']},
  {name:'attention_events',columns:'event_id project_id entry_id type subject_type subject_id at'.split(' '),keys:['event_id']},
 ],journalTypes:[],receiptOperations:[],sequenceFields:[],validate,
 restore(rows,local){const previous=new Map(local.inbox_entries!.map(r=>[r.entry_id,r]));return {...rows,inbox_entries:rows.inbox_entries!.map(row=>{const old=previous.get(row.entry_id);if(!old)return row;const revision=Math.max(Number(row.revision),Number(old.revision)+1);if(!Number.isSafeInteger(revision))invalid();return {...row,revision};})};},
 };
}
function validate(rows:ProjectReplicaRows,projectId:string):void{
 const unique=new Set<string>();
 for(const row of rows.inbox_entries!){
  if(row.project_id!==projectId||!id(row.entry_id)||!id(row.subject_id)||!subjects.includes(String(row.subject_type))||!statuses.includes(String(row.status))||!Number.isSafeInteger(row.revision)||Number(row.revision)<1||!date(row.created_at)||!date(row.updated_at)||row.completed_at!==null&&!date(row.completed_at))invalid();
  const expected=row.subject_type==='feed_item'?['manual','source_rule','artifact_out_failed']:row.subject_type==='source_fault'?['source_fault']:['goal_decision'];
  if(['done','dismissed'].includes(String(row.status))?row.completed_at===null:row.completed_at!==null)invalid();
  if(!expected.includes(String(row.reason)))invalid();
  const key=JSON.stringify([row.subject_type,row.subject_id,row.reason]);if(unique.has(key))invalid();unique.add(key);
  const detail:unknown=JSON.parse(String(row.detail_json));if(!detail||typeof detail!=='object'||Array.isArray(detail))invalid();
  assertAttentionEntryShape({project_id:projectId,entry_id:String(row.entry_id),subject_type:row.subject_type as AttentionEntryRecord['subject_type'],subject_id:String(row.subject_id),reason:row.reason as AttentionEntryRecord['reason'],status:row.status as AttentionEntryRecord['status'],detail:detail as Record<string,unknown>,revision:Number(row.revision),created_at:String(row.created_at),updated_at:String(row.updated_at),completed_at:row.completed_at as string|null});
 }
 const events=['created',...statuses,'deleted'].map(s=>'inbox_entry.'+s);
 for(const row of rows.attention_events!)if(row.project_id!==projectId||!id(row.event_id)||!id(row.entry_id)||!subjects.includes(String(row.subject_type))||!id(row.subject_id)||!events.includes(String(row.type))||!date(row.at))invalid();
}
function invalid():never{throw attentionErrors.invalid_reference('注意事项同步的身份、状态、引用或历史无效');}
