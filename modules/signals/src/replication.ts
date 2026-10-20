import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {SIGNAL_CONTENT_REPLICA_ID,type SignalDraft} from '@molis-ai/molis-work-contracts/modules/signals';
import type {ProjectReplicaDefinition,ProjectReplicaRow,ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {assertSignalDraft,signalContentHash,signalDigest,stableSignalJson} from './content.js';
const errors=defineErrorCodes('signals',{replica_invalid:'invalid'});
const fields='project_id signal_id source_id provider_dedupe_id kind occurred_at observed_at payload_json content_refs_json raw_event_id adapter_plugin_id adapter_version provenance_json revision content_hash validation superseded_by withdrawn_at created_at updated_at'.split(' ');
/** Saved accepted facts and exact revision history, never raw listener deliveries/checkpoints/leases. */
export function signalContentReplicationDefinition():ProjectReplicaDefinition{
 return {id:SIGNAL_CONTENT_REPLICA_ID,assetKind:'project_feed',tables:[
  {name:'signals',columns:fields,keys:['project_id','signal_id']},
  {name:'signal_revisions',columns:'project_id signal_id revision content_hash draft_json accepted_at'.split(' '),keys:['project_id','signal_id','revision']},
  {name:'signal_events',columns:'event_id project_id signal_id source_id type revision at'.split(' '),keys:['event_id']},
 ],journalTypes:[],receiptOperations:[],sequenceFields:[],validate,
 contentRefs(rows,projectId){validate(rows,projectId);const refs=new Set<string>();for(const row of rows.signal_revisions!){const draft=parseDraft(row.draft_json,projectId);for(const ref of draft.content_refs??[])refs.add(ref);}return [...refs].sort();},
 };
}
function date(v:unknown):boolean{return typeof v==='string'&&Number.isFinite(Date.parse(v));}
function id(v:unknown):boolean{return typeof v==='string'&&!!v.trim()&&v.length<=1000;}
function revision(v:unknown):boolean{return Number.isSafeInteger(v)&&Number(v)>=1;}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function parseDraft(input:unknown,projectId:string):SignalDraft{
 const value=object(JSON.parse(String(input))),keys=['project_id','source_id','provider_dedupe_id','kind','occurred_at','observed_at','payload','content_refs','raw_event_id','adapter','provenance'];
 if(Object.keys(value).some(k=>!keys.includes(k))||value.project_id!==projectId)invalid();
 const adapter=object(value.adapter);if(Object.keys(adapter).sort().join(',')!=='plugin_id,version')invalid();
 if(value.content_refs!==undefined&&(!Array.isArray(value.content_refs)||value.content_refs.some(ref=>typeof ref!=='string'||!/^molis-work-feed\/sha256\/[a-f0-9]{64}$/.test(ref))))invalid();
 const draft:SignalDraft={project_id:value.project_id as string,source_id:value.source_id as string,provider_dedupe_id:value.provider_dedupe_id as string,kind:value.kind as string,occurred_at:value.occurred_at as string,observed_at:value.observed_at as string,payload:object(value.payload),content_refs:(value.content_refs??[]) as string[],raw_event_id:value.raw_event_id as string,adapter:{plugin_id:adapter.plugin_id as string,version:adapter.version as string},provenance:object(value.provenance)};
 assertSignalDraft(draft);return draft;
}
function fromRow(row:ProjectReplicaRow,projectId:string):SignalDraft{
 return parseDraft(JSON.stringify({project_id:row.project_id,source_id:row.source_id,provider_dedupe_id:row.provider_dedupe_id,kind:row.kind,occurred_at:row.occurred_at,observed_at:row.observed_at,payload:JSON.parse(String(row.payload_json)),content_refs:JSON.parse(String(row.content_refs_json)),raw_event_id:row.raw_event_id,adapter:{plugin_id:row.adapter_plugin_id,version:row.adapter_version},provenance:JSON.parse(String(row.provenance_json))}),projectId);
}
function validate(rows:ProjectReplicaRows,projectId:string):void{
 const current=new Map<string,ProjectReplicaRow>(),history=new Map<string,Map<number,SignalDraft>>(),dedupe=new Set<string>();
 for(const row of rows.signals!){
  const draft=fromRow(row,projectId),expected='signal-'+signalDigest(projectId+'\0'+draft.source_id+'\0'+draft.provider_dedupe_id).slice(0,32);
  if(row.project_id!==projectId||row.signal_id!==expected||current.has(expected)||!revision(row.revision)||row.validation!=='accepted'||row.superseded_by!==null||row.withdrawn_at!==null||!date(row.created_at)||!date(row.updated_at)||row.content_hash!==signalContentHash(draft))invalid();
  const key=JSON.stringify([draft.source_id,draft.provider_dedupe_id]);if(dedupe.has(key))invalid();dedupe.add(key);current.set(expected,row);
 }
 for(const row of rows.signal_revisions!){
  if(row.project_id!==projectId||!id(row.signal_id)||!revision(row.revision)||!date(row.accepted_at))invalid();const head=current.get(String(row.signal_id));if(!head||Number(row.revision)>Number(head.revision))invalid();
  const draft=parseDraft(row.draft_json,projectId);if(draft.source_id!==head.source_id||draft.provider_dedupe_id!==head.provider_dedupe_id||row.content_hash!==signalContentHash(draft))invalid();
  const list=history.get(String(row.signal_id))??new Map<number,SignalDraft>();if(list.has(Number(row.revision)))invalid();list.set(Number(row.revision),draft);history.set(String(row.signal_id),list);
 }
 for(const [signalId,head]of current){const list=history.get(signalId);if(!list||list.size!==Number(head.revision)||Array.from({length:list.size},(_,n)=>n+1).some(n=>!list.has(n))||stableSignalJson(list.get(Number(head.revision)))!==stableSignalJson(fromRow(head,projectId)))invalid();}
 for(const row of rows.signal_events!){const head=current.get(String(row.signal_id));if(row.project_id!==projectId||!id(row.event_id)||!head||row.source_id!==head.source_id||!revision(row.revision)||!history.get(String(row.signal_id))?.has(Number(row.revision))||!date(row.at)||row.type!==(row.revision===1?'signal.accepted':'signal.changed'))invalid();}
}
function invalid():never{throw errors.replica_invalid('Signal 同步的身份、固定版本、摘要或历史关联无效');}
