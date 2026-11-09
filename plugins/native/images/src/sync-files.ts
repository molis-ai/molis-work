import { validateImageValue } from "./replication.js";
import type { PluginOwnerFilesClient, PluginOwnerFilesReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMAGES_ASSETS } from "./owner-files.js";
import { createHash } from 'node:crypto';
import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { GeneratedImage } from './contract.js';
import { imagesErrors } from './error.js';
import { checkedImage } from './providers.js';

export interface PortableImage { id:string;mime_type:GeneratedImage['mime_type'];byte_length:number;data_base64:string }
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as const;
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function checked(value:PortableImage):Buffer {
 if(!value||Object.keys(value).sort().join(',')!=='byte_length,data_base64,id,mime_type'||typeof value.id!=='string'||!value.id||value.id.length>100||!Object.hasOwn(extensions,value.mime_type)||typeof value.data_base64!=='string'||!Number.isSafeInteger(value.byte_length)||value.byte_length<1||value.byte_length>100000000)throw imagesErrors.invalid('同步图片格式无效');
 const bytes=Buffer.from(value.data_base64,'base64');if(bytes.length!==value.byte_length||bytes.toString('base64')!==value.data_base64)throw imagesErrors.invalid('同步图片完整性无效');
 try{checkedImage(bytes,value.mime_type);}catch{throw imagesErrors.invalid('同步图片类型与内容不匹配');}return bytes;
}
/** Pure validation shared by receive and copy preflight; no path or file is created. */
export function validatePortableImage(value:PortableImage):void{checked(value);}
/** Read only owner-recorded names through the Runtime's declared file service. */
export function readPortableImage(files:PluginOwnerFilesReader,image:GeneratedImage):PortableImage {
 if(!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(image.filename))throw imagesErrors.invalid('本机图片文件名无效');
 const bytes=files.read(`${IMAGES_ASSETS}/${image.filename}`);
 if(!bytes||bytes.byteLength!==image.byte_length)throw imagesErrors.invalid('本机图片长度不匹配');
 const value={id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,data_base64:Buffer.from(bytes).toString('base64')};checked(value);return value;
}
function imageReference(jobId:string,image:PortableImage):GeneratedImage {
 const bytes=checked(image),filename=hash(JSON.stringify([jobId,image.id,hash(bytes)]))+'.'+extensions[image.mime_type];
 return {id:image.id,mime_type:image.mime_type,byte_length:image.byte_length,filename};
}
/** Receive commits only already materialized, immutable content. Never opens a native path. */
export function preparedImages(files:PluginOwnerFilesReader,jobId:string,images:PortableImage[]):GeneratedImage[] {
 return images.map(image=>{const reference=imageReference(jobId,image),present=readPortableImage(files,reference);
  if(present.data_base64!==image.data_base64)throw imagesErrors.invalid('目标图片与保留原件不一致');return reference;});
}
export async function prepareImages(files:PluginOwnerFilesClient,jobId:string,images:PortableImage[],authorize:()=>void):Promise<void> {
 const prepared=images.map(image=>({image,reference:imageReference(jobId,image),bytes:checked(image)}));authorize();
 await files.write(writer=>{authorize();writer.mkdir(IMAGES_ASSETS);for(const {image,reference,bytes} of prepared){
  authorize();const path=`${IMAGES_ASSETS}/${reference.filename}`;
  if(writer.stat(path)){const present=readPortableImage(writer,reference);if(present.data_base64!==image.data_base64)throw imagesErrors.invalid('目标图片与保留原件不一致');}
  else writer.writeFile(path,bytes,"create");
 }authorize();});authorize();
}
export function createImagesSyncContent(context:{spaceId:string;authorize():void},files:PluginOwnerFilesClient) {
 const codec=createSyncJsonContent({...context,
  project(_key,input,put){const wire=input as {images:PortableImage[]};return {...wire,images:wire.images.map(image=>({...image,data_base64:put(checked(image))}))};},
  async restore(_key,input,read){const wire=input as {images:(Omit<PortableImage,'data_base64'>&{data_base64:SyncBlobReference})[]};
   if(!Array.isArray(wire.images)||wire.images.length>100)throw imagesErrors.invalid('同步图片清单无效');
   const images:PortableImage[]=[];for(const image of wire.images){images.push({...image,data_base64:Buffer.from(await read(image.data_base64)).toString('base64')});checked(images.at(-1)!);}return {...wire,images};},
 });
 const prepare=async(key:string,value:unknown)=>{
  context.authorize();if(value===null)return;
  const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!=="image"||!parts.every(p=>typeof p==='string'&&p.length>0&&p.length<=80))throw imagesErrors.invalid("图片资产标识无效");
  const wire=validateImageValue(value,context.spaceId,String(parts[0]),String(parts[2]));
  await prepareImages(files,String(parts[2]),wire.images,context.authorize);
 };
 return {...codec,prepare,async decode(key:string,value:unknown,read:(reference:SyncBlobReference)=>Promise<Uint8Array>){const result=await codec.decode(key,value,read);await prepare(key,result);return result;}};
}
