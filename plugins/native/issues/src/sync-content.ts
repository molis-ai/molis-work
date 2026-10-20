import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';

/** Only the Issue owner's declared image column is projected; unrelated JSON is never searched for files. */
export function createIssueSyncContent(context: {spaceId:string;authorize():void}) {
  return createSyncJsonContent({...context,
    project(_key,input,put) {
      const value=input as {spaceId?:unknown;record?:{images_json?:unknown}};
      if(value.spaceId!==context.spaceId||typeof value.record?.images_json!=='string')throw syncError('invalid','Issue 图片同步格式无效');
      const images=JSON.parse(value.record.images_json) as {name:string;data_url:string}[];
      value.record.images_json=images.map(image=>{
        const match=/^(data:image\/(?:png|jpeg|webp);base64,)([A-Za-z0-9+/]+={0,2})$/.exec(image.data_url);
        if(!match)throw syncError('invalid','Issue 图片编码无效');
        const bytes=Buffer.from(match[2]!,'base64');if(bytes.toString('base64')!==match[2])throw syncError('invalid','Issue 图片编码无效');
        return {name:image.name,prefix:match[1],file:put(bytes)};
      });return value;
    },
    async restore(_key,input,read) {
      const value=input as {spaceId?:unknown;record?:{images_json?:unknown}};
      if(value.spaceId!==context.spaceId||!value.record||!Array.isArray(value.record.images_json))throw syncError('invalid','Issue 图片同步格式无效');
      const images=[];
      for(const row of value.record.images_json as {name:string;prefix:string;file:SyncBlobReference}[]){
        if(Object.keys(row).sort().join(',')!=='file,name,prefix'||typeof row.name!=='string'||!/^data:image\/(png|jpeg|webp);base64,$/.test(row.prefix))throw syncError('invalid','Issue 图片引用无效');
        images.push({name:row.name,data_url:row.prefix+Buffer.from(await read(row.file)).toString('base64')});
      }
      value.record.images_json=JSON.stringify(images);return value;
    },
  });
}
