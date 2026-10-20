import {feedErrors,FEED_CONTENT_REPLICA_ID} from '@molis-ai/molis-work-contracts/modules/feed';
import type {ProjectReplicaDefinition,ProjectReplicaRow,ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
const dispositions=['inbox','saved','promoted','processing','archived'];
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const id=(v:unknown)=>typeof v==='string'&&!!v.trim()&&v.length<=1000;
const nullableText=(v:unknown)=>v===null||typeof v==='string';
const evidence=/^molis-work-feed\/sha256\/[a-f0-9]{64}$/;
const itemColumns='project_id item_id source_id signal_id signal_revision kind title summary body source_kind source_label external_id url origin_status priority tags_json author disposition read_at revision source_created_at source_updated_at imported_at updated_at'.split(' ');
const materialColumns='project_id material_id item_id canonical_url title source_name published_at preview content_hash content_ref content_available content_type character_count captured_at provenance_json selected_for_context imported_at updated_at'.split(' ');
/** Only saved messages/materials/dispositions and fixed history. No Provider/Listener/Attention or execution facts. */
export function feedContentReplicationDefinition():ProjectReplicaDefinition{
 return {id:FEED_CONTENT_REPLICA_ID,assetKind:'project_feed',tables:[
  {name:'feed_items',columns:itemColumns,keys:['project_id','item_id']},
  {name:'feed_materials',columns:materialColumns,keys:['project_id','material_id']},
  {name:'feed_item_events',columns:'event_id project_id item_id type payload_json at'.split(' '),keys:['event_id']},
 ],journalTypes:[],receiptOperations:[],sequenceFields:[],validate,
 contentRefs(rows,projectId){validate(rows,projectId);return [...new Set(rows.feed_materials!.flatMap(r=>r.content_ref===null?[]:[String(r.content_ref)]))].sort();},
 restore(rows,local){const previous=new Map(local.feed_items!.map(r=>[r.item_id,r]));return {...rows,feed_items:rows.feed_items!.map(r=>{const old=previous.get(r.item_id);if(!old)return r;const revision=Math.max(Number(r.revision),Number(old.revision)+1);if(!Number.isSafeInteger(revision))invalid();return {...r,revision};})};},
 };
}
function jsonObject(value:unknown):void{const v=JSON.parse(String(value));if(!v||typeof v!=='object'||Array.isArray(v))invalid();}
function strings(row:ProjectReplicaRow,keys:readonly string[]):void{if(keys.some(k=>typeof row[k]!=='string'))invalid();}
function validate(rows:ProjectReplicaRows,projectId:string):void{
 const items=new Map<string,ProjectReplicaRow>(),dedupe=new Set<string>(),signals=new Set<string>();
 for(const r of rows.feed_items!){
  strings(r,['kind','title','summary','source_kind','source_label','origin_status','priority']);
  if(r.project_id!==projectId||!id(r.item_id)||items.has(String(r.item_id))||!String(r.title).trim()||String(r.title).length>300||String(r.summary).length>2000||!dispositions.includes(String(r.disposition))||!Number.isSafeInteger(r.revision)||Number(r.revision)<1||['source_id','signal_id','body','external_id','url','author'].some(k=>!nullableText(r[k]))||['source_created_at','source_updated_at','imported_at','updated_at'].some(k=>!date(r[k]))||r.read_at!==null&&!date(r.read_at))invalid();
  if(r.signal_id===null?r.signal_revision!==null:!Number.isSafeInteger(r.signal_revision)||Number(r.signal_revision)<1)invalid();
  const tags:unknown=JSON.parse(String(r.tags_json));if(!Array.isArray(tags)||tags.some(v=>typeof v!=='string'))invalid();
  if(r.source_id!==null&&r.external_id!==null){const key=JSON.stringify([r.source_id,r.external_id]);if(dedupe.has(key))invalid();dedupe.add(key);}
  if(r.signal_id!==null){if(signals.has(String(r.signal_id)))invalid();signals.add(String(r.signal_id));}items.set(String(r.item_id),r);
 }
 for(const r of rows.feed_materials!){
  strings(r,['title','source_name','preview']);if(r.project_id!==projectId||!id(r.material_id)||!items.has(String(r.item_id))||['canonical_url','content_hash','content_ref','content_type'].some(k=>!nullableText(r[k]))||!date(r.imported_at)||!date(r.updated_at)||['published_at','captured_at'].some(k=>r[k]!==null&&!date(r[k]))||![0,1].includes(r.content_available as number)||![0,1].includes(r.selected_for_context as number)||r.character_count!==null&&(!Number.isSafeInteger(r.character_count)||Number(r.character_count)<0))invalid();
  if(r.content_ref!==null&&!evidence.test(String(r.content_ref))||r.content_available===1&&r.content_ref===null)invalid();jsonObject(r.provenance_json);
 }
 const events=['created','updated','read','restored','saved','promoted','processing','archived','inbox','deleted'].map(v=>'feed_item.'+v);
 for(const r of rows.feed_item_events!){if(r.project_id!==projectId||!id(r.event_id)||!id(r.item_id)||!events.includes(String(r.type))||!date(r.at))invalid();jsonObject(r.payload_json);}
}
function invalid():never{throw feedErrors.request_invalid('消息同步的身份、材料、状态或历史无效');}
