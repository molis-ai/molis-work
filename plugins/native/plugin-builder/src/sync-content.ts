import {assertBuilderFilePath} from './sync-files.js';
import {builderSyncFileLimit, BUILDER_SYNC_TOTAL_BYTES} from './sync-file-limits.js';
import type {SyncBlobReference} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {BUILDER_CONTENT_REPLICA_ID} from './sync-owner.js';
import {object,builderSyncInvalid,validateBuilderUnit} from './sync-shape.js';

function envelope(key:string,value:unknown){
 const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!==BUILDER_CONTENT_REPLICA_ID||typeof parts[0]!=='string'||typeof parts[2]!=='string')return builderSyncInvalid();
 const wire=object(value),project=object(wire.project);
 if(wire.format!==1||project.id!==parts[0])builderSyncInvalid();return {wire,projectId:parts[0],itemId:parts[2]};
}
/** Only explicitly selected author files become byte blobs. The common SDK handles chunking and account binding. */
export const builderSyncProjection={
 project(key:string,value:unknown,put:(bytes:Uint8Array)=>SyncBlobReference):unknown{
  if(value===null)return null;const {wire,itemId}=envelope(key,value);validateBuilderUnit(wire.content,itemId);
  const content=object(wire.content),files=object(content.files);
  for(const entries of Object.values(files))for(const directory of entries as Array<{files:Record<string,unknown>[]}>)for(const file of directory.files){
   const bytes=Buffer.from(String(file.bytes),'base64');delete file.bytes;file.blob=bytes.length?put(bytes):null;
  }
  return wire;
 },
 async restore(key:string,value:unknown,read:(reference:SyncBlobReference)=>Promise<Uint8Array>):Promise<unknown>{
  if(value===null)return null;const {wire,itemId}=envelope(key,value),content=object(wire.content),files=object(content.files);
  if(Object.keys(files).length!==1||!Object.hasOwn(files,itemId)||!Array.isArray(files[itemId])||files[itemId].length>1000)builderSyncInvalid();
  let total=0;
  const pending:Array<{file:Record<string,unknown>;reference:SyncBlobReference|null}>=[];
  for(const input of files[itemId] as unknown[]){const directory=object(input);if(!Array.isArray(directory.files)||directory.files.length>2000)builderSyncInvalid();
   for(const input of directory.files as unknown[]){const file=object(input);assertBuilderFilePath(directory.slot,file.path);
    if(Object.keys(file).sort().join(',')!=='blob,digest,path,size'||!Number.isSafeInteger(file.size)||Number(file.size)<0||Number(file.size)>builderSyncFileLimit(directory.slot,file.path))builderSyncInvalid();
    const ref=file.blob===null?null:object(file.blob);if(ref&&(Object.keys(ref).sort().join(',')!=='digest,size'||ref.digest!==file.digest||ref.size!==file.size)||!ref&&file.size!==0)builderSyncInvalid();
    total+=Number(file.size);if(total>BUILDER_SYNC_TOTAL_BYTES)builderSyncInvalid();
    pending.push({file,reference:ref?{digest:String(ref.digest),size:Number(ref.size)}:null});
   }
  }
  for(const {file,reference} of pending){
   const bytes=reference?await read(reference):new Uint8Array();delete file.blob;file.bytes=Buffer.from(bytes).toString('base64');
  }
  validateBuilderUnit(content,itemId);return wire;
 },
};
