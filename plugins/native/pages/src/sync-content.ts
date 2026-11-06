import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';

/** The Pages owner chooses its document body; the platform does not inspect arbitrary plugin records. */
export function createPagesSyncContent(context:{spaceId:string;authorize():void}) {
  return createSyncJsonContent({...context,
    project(_key,input,put){
      const value=input as {record?:{body?:unknown}};
      const walk=(node:unknown,depth=0):unknown=>{
        if(depth>100)throw syncError('invalid','文档图片结构过深');
        if(typeof node==='string'){
          const match=/^(data:image\/(?:png|jpeg|gif|webp);base64,)([A-Za-z0-9+/]+={0,2})$/i.exec(node);
          if(!match)return node;
          const bytes=Buffer.from(match[2]!,'base64');if(bytes.toString('base64')!==match[2])throw syncError('invalid','文档图片编码无效');
          return {sync_image:put(bytes),prefix:match[1]};
        }
        if(Array.isArray(node))return node.map(child=>walk(child,depth+1));
        if(node&&typeof node==='object'){
          if(Object.hasOwn(node,'sync_image'))throw syncError('invalid','文档包含保留的同步字段');
          return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,walk(child,depth+1)]));
        }
        return node;
      };
      if(value.record&&Object.hasOwn(value.record,'body'))value.record.body=walk(value.record.body);
      return value;
    },
    async restore(_key,input,read){
      const value=input as {record?:{body?:unknown}};
      const walk=async(node:unknown,depth=0):Promise<unknown>=>{
        if(depth>100)throw syncError('invalid','文档图片结构过深');
        if(Array.isArray(node)){const values=[];for(const child of node)values.push(await walk(child,depth+1));return values;}
        if(node&&typeof node==='object'){
          const row=node as Record<string,unknown>;
          if(Object.hasOwn(row,'sync_image')){
            if(Object.keys(row).sort().join(',')!=='prefix,sync_image'||typeof row.prefix!=='string'||!/^data:image\/(png|jpeg|gif|webp);base64,$/i.test(row.prefix))throw syncError('invalid','文档图片引用无效');
            return row.prefix+Buffer.from(await read(row.sync_image as SyncBlobReference)).toString('base64');
          }
          const entries=[];for(const [key,child] of Object.entries(row))entries.push([key,await walk(child,depth+1)]);return Object.fromEntries(entries);
        }
        return node;
      };
      if(value.record&&Object.hasOwn(value.record,'body'))value.record.body=await walk(value.record.body);
      return value;
    },
  });
}
