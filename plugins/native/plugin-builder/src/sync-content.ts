import type {SyncBlobReference} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {builderPrivateValueReplicationOwner} from './sync-owner.js';
import {object,builderSyncInvalid} from './sync-shape.js';

const owner=()=>builderPrivateValueReplicationOwner();
function envelope(key:string,value:unknown){
 const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!==owner().assetKind||typeof parts[0]!=='string'||typeof parts[2]!=='string')return builderSyncInvalid();
 const wire=object(value),project=object(wire.project);
 if(wire.format!==1||project.id!==parts[0])builderSyncInvalid();return {wire,projectId:parts[0],itemId:parts[2]};
}
/** Only explicitly selected author files become byte blobs. The common SDK handles chunking and account binding. */
export const builderSyncProjection={
 project(key:string,value:unknown,put:(bytes:Uint8Array)=>SyncBlobReference):unknown{
  if(value===null)return null;const {wire,projectId,itemId}=envelope(key,value);owner().validate(wire.content,projectId,itemId);
  const content=object(wire.content),files=object(content.files);
  for(const entries of Object.values(files))for(const directory of entries as Array<{files:Record<string,unknown>[]}>)for(const file of directory.files){
   const bytes=Buffer.from(String(file.bytes),'base64');delete file.bytes;file.blob=bytes.length?put(bytes):null;
  }
  return wire;
 },
 async restore(key:string,value:unknown,read:(reference:SyncBlobReference)=>Promise<Uint8Array>):Promise<unknown>{
  if(value===null)return null;const {wire,projectId,itemId}=envelope(key,value),content=object(wire.content),files=object(content.files);
  if(Object.keys(files).length!==1||!Object.hasOwn(files,itemId)||!Array.isArray(files[itemId]))builderSyncInvalid();
  for(const input of files[itemId] as unknown[]){const directory=object(input);if(!Array.isArray(directory.files)||directory.files.length>2000)builderSyncInvalid();
   for(const input of directory.files as unknown[]){const file=object(input);
    if(Object.keys(file).sort().join(',')!=='blob,digest,path,size'||!Number.isSafeInteger(file.size)||Number(file.size)<0||Number(file.size)>8*1024*1024)builderSyncInvalid();
    const ref=file.blob===null?null:object(file.blob);if(ref&&(Object.keys(ref).sort().join(',')!=='digest,size'||ref.digest!==file.digest||ref.size!==file.size)||!ref&&file.size!==0)builderSyncInvalid();
    const bytes=ref?await read({digest:String(ref.digest),size:Number(ref.size)}):new Uint8Array();delete file.blob;file.bytes=Buffer.from(bytes).toString('base64');
   }
  }
  owner().validate(content,projectId,itemId);return wire;
 },
};
