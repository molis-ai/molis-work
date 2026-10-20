import {join} from 'node:path';
import {IMAGES_PLUGIN_ID} from '@molis-ai/molis-work-contracts/modules/images';
import type {ProjectCopyAsset} from '@molis-ai/molis-work-contracts/services/placement';
import {hasReplicaHistory,openBaselineHomeSqlite,openOwnerCopyStore,replicaTransaction,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {IMAGES_STORE_BASELINE} from './store.js';
import {createImagesPortableOwner,initializeImagesReplication,validateImageValue} from './replication.js';
import {imagesErrors} from './error.js';

const kind=IMAGES_PLUGIN_ID+':image';
const comparable=(value:ReturnType<typeof validateImageValue>)=>JSON.stringify([value.format,value.spaceId,value.project.id,value.project.title,Object.keys(value.record).sort().map(key=>[key,Reflect.get(value.record,key)]),value.images.map(image=>[image.id,image.mime_type,image.byte_length,image.data_base64])]);
/** No runner, connection, provider or model is opened by this owner port. */
export function openImagesCopyOwner(home:string,context:AggregateCopyContext){
 return openOwnerCopyStore(home,'images',IMAGES_STORE_BASELINE,context,(db,scope)=>{
  if(scope.direction==='target')initializeImagesReplication(db);const saved=createImagesPortableOwner(db,join(home,'images','assets'),scope);
  const parse=(asset:ProjectCopyAsset)=>{
   scope.authorize();const parts:unknown=JSON.parse(asset.key);if(!Array.isArray(parts)||parts.length!==3||parts[1]!=='image'||parts.some(part=>typeof part!=='string'||!part||part.length>80))throw imagesErrors.invalid('图片复制标识无效');
   const projectId=String(parts[0]),id=String(parts[2]);scope.project(projectId);return {projectId,id,value:validateImageValue(asset.value,scope.spaceId,projectId,id)};
  };
  return {kinds:[kind],read(reference){scope.authorize();if(reference.kind!==kind||typeof reference.projectId!=='string')throw imagesErrors.invalid('图片复制引用不匹配');const key=JSON.stringify([reference.projectId,'image',reference.id]),value=saved.read(key);scope.authorize();return value===null?null:{key,value};},
   snapshot(projectId){scope.authorize();scope.project(projectId);return replicaTransaction(db,()=>{const assets=db.prepare('SELECT id FROM jobs WHERE project_id=? ORDER BY id').all(projectId).map(row=>{const key=JSON.stringify([projectId,'image',row.id]);return {key,value:saved.read(key)};});scope.authorize();return assets;});},
   references(asset){parse(asset);return [];},
   fork(asset,identity){
    const original=parse(asset);if(scope.direction!=='source'||identity.sourceSpaceId!==scope.spaceId||identity.sourceProjectId!==original.projectId||!identity.targetProjectId||identity.targetSpaceId===scope.spaceId||identity.project(original.projectId)!==identity.targetProjectId)throw imagesErrors.invalid('图片复制空间映射无效');
    const id=identity.id(kind,original.id),value=structuredClone(original.value);if(!id||id===original.id||id.length>80||identity.targetProjectId===original.projectId)throw imagesErrors.invalid('图片复制必须使用独立身份');
    value.spaceId=identity.targetSpaceId;value.project={id:identity.targetProjectId,title:identity.targetTitle};value.record.id=id;value.record.project_id=identity.targetProjectId;value.images=value.images.map(image=>({...image,id:identity.id(kind+'.image',image.id)}));validateImageValue(value,value.spaceId,identity.targetProjectId,id);scope.authorize();return {key:JSON.stringify([identity.targetProjectId,'image',id]),value};
   },
   apply(asset){scope.authorize();if(scope.direction!=='target')throw imagesErrors.invalid('源图片接口只读');replicaTransaction(db,()=>{scope.authorize();const incoming=parse(asset),current=saved.read(asset.key);if(current!==null){if(comparable(current)!==comparable(incoming.value))throw imagesErrors.copy_conflict('目标图片副本已经变化，未覆盖原内容');scope.authorize();return;}if(hasReplicaHistory(db,asset.key))throw imagesErrors.copy_conflict('目标图片副本已有删除历史，未重新创建原内容');saved.apply(asset.key,incoming.value);scope.authorize();});},
  };
 },()=>openBaselineHomeSqlite(home,'images',IMAGES_STORE_BASELINE));
}
