import {createHash} from 'node:crypto';
import type {SyncBlobReference,SyncBlobSource,SyncLocalProtection} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {openSyncDatabase} from './database.js';
import {syncError} from './sync-errors.js';
import {blobCache} from './blob-cache.js';

const CHUNK=4*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function blobReference(input:unknown):SyncBlobReference {
  if(!input||typeof input!=='object'||!('digest' in input)||!('size' in input)||typeof input.digest!=='string'||!/^[a-f0-9]{64}$/.test(input.digest)||!Number.isSafeInteger(input.size)||Number(input.size)<1||Number(input.size)>100000000)throw syncError('invalid','同步附件引用无效');
  return {digest:input.digest,size:Number(input.size)};
}
interface Receipt extends SyncBlobReference {ready:boolean;parts:{part:number;checksum:string}[]}
export interface BlobChannel {
  assert():void;
  json<T>(route:string,body?:unknown):Promise<T>;
  binary(route:string,body?:Uint8Array):Promise<Uint8Array>;
}
/** One cycle has a bounded request budget; D1 receipts and local parts survive a process restart. */
export function blobTransfer(home:string,channel:BlobChannel){
  let remaining=32;
  const take=()=>{channel.assert();if(remaining--<=0)throw syncError('busy','附件传输尚未完成，请继续同步');};
  const db=<T>(run:(db:ReturnType<typeof openSyncDatabase>)=>T)=>{channel.assert();const connection=openSyncDatabase(home);try{return run(connection);}finally{connection.close();}};
  const status=async(namespace:string,reference:SyncBlobReference,reserve:boolean)=>{
    take();const receipt=reserve?await channel.json<Receipt>('/v1/blobs/reserve',{namespace,...reference}):await channel.json<Receipt>('/v1/blobs/status?'+new URLSearchParams({namespace,digest:reference.digest}));channel.assert();
    if(receipt.digest!==reference.digest||receipt.size!==reference.size||typeof receipt.ready!=='boolean'||!Array.isArray(receipt.parts)||receipt.parts.length>24)throw syncError('invalid','同步附件响应无效');
    const seen=new Set<number>();for(const part of receipt.parts){if(!Number.isSafeInteger(part.part)||part.part<0||part.part>=Math.ceil(reference.size/CHUNK)||seen.has(part.part)||!/^[a-f0-9]{64}$/.test(part.checksum))throw syncError('invalid','同步附件响应无效');seen.add(part.part);}
    return receipt;
  };
  return {
    release(namespace:string,references:SyncBlobReference[]){for(const reference of references){const ref=blobReference(reference);db(connection=>connection.prepare('DELETE FROM sync_blob_parts WHERE namespace=? AND digest=?').run(namespace,ref.digest));}},
    forget(namespace:string,operation:string){db(connection=>connection.prepare('DELETE FROM sync_blob_uploads WHERE namespace=? AND operation=?').run(namespace,operation));},
    async upload(namespace:string,operation:string,source:SyncBlobSource){
      const reference=blobReference(source);if(source.bytes.byteLength!==reference.size||hash(source.bytes)!==reference.digest)throw syncError('invalid','同步附件校验失败');
      if(db(connection=>connection.prepare('SELECT 1 FROM sync_blob_uploads WHERE namespace=? AND operation=? AND digest=?').get(namespace,operation,reference.digest)))return;
      const remember=()=>db(connection=>connection.prepare('INSERT OR IGNORE INTO sync_blob_uploads VALUES (?,?,?)').run(namespace,operation,reference.digest));
      const receipt=await status(namespace,reference,true);if(receipt.ready){remember();return;}
      for(let part=0;part<Math.ceil(reference.size/CHUNK);part++){
        const bytes=source.bytes.subarray(part*CHUNK,(part+1)*CHUNK),checksum=hash(bytes),existing=receipt.parts.find(p=>p.part===part);
        if(existing){if(existing.checksum!==checksum)throw syncError('conflict','同步附件分块冲突');continue;}
        take();await channel.binary('/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:reference.digest,part:String(part)}),bytes);channel.assert();
      }
      take();await channel.json('/v1/blobs/complete',{namespace,digest:reference.digest});channel.assert();remember();
    },
    async download(namespace:string,input:SyncBlobReference,protection?:SyncLocalProtection):Promise<Uint8Array>{
      const reference=blobReference(input);
      const cache=blobCache(home,namespace,()=>channel.assert(),protection),cachedParts=cache.read(reference);
      if(protection&&cachedParts.some(p=>p.part<0||p.part>=Math.ceil(reference.size/CHUNK)||p.bytes.byteLength!==Math.min(CHUNK,reference.size-p.part*CHUNK)||hash(p.bytes)!==p.checksum))throw syncError('invalid','同步暂存校验失败，原数据已保留');
      if(cachedParts.length===Math.ceil(reference.size/CHUNK)&&cachedParts.every((p,i)=>p.part===i&&p.bytes instanceof Uint8Array&&p.bytes.byteLength===Math.min(CHUNK,reference.size-i*CHUNK)&&hash(p.bytes)===p.checksum)){
        const bytes=Buffer.concat(cachedParts.map(p=>p.bytes as Uint8Array));if(hash(bytes)===reference.digest){channel.assert();return bytes;}
      }
      const receipt=await status(namespace,reference,false);
      if(!receipt.ready||receipt.parts.length!==Math.ceil(reference.size/CHUNK))throw syncError('invalid','同步附件尚未就绪');
      const parts:Uint8Array[]=[];
      for(let part=0;part<receipt.parts.length;part++){
        const expected=receipt.parts.find(p=>p.part===part)!,size=Math.min(CHUNK,reference.size-part*CHUNK);
        const cached=cachedParts.find(row=>row.part===part);
        let bytes:Uint8Array|null=cached?.bytes instanceof Uint8Array?cached.bytes:null;
        if(!bytes||cached?.checksum!==expected.checksum||bytes.byteLength!==size||hash(bytes)!==expected.checksum){
          take();bytes=await channel.binary('/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:reference.digest,part:String(part)}));channel.assert();
          if(bytes.byteLength!==size||hash(bytes)!==expected.checksum)throw syncError('invalid','同步附件校验失败');
          cache.write(reference,part,expected.checksum,bytes);
        }
        parts.push(bytes);
      }
      const result=Buffer.concat(parts);if(hash(result)!==reference.digest)throw syncError('invalid','同步附件校验失败');channel.assert();return result;
    },
  };
}
