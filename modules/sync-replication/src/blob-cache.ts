import type { SyncBlobReference, SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { openSyncDatabase } from './database.js';
import { pinSyncProtection } from './local-protection.js';
import { syncError } from './sync-errors.js';

export function blobCache(home:string,namespace:string,authorize:()=>void,protection?:SyncLocalProtection) {
  pinSyncProtection(home,namespace,authorize,protection);
  const db=<T>(run:(connection:ReturnType<typeof openSyncDatabase>)=>T):T=>{
    authorize();const connection=openSyncDatabase(home);try{const result=run(connection);authorize();return result;}finally{connection.close();}
  };
  const binding=(ref:SyncBlobReference,part:number,checksum:string)=>JSON.stringify(['blob_part',namespace,ref.digest,ref.size,part,checksum]);
  return {
    read(ref:SyncBlobReference){
      return db(c=>c.prepare('SELECT part,checksum,bytes FROM sync_blob_parts WHERE namespace=? AND digest=? ORDER BY part').all(namespace,ref.digest)).map(row=>{
        if(!Number.isSafeInteger(row.part)||typeof row.checksum!=='string'||!(row.bytes instanceof Uint8Array))throw syncError('invalid','同步暂存格式无效，原数据已保留');
        const part=Number(row.part),checksum=row.checksum,bytes=protection?protection.open(row.bytes,binding(ref,part,checksum)):row.bytes;
        authorize();if(!(bytes instanceof Uint8Array))throw syncError('invalid','同步暂存保护失败');
        return {part,checksum,bytes};
      });
    },
    write(ref:SyncBlobReference,part:number,checksum:string,bytes:Uint8Array){
      authorize();const stored=protection?protection.seal(bytes,binding(ref,part,checksum)):bytes;authorize();
      if(!(stored instanceof Uint8Array)||!stored.length)throw syncError('invalid','同步暂存保护失败');
      db(c=>c.prepare('INSERT INTO sync_blob_parts VALUES (?,?,?,?,?) ON CONFLICT(namespace,digest,part) DO UPDATE SET checksum=excluded.checksum,bytes=excluded.bytes').run(namespace,ref.digest,part,checksum,stored));
    },
  };
}
