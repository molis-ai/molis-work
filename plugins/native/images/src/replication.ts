import { createHash } from 'node:crypto';
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { PluginOwnerFilesReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import { imagesCopy } from "./copy.js";
import type { PluginSyncDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { GeneratedImage } from './contract.js';
import { imagesErrors } from './error.js';
import { readPortableImage, preparedImages,validatePortableImage, type PortableImage } from './sync-files.js';


const columns=['id','project_id','connection_name','api_format','model','prompt','size','aspect_ratio','status','error','created_at','finished_at'] as const;
type RecordValue=Record<(typeof columns)[number],string|null>;
interface Wire {format:1;spaceId:string;project:{id:string;title:string};record:RecordValue;images:PortableImage[]}
function keyParts(key:string){const p:unknown=JSON.parse(key);if(!Array.isArray(p)||p.length!==3||p[1]!=='image'||!p.every(v=>typeof v==='string'&&v.length>0&&v.length<=80))throw imagesErrors.invalid('图片资产标识无效');return {projectId:String(p[0]),id:String(p[2])};}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw imagesErrors.invalid('图片同步记录无效');return value as Record<string,unknown>;}
export function validateImageValue(value:unknown,spaceId:string,projectId:string,id:string):Wire {
 const w=object(value),p=object(w.project),row=object(w.record);
 if(Object.keys(w).sort().join(',')!=='format,images,project,record,spaceId'||w.format!==1||w.spaceId!==spaceId||Object.keys(p).sort().join(',')!=='id,title'||p.id!==projectId||typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw imagesErrors.invalid('图片同步空间或项目不匹配');
 if(Object.keys(row).sort().join(',')!==[...columns].sort().join(',')||row.id!==id||row.project_id!==projectId||!columns.every(c=>typeof row[c]==='string'||(c==='finished_at'&&row[c]===null))||!['succeeded','failed','cancelled','interrupted'].includes(String(row.status))||!['openai-images','gemini'].includes(String(row.api_format))||String(row.prompt).length>100000||!Number.isFinite(Date.parse(String(row.created_at)))||(row.finished_at!==null&&!Number.isFinite(Date.parse(String(row.finished_at))))||!Array.isArray(w.images)||w.images.length>100)throw imagesErrors.invalid('图片同步业务字段无效');
 const ids=new Set<string>();for(const image of w.images){const item=object(image);if(typeof item.id!=='string'||ids.has(item.id))throw imagesErrors.invalid('重复或无效图片标识');ids.add(item.id);validatePortableImage(image as PortableImage);}
 if(Buffer.byteLength(JSON.stringify(value))>100000000)throw imagesErrors.sync_limit('图片记录超过账号容量上限');return value as Wire;
}
export const imagesTracking: PluginSyncCollectionDefinition["tracking"] = [{table:"jobs",key:[{column:"project_id"},{literal:"image"},{column:"id"}]}];
export function imagesCollection(files:PluginOwnerFilesReader):PluginSyncCollectionDefinition {
 return {tracking:imagesTracking,copy:imagesCopy,create(db,context) {
 const local=(projectId:string,id:string)=>{const row=db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(row&&row.project_id!==projectId)throw imagesErrors.invalid('图片标识属于其他项目');return row;};
 return {
  authorizeKey(key){context.project(keyParts(key).projectId);},
  belongsToProject:(key:string,projectId:string)=>keyParts(key).projectId===projectId,
  canUpload(key:string){const {projectId,id}=keyParts(key);return context.canUploadProject(projectId)&&local(projectId,id)?.status!=='running';},
  read(key:string){const {projectId,id}=keyParts(key),row=local(projectId,id);if(!row)return null;
   if(row.status==='running')throw imagesErrors.sync_busy('图片仍在本机生成');
   const wire={format:1,spaceId:context.spaceId,project:{id:projectId,title:context.project(projectId).title},record:Object.fromEntries(columns.map(c=>[c,row[c]])),images:(JSON.parse(String(row.images_json)) as GeneratedImage[]).map(image=>readPortableImage(files,image))};return validateImageValue(wire,context.spaceId,projectId,id);
  },
  apply(key:string,value:unknown){const {projectId,id}=keyParts(key),row=local(projectId,id);context.project(projectId);if(row?.status==='running')throw imagesErrors.sync_busy('本机正在生成，暂不能覆盖或删除');
   if(value===null){db.prepare('DELETE FROM jobs WHERE id=? AND project_id=?').run(id,projectId);return;}
   const wire=validateImageValue(value,context.spaceId,projectId,id),images=preparedImages(files,id,wire.images);
   const saved={...wire.record,request_id:'sync:'+id,input_hash:createHash('sha256').update(JSON.stringify(wire.record)).digest('hex'),connection_id:'',runner_id:null,images_json:JSON.stringify(images)};
   const fields=[...columns,'request_id','input_hash','connection_id','runner_id','images_json'] as const;
   db.prepare(`INSERT INTO jobs (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${fields.filter(c=>c!=='id').map(c=>c+'=excluded.'+c).join(',')}`).run(...fields.map(c=>saved[c]));
  },
 };
 }};
}

export const imagesSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'saved_images',title:'图片与生成历史',schema_version: 2,requires:[],tracking:imagesTracking}]};
