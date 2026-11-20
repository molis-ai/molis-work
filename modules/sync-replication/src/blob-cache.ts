import type { SyncBlobReference, SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { withSyncDatabase } from './database.js';
import { pinSyncProtection } from './local-protection.js';
import { syncError } from './sync-errors.js';
import {blobFiles} from './blob-files.js';

export function blobCache(home:string,namespace:string,authorize:()=>void,protection?:SyncLocalProtection) {
  pinSyncProtection(home,namespace,authorize,protection);
  const db=<T>(run:(connection:import('node:sqlite').DatabaseSync)=>T):T=>{
    authorize();return withSyncDatabase(home,connection=>{const result=run(connection);authorize();return result;});
  };
  const binding=(ref:SyncBlobReference,part:number,checksum:string)=>JSON.stringify(['blob_part',namespace,ref.digest,ref.size,part,checksum]);
  const files=protection?null:blobFiles(home,namespace,authorize);
  return {
    parts(ref:SyncBlobReference){
      files?.reap(ref.digest,Date.now()-86_400_000);
      const saved=db(c=>c.prepare('SELECT part FROM sync_blob_parts WHERE namespace=? AND digest=? ORDER BY part').all(namespace,ref.digest).map(row=>Number(row.part)));
      return [...new Set([...saved,...(files?.parts(ref.digest)??[])])].sort((a,b)=>a-b);
    },
    read(ref:SyncBlobReference,part:number){
      const file=files?.read(ref.digest,part);
      if(file)return file;
      const row=db(c=>c.prepare('SELECT checksum,bytes FROM sync_blob_parts WHERE namespace=? AND digest=? AND part=?').get(namespace,ref.digest,part));
      if(!row)return null;
      if(typeof row.checksum!=='string'||!(row.bytes instanceof Uint8Array))throw syncError('invalid','同步暂存格式无效，原数据已保留');
      const {checksum}=row,bytes=protection?protection.open(row.bytes,binding(ref,part,checksum)):row.bytes;
      authorize();if(!(bytes instanceof Uint8Array))throw syncError('invalid','同步暂存保护失败');
      return {checksum,bytes};
    },
    write(ref:SyncBlobReference,part:number,checksum:string,bytes:Uint8Array){
      if(files){files.write(ref.digest,part,checksum,bytes);return;}
      authorize();const stored=protection?protection.seal(bytes,binding(ref,part,checksum)):bytes;authorize();
      if(!(stored instanceof Uint8Array)||!stored.length)throw syncError('invalid','同步暂存保护失败');
      db(c=>c.prepare('INSERT INTO sync_blob_parts VALUES (?,?,?,?,?) ON CONFLICT(namespace,digest,part) DO UPDATE SET checksum=excluded.checksum,bytes=excluded.bytes').run(namespace,ref.digest,part,checksum,stored));
    },
  };
}
