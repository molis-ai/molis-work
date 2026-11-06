import { IMAGES_PLUGIN_ID } from './contract.js';
import type { ProjectCopyAsset, ProjectCopyIdentity, ProjectCopyReference } from '@molis-ai/molis-work-contracts/services/placement';
import type { PluginSyncBusinessReader } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { validateImageValue } from './replication.js';
import { imagesErrors } from './error.js';

const kind=IMAGES_PLUGIN_ID+':image';
function parseKey(key:string):[string,string] {
 const parts:unknown=JSON.parse(key);
 if(!Array.isArray(parts)||parts.length!==3||parts[1]!=='image'||!parts.every(p=>typeof p==='string'&&p.length>0&&p.length<=80))throw imagesErrors.invalid('图片复制标识无效');
 return [String(parts[0]),String(parts[2])];
}
const comparable=(value:ReturnType<typeof validateImageValue>)=>JSON.stringify([value.format,value.spaceId,value.project.id,value.project.title,Object.keys(value.record).sort().map(key=>[key,Reflect.get(value.record,key)]),value.images.map(image=>[image.id,image.mime_type,image.byte_length,image.data_base64])]);
/** Business identity and projection only. The platform owns leases, transactions and prior-deletion checks. */
export const imagesCopy = {
 kind,
 keys(db:PluginSyncBusinessReader,projectId:string):readonly string[] {
  return db.prepare('SELECT id FROM jobs WHERE project_id=? ORDER BY id').all(projectId).map(row=>JSON.stringify([projectId,'image',row.id]));
 },
 key(reference:ProjectCopyReference):string {
  if(reference.kind!==kind||typeof reference.projectId!=='string')throw imagesErrors.invalid('图片复制引用不匹配');
  const key=JSON.stringify([reference.projectId,'image',reference.id]);parseKey(key);return key;
 },
 validate(asset:ProjectCopyAsset,context:AggregateReplicaContext):void {
  context.authorize();const [projectId,id]=parseKey(asset.key);context.project(projectId);validateImageValue(asset.value,context.spaceId,projectId,id);
 },
 references(_asset:ProjectCopyAsset):readonly ProjectCopyReference[] {return [];},
 fork(asset:ProjectCopyAsset,identity:ProjectCopyIdentity):ProjectCopyAsset {
  const [projectId,originalId]=parseKey(asset.key),original=validateImageValue(asset.value,identity.sourceSpaceId,projectId,originalId);
  if(identity.sourceProjectId!==projectId||!identity.targetProjectId||identity.targetSpaceId===identity.sourceSpaceId||identity.project(projectId)!==identity.targetProjectId)throw imagesErrors.invalid('图片复制空间映射无效');
  const id=identity.id(kind,originalId),value=structuredClone(original);
  if(!id||id===originalId||id.length>80||identity.targetProjectId===projectId)throw imagesErrors.invalid('图片复制必须使用独立身份');
  value.spaceId=identity.targetSpaceId;value.project={id:identity.targetProjectId,title:identity.targetTitle};value.record.id=id;value.record.project_id=identity.targetProjectId;
  value.images=value.images.map(image=>({...image,id:identity.id(kind+'.image',image.id)}));
  validateImageValue(value,value.spaceId,identity.targetProjectId,id);return {key:JSON.stringify([identity.targetProjectId,'image',id]),value};
 },
 equivalent(left:unknown,right:unknown):boolean {return comparable(left as ReturnType<typeof validateImageValue>)===comparable(right as ReturnType<typeof validateImageValue>);},
};
