import { constants, openSync, closeSync, fstatSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { GeneratedImage } from '@molis-ai/molis-work-contracts/modules/images';
import { imagesErrors } from './error.js';
import { checkedImage } from './providers.js';

export interface PortableImage { id:string;mime_type:GeneratedImage['mime_type'];byte_length:number;data_base64:string }
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as const;
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function checkedDirectory(directory:string){const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw imagesErrors.invalid('图片目录不能指向本机其他位置');}
function checked(value:PortableImage):Buffer {
 if(!value||Object.keys(value).sort().join(',')!=='byte_length,data_base64,id,mime_type'||typeof value.id!=='string'||!value.id||value.id.length>100||!Object.hasOwn(extensions,value.mime_type)||typeof value.data_base64!=='string'||!Number.isSafeInteger(value.byte_length)||value.byte_length<1||value.byte_length>100000000)throw imagesErrors.invalid('同步图片格式无效');
 const bytes=Buffer.from(value.data_base64,'base64');if(bytes.length!==value.byte_length||bytes.toString('base64')!==value.data_base64)throw imagesErrors.invalid('同步图片完整性无效');
 try{checkedImage(bytes,value.mime_type);}catch{throw imagesErrors.invalid('同步图片类型与内容不匹配');}return bytes;
}
/** Pure validation shared by receive and copy preflight; no path or file is created. */
export function validatePortableImage(value:PortableImage):void{checked(value);}
/** Only owner-recorded image names are readable, with no symlink traversal. Never a wire-supplied path. */
export function readPortableImage(directory:string,image:GeneratedImage):PortableImage {
 checkedDirectory(directory);
 if(!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(image.filename))throw imagesErrors.invalid('本机图片文件名无效');
 const fd=openSync(join(directory,image.filename),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size!==image.byte_length||stat.size>100000000)throw imagesErrors.invalid('本机图片长度不匹配');
  const value={id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,data_base64:readFileSync(fd).toString('base64')};checked(value);return value;
 }finally{closeSync(fd);}
}
/** Content-addressed per-job files never overwrite a local original; a failed DB commit leaves only an inert file. */
export function savePortableImages(directory:string,jobId:string,images:PortableImage[],authorize:()=>void):GeneratedImage[] {
 const prepared=images.map(image=>({image,bytes:checked(image)}));authorize();mkdirSync(directory,{recursive:true,mode:0o700});checkedDirectory(directory);
 return prepared.map(({image,bytes})=>{
  authorize();const filename=hash(JSON.stringify([jobId,image.id,hash(bytes)]))+'.'+extensions[image.mime_type],path=join(directory,filename);
  let fd:number;
  try{fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(error){if(!error||typeof error!=='object'||!('code' in error)||error.code!=='EEXIST')throw error;
   const present=readPortableImage(directory,{...image,filename});if(present.data_base64!==image.data_base64)throw imagesErrors.invalid('目标图片与保留原件不一致');return {id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,filename};}
  try{writeFileSync(fd,bytes);}finally{closeSync(fd);}authorize();return {id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,filename};
 });
}
export function createImagesSyncContent(context:{spaceId:string;authorize():void}) {
 return createSyncJsonContent({...context,
  project(_key,input,put){const wire=input as {images:PortableImage[]};return {...wire,images:wire.images.map(image=>({...image,data_base64:put(checked(image))}))};},
  async restore(_key,input,read){const wire=input as {images:(Omit<PortableImage,'data_base64'>&{data_base64:SyncBlobReference})[]};
   if(!Array.isArray(wire.images)||wire.images.length>4)throw imagesErrors.invalid('同步图片清单无效');
   const images:PortableImage[]=[];for(const image of wire.images){images.push({...image,data_base64:Buffer.from(await read(image.data_base64)).toString('base64')});checked(images.at(-1)!);}return {...wire,images};},
 });
}
