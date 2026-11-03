import {attentionErrors,type AttentionEntryRecord,type AttentionSubjectType} from '@molis-ai/molis-work-contracts/modules/attention-resumption';

export function assertAttentionReference(subjectType:AttentionSubjectType,subjectId:string):void{
 if(!subjectId.trim()||!['feed_item','goal_decision','source_fault'].includes(subjectType))throw attentionErrors.invalid_reference('Inbox Entry 必须引用一个有效对象');
}
export function assertAttentionEntryShape(entry:AttentionEntryRecord):void{
 if(!(entry.owner_plugin_id===null||typeof entry.owner_plugin_id==='string'&&entry.owner_plugin_id.trim()))throw attentionErrors.invalid_reference("Attention 对象必须有明确的主人或 null");
 assertAttentionReference(entry.subject_type,entry.subject_id);
 const forbidden=['title','summary','body','message','content','credential','cursor'];
 for(const key of forbidden)if(Object.hasOwn(entry,key))throw attentionErrors.invalid_reference(`Inbox Entry 不能复制 ${key}`);
 for(const key of Object.keys(entry.detail))if(forbidden.some(token=>key.toLowerCase().includes(token)))throw attentionErrors.invalid_reference(`Inbox Entry detail 不能复制 ${key}`);
}
