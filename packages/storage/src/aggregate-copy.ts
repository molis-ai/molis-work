import type {ProjectCopyAsset,ProjectCopyOwner} from '@molis-ai/molis-work-contracts/services/placement';
import {createAggregatePortableOwner,validateAggregatePortableRow,type AggregateDefinition,type AggregateRecords,type AggregateReplicaContext,type PortableRow} from './aggregate-replica.js';
import {readDatabaseSpace} from './space.js';
import {hasReplicaHistory,replicaTransaction,type ReplicaDatabase} from './replica.js';
import {syncError} from './project-replica-sync-errors.js';

export interface AggregateCopyContext extends AggregateReplicaContext {direction:'source'|'target'}
/** Capture immutable scope while preserving class/private-field based authority and project readers. */
export function scopeAggregateCopyContext(context:AggregateCopyContext):AggregateCopyContext {
 if(context.direction!=='source'&&context.direction!=='target')throw syncError('invalid','复制方向无效');
 return Object.freeze({spaceId:context.spaceId,direction:context.direction,authorize:context.authorize.bind(context),project:context.project.bind(context),canUploadProject:context.canUploadProject.bind(context),hasArtifact:context.hasArtifact.bind(context),conflictState:context.conflictState,...(context.hasReference?{hasReference:context.hasReference.bind(context)}:{})});
}
/** Reuses declared owner projections, without opening sync journals for local-space reads. */
export function createAggregateCopy(db:ReplicaDatabase,definitions:readonly AggregateDefinition[],context:AggregateCopyContext):ProjectCopyOwner {
 context=scopeAggregateCopyContext(context);
 const binding=readDatabaseSpace(db);if(!binding||binding.spaceId!==context.spaceId||context.direction==='target'&&binding.kind!=='personal')throw syncError('scope','复制内容不属于当前空间');
 const owner=createAggregatePortableOwner(db,definitions,context);
 const parse=(asset:ProjectCopyAsset)=>{
  context.authorize();const key:unknown=JSON.parse(asset.key);
  if(!Array.isArray(key)||key.length!==3||key.some(part=>typeof part!=='string'||!part||part.length>80))throw syncError('invalid','复制资产标识无效');
  const definition=definitions.find(d=>d.kind===key[1]);if(!definition?.copy)throw syncError('unsupported','此内容尚未提供复制接口');
  const value=asset.value as {format?:unknown;spaceId?:unknown;project?:{id?:unknown;title?:unknown};record?:PortableRow;children?:Record<string,PortableRow[]>};
  if(!value||Object.keys(value).sort().join(',')!=='children,format,project,record,spaceId'||value.format!==1||value.spaceId!==context.spaceId||value.project?.id!==key[0]||typeof value.project?.title!=='string'||!value.record||value.record.id!==key[2]||value.record.project_id!==key[0]||!value.children||Object.keys(value.children).sort().join(',')!==definition.children.map(c=>c.table).sort().join(','))throw syncError('scope','复制资产与原空间、项目不匹配');
  const record=validateAggregatePortableRow(value.record,definition.columns),children:Record<string,PortableRow[]>={};
  for(const child of definition.children){const rows=value.children[child.table];if(!Array.isArray(rows)||rows.length>10000)throw syncError('invalid','复制子记录清单无效');const seen=new Set<string>();children[child.table]=rows.map(input=>{const row=validateAggregatePortableRow(input,child.columns),ids=(child.identityColumns??['id']).map(column=>row[column]);if(row[child.parent]!==key[2]||child.columns.includes('project_id')&&row.project_id!==key[0]||ids.some(id=>typeof id!=='string'||!id||id.length>200)||seen.has(JSON.stringify(ids)))throw syncError('invalid','复制子记录归属或标识无效');seen.add(JSON.stringify(ids));return row;});}
  const records={record,children};definition.validate(records);return {definition,records,projectId:String(key[0]),id:String(key[2])};
 };
 const comparable=(records:AggregateRecords,definition:AggregateDefinition)=>JSON.stringify({record:definition.columns.filter(column=>column!==definition.timestampVersionColumn).map(column=>[column,records.record[column]]),children:definition.children.map(child=>{const rows=records.children[child.table]!.map(row=>JSON.stringify(child.columns.map(column=>[column,row[column]])));return [child.table,child.orderBy==='rowid'?rows:rows.sort()];})});
 return {
  read(reference){context.authorize();const definition=definitions.find(d=>d.copy?.kind===reference.kind);if(!definition||typeof reference.projectId!=='string'||!reference.id||reference.id.length>80)throw syncError('scope','复制引用不属于当前 owner');context.project(reference.projectId);const key=JSON.stringify([reference.projectId,definition.kind,reference.id]),value=owner.read(key);context.authorize();return value===null?null:{key,value};},
  kinds:definitions.filter(d=>d.copy).map(d=>d.copy!.kind),
  snapshot(projectId){context.authorize();return replicaTransaction(db,()=>{context.authorize();context.project(projectId);const result:ProjectCopyAsset[]=[];for(const d of definitions){const rows=db.prepare(`SELECT id FROM ${d.table} WHERE project_id=? ORDER BY id`).all(projectId);if(rows.length&&!d.copy)throw syncError('unsupported','项目包含尚不能复制的保存内容');for(const row of rows){const key=JSON.stringify([projectId,d.kind,row.id]),value=owner.read(key);if(value!==null)result.push({key,value});}}context.authorize();return result;});},
  references(asset){const {definition,records,projectId}=parse(asset);return definition.copy!.references?.(records,projectId)??[];},
  fork(asset,identity){
   if(context.direction!=='source')throw syncError('scope','目标接口不能读取其他原件');
   const {definition,records,projectId,id}=parse(asset);if(identity.sourceSpaceId!==context.spaceId||identity.sourceProjectId!==projectId||identity.targetSpaceId===identity.sourceSpaceId||identity.targetProjectId===identity.sourceProjectId||!identity.targetSpaceId||typeof identity.targetProjectId!=='string'||!identity.targetProjectId||identity.targetProjectId.length>80||!identity.targetTitle?.trim()||identity.targetTitle.length>120)throw syncError('scope','复制映射不属于原项目');
   if(identity.project(projectId)!==identity.targetProjectId)throw syncError('scope','复制项目映射已变化');
   const next=structuredClone(records),targetId=identity.id(definition.copy!.kind,id);if(typeof targetId!=='string'||!targetId||targetId.length>80||targetId===id)throw syncError('invalid','复制必须建立独立新标识');next.record.id=targetId;next.record.project_id=identity.targetProjectId;
   for(const child of definition.children)for(const row of next.children[child.table]!){row[child.parent]=targetId;if(child.columns.includes('project_id'))row.project_id=identity.targetProjectId;if((child.identityColumns??['id']).includes('id'))row.id=identity.id(definition.copy!.kind+'.'+child.table,String(row.id));}
   definition.copy!.rebase?.(next,identity);definition.validate(next);context.authorize();
   return {key:JSON.stringify([identity.targetProjectId,definition.kind,targetId]),value:{format:1,spaceId:identity.targetSpaceId,project:{id:identity.targetProjectId,title:identity.targetTitle},...next}};
  },
  apply(asset){context.authorize();replicaTransaction(db,()=>{
   context.authorize();if(context.direction!=='target'||binding.kind!=='personal')throw syncError('scope','复制只能写入当前个人空间');
   const {definition,records,projectId}=parse(asset);context.project(projectId);const current=owner.read(asset.key);
   if(current!==null){const old=parse({key:asset.key,value:current}).records;if(comparable(old,definition)!==comparable(records,definition))throw syncError('conflict','目标副本已经变化，未覆盖原内容');context.authorize();return;}
   if(hasReplicaHistory(db,asset.key))throw syncError('conflict','目标副本已有删除或替换历史，未重新创建原内容');
   owner.apply(asset.key,asset.value);context.authorize();
  });},
 };
}
