import {createHash} from 'node:crypto';
import {ActionError} from '@molis-ai/molis-work-contracts/platform/actions';
import type {SyncBlobReference,SyncBlobSource,SyncLocalProtection} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {withSyncDatabase} from './database.js';
import {syncError} from './sync-errors.js';
import {blobCache} from './blob-cache.js';
import {blobFiles} from './blob-files.js';

const CHUNK=4*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function blobPartsDigest(size:number,checksums:readonly string[]):string {
  return createHash('sha256').update(`molis-blob-parts:v1\n${size}\n${checksums.join('\n')}\n`).digest('hex');
}

async function transferParts(count:number,transfer:(part:number)=>Promise<void>){
  for(let part=0;part<count;part+=2){
    const batch=[transfer(part)];
    if(part+1<count)batch.push(transfer(part+1));
    // Wait for both siblings before releasing the caller's ownership scope or starting another file.
    const failed=(await Promise.allSettled(batch)).find(entry=>entry.status==='rejected');
    if(failed?.status==='rejected')throw failed.reason;
  }
}
export function blobReference(input:unknown):SyncBlobReference {
  if(!input||typeof input!=='object'||!('digest' in input)||!('size' in input)||typeof input.digest!=='string'||!/^[a-f0-9]{64}$/.test(input.digest)||!Number.isSafeInteger(input.size)||Number(input.size)<1||Number(input.size)>100000000)throw syncError('invalid','同步附件引用无效');
  return {digest:input.digest,size:Number(input.size)};
}
interface Receipt extends SyncBlobReference {ready:boolean;parts:{part:number;checksum:string}[]}
export interface BlobChannel {
  assert():void;
  json<T>(route:string,body?:unknown):Promise<T>;
  binary(route:string,body?:Uint8Array):Promise<Uint8Array>;
  onProgress?(delta:{done:number;total:number}):void;
}

export function isBlobBudgetExhausted(error:unknown):boolean {
  return error instanceof ActionError && error.code==='sync_replication.sync_busy' && error.details?.sync_resume===true;
}

