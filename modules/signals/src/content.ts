import {createHash} from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {SignalDraft} from '@molis-ai/molis-work-contracts/modules/signals';
const errors=defineErrorCodes('signals',{invalid_draft:'invalid'});
export function assertSignalDraft(draft:SignalDraft):void{
 const required=[draft.project_id,draft.source_id,draft.provider_dedupe_id,draft.kind,draft.occurred_at,draft.observed_at,draft.raw_event_id,draft.adapter.plugin_id,draft.adapter.version];
 if(required.some(value=>typeof value!=='string'||!value.trim())||!Number.isFinite(Date.parse(draft.occurred_at))||!Number.isFinite(Date.parse(draft.observed_at))||!isObject(draft.payload)||!isObject(draft.provenance))throw errors.invalid_draft('Signal Draft 缺少可信身份、时间或结构化内容');
}
export function signalContentHash(draft:SignalDraft):string{
 return signalDigest(stableSignalJson({kind:draft.kind,occurred_at:draft.occurred_at,payload:draft.payload,content_refs:draft.content_refs??[],adapter:draft.adapter,provenance:draft.provenance}));
}
export function stableSignalJson(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stableSignalJson).join(',')+']';
 if(isObject(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableSignalJson(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function isObject(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function signalDigest(value:string):string{return createHash('sha256').update(value).digest('hex');}
