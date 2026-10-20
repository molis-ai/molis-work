import type {SyncBlobReference,SyncEvent} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SyncRegistration} from './index.js';
import {blobReference} from './blob-transfer.js';
import {syncError} from './sync-errors.js';

export async function decodeContent(registration:SyncRegistration,event:SyncEvent&{attachments?:SyncBlobReference[]},read:(ref:SyncBlobReference)=>Promise<Uint8Array>):Promise<SyncEvent>{
  const declared=event.attachments??[];
  if(!Array.isArray(declared)||declared.length>2000)throw syncError('invalid','同步附件引用无效');
  const allowed=declared.map(blobReference);
  let value=event.value;
  if(!registration.content||event.value===null){if(allowed.length)throw syncError('unsupported','此同步集合尚未接入附件');}
  else try{value=await registration.content.decode(event.key,event.value,reference=>{const ref=blobReference(reference);if(!allowed.some(a=>a.digest===ref.digest&&a.size===ref.size))throw syncError('scope','同步附件未声明');return read(ref);});}catch(error){if(error instanceof SyntaxError)throw syncError('invalid','同步内容格式无效，原件已保留');throw error;}
  return {operationId:event.operationId,key:event.key,base:event.base,revision:event.revision,value};
}
