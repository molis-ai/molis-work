import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { shelfPortableBytes, shelfPortableHash } from './sync-files.js';
import { validateShelfPortable } from './sync-shape.js';
import { shelfErrors } from './errors.js';

/** Explicit owner fields only. The common transport never scans Shelf paths or guesses a base64 attachment. */
export function createShelfSyncContent(context: { spaceId: string; authorize(): void }) {
  return createSyncJsonContent({ ...context,
    project(key,input,put) {
      const value=validateShelfPortable(input,context.spaceId,key);
      return {...value,items:value.items.map(item=>{
        if(shelfPortableHash(item.record,item.files)!==item.record.copy_hash)throw shelfErrors.hash_changed('Shelf 文件清单摘要不匹配');
        return {...item,files:item.files.map(file=>{const bytes=shelfPortableBytes(file);return {...file,data:bytes.byteLength?put(bytes):''};})};
      })};
    },
    async restore(key,input,read) {
      const value=validateShelfPortable(input,context.spaceId,key,'references'),items=[];
      for(const item of value.items){
        const files=[];
        for(const file of item.files){context.authorize();const bytes=file.size===0?new Uint8Array():await read(file.data as SyncBlobReference);context.authorize();files.push({...file,data:Buffer.from(bytes).toString('base64')});}
        items.push({...item,files});
      }
      const restored=validateShelfPortable({...value,items},context.spaceId,key);
      for(const item of restored.items)if(shelfPortableHash(item.record,item.files)!==item.record.copy_hash)throw shelfErrors.hash_changed('Shelf 文件清单摘要不匹配');
      return restored;
    },
  });
}