/** One cycle has a bounded request budget; D1 receipts and local parts survive a process restart. */
export function blobTransfer(home:string,channel:BlobChannel,budget:{remaining:number}={remaining:32}){
  const take=()=>{channel.assert();if(budget.remaining--<=0)throw syncError('busy','附件传输尚未完成，请继续同步',{sync_resume:true});};
  const db=<T>(run:(db:import('node:sqlite').DatabaseSync)=>T)=>{channel.assert();return withSyncDatabase(home,run);};
  const status=async(namespace:string,reference:SyncBlobReference,reserve:boolean)=>{
    take();const receipt=reserve?await channel.json<Receipt>('/v1/blobs/reserve',{namespace,...reference}):await channel.json<Receipt>('/v1/blobs/status?'+new URLSearchParams({namespace,digest:reference.digest}));channel.assert();
    if(receipt.digest!==reference.digest||receipt.size!==reference.size||typeof receipt.ready!=='boolean'||!Array.isArray(receipt.parts)||receipt.parts.length>24)throw syncError('invalid','同步附件响应无效');
    const seen=new Set<number>();for(const part of receipt.parts){if(!Number.isSafeInteger(part.part)||part.part<0||part.part>=Math.ceil(reference.size/CHUNK)||seen.has(part.part)||!/^[a-f0-9]{64}$/.test(part.checksum))throw syncError('invalid','同步附件响应无效');seen.add(part.part);}
    return receipt;
  };
  return {
    release(namespace:string,references:SyncBlobReference[]){
      const files=blobFiles(home,namespace,()=>channel.assert());
      for(const reference of references){
        const ref=blobReference(reference);
        files.release(ref.digest);
        db(connection=>connection.prepare('DELETE FROM sync_blob_parts WHERE namespace=? AND digest=?').run(namespace,ref.digest));
      }
    },
    forget(namespace:string,operation:string){db(connection=>connection.prepare('DELETE FROM sync_blob_uploads WHERE namespace=? AND operation=?').run(namespace,operation));},
    async upload(namespace:string,operation:string,source:SyncBlobSource){
      const reference=blobReference(source);if(source.bytes.byteLength!==reference.size||hash(source.bytes)!==reference.digest)throw syncError('invalid','同步附件校验失败');
      if(db(connection=>connection.prepare('SELECT 1 FROM sync_blob_uploads WHERE namespace=? AND operation=? AND digest=?').get(namespace,operation,reference.digest)))return;
      const remember=()=>db(connection=>connection.prepare('INSERT OR IGNORE INTO sync_blob_uploads VALUES (?,?,?)').run(namespace,operation,reference.digest));
      const receipt=await status(namespace,reference,true);if(receipt.ready){remember();return;}
      const count=Math.ceil(reference.size/CHUNK),checksums=new Array<string>(count);
      channel.onProgress?.({done:0,total:reference.size});
      await transferParts(count,async part=>{
        const bytes=source.bytes.subarray(part*CHUNK,(part+1)*CHUNK),checksum=hash(bytes),existing=receipt.parts.find(p=>p.part===part);
        checksums[part]=checksum;
        if(existing){if(existing.checksum!==checksum)throw syncError('conflict','同步附件分块冲突');channel.onProgress?.({done:bytes.byteLength,total:0});return;}
        take();await channel.binary('/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:reference.digest,part:String(part)}),bytes);channel.assert();channel.onProgress?.({done:bytes.byteLength,total:0});
      });
      take();await channel.json('/v1/blobs/complete',{namespace,digest:reference.digest,partsDigest:blobPartsDigest(reference.size,checksums)});channel.assert();remember();
    },
    async download(namespace:string,input:SyncBlobReference,protection?:SyncLocalProtection):Promise<Uint8Array>{
      const reference=blobReference(input);
      const cache=blobCache(home,namespace,()=>channel.assert(),protection),cachedParts=cache.parts(reference);
      const count=Math.ceil(reference.size/CHUNK);
      const expectedSize=(part:number)=>Math.min(CHUNK,reference.size-part*CHUNK);
      const corrupt=()=>syncError('invalid','同步暂存校验失败，原数据已保留');
      if(protection&&cachedParts.some(part=>!Number.isSafeInteger(part)||part<0||part>=count))throw corrupt();
      const cached=(part:number)=>{
        const saved=cache.read(reference,part);
        if(!saved)return null;
        if(saved.bytes.byteLength===expectedSize(part)&&hash(saved.bytes)===saved.checksum)return saved;
        if(protection)throw corrupt();
        return null;
      };
      const assemble=()=>{
        const result=Buffer.allocUnsafe(reference.size);
        for(let part=0;part<count;part++){
          const saved=cached(part);
          if(!saved)return null;
          result.set(saved.bytes,part*CHUNK);
        }
        channel.assert();
        return hash(result)===reference.digest?result:null;
      };
      if(cachedParts.length===count&&cachedParts.every((part,i)=>part===i)){
        const result=assemble();
        if(result)return result;
      }
      const receipt=await status(namespace,reference,false);
      if(!receipt.ready||receipt.parts.length!==count)throw syncError('invalid','同步附件尚未就绪');
      channel.onProgress?.({done:0,total:reference.size});
      await transferParts(receipt.parts.length,async part=>{
        const expected=receipt.parts.find(p=>p.part===part)!,size=expectedSize(part);
        const saved=cached(part);
        if(saved?.checksum===expected.checksum){channel.onProgress?.({done:size,total:0});return;}
        take();const bytes=await channel.binary('/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:reference.digest,part:String(part)}));channel.assert();
        if(bytes.byteLength!==size||hash(bytes)!==expected.checksum)throw syncError('invalid','同步附件校验失败');
        cache.write(reference,part,expected.checksum,bytes);channel.onProgress?.({done:size,total:0});
      });
      const result=assemble();
      if(!result)throw syncError('invalid','同步附件校验失败');
      return result;
    },
  };
}
