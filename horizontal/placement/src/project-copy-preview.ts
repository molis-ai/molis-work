import {createHash} from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {ProjectCopyAsset,ProjectCopyOwner,ProjectCopyReference} from '@molis-ai/molis-work-contracts/services/placement';

const errors=defineErrorCodes('placement',{copy_invalid:'invalid',copy_unavailable:'unavailable',copy_stale:'conflict',copy_limit:'invalid'});
export interface ProjectCopySource {readonly ownerId:string;readonly owner:ProjectCopyOwner}
export interface ProjectCopyPreviewInput {
 readonly sourceSpaceId:string;
 readonly projectIds:readonly string[];
 /** Only owners whose existing stores have been inspected; this list is not a whole-project coverage claim. */
 readonly sources:readonly ProjectCopySource[];
 authorize():void;
}
export interface ProjectCopyBlocker {readonly reason:'owner_unavailable'|'missing'|'unselected_project';readonly reference:ProjectCopyReference}
export interface ProjectCopyPreviewEntry {readonly ownerId:string;readonly projectId:string|null;readonly asset:ProjectCopyAsset}
export interface ProjectCopyPreviewView {
 readonly sourceSpaceId:string;
 readonly fingerprint:string;
 readonly projectIds:readonly string[];
 readonly assetCount:number;
 /** Owner-portable JSON bytes. This is not a cloud quota or a measurement of external files. */
 readonly savedBytes:number;
 readonly dependencies:readonly ProjectCopyReference[];
 readonly blockers:readonly ProjectCopyBlocker[];
}
export interface ProjectCopyPreview {
 readonly view:ProjectCopyPreviewView;
 /** Re-read all selected roots and typed dependencies before returning any saved body for import. */
 confirm(fingerprint:string):readonly ProjectCopyPreviewEntry[];
}

/** Canonical JSON only; no getters, implicit serialization, lost fields or executable values. */
function canonical(value:unknown,depth=0):string {
 if(depth>100)throw errors.copy_limit('复制内容嵌套过深，原件已保留');
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value)){
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(keys.length!==value.length+1||Object.keys(value).length!==value.length||keys.some(key=>typeof key!=='string'||key!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length||!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key]!,'value'))))throw errors.copy_invalid('复制内容不是完整的 JSON 数组');
  return '['+Array.from({length:value.length},(_,index)=>canonical(descriptors[String(index)]!.value,depth+1)).join(',')+']';
 }
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(keys.some(key=>typeof key!=='string'||!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key]!,'value')))throw errors.copy_invalid('复制内容包含非 JSON 字段');
  return '{'+(keys as string[]).sort().map(key=>JSON.stringify(key)+':'+canonical(descriptors[key]!.value,depth+1)).join(',')+'}';
 }
 throw errors.copy_invalid('复制内容必须由 owner 提供完整 JSON');
}
const referenceKey=(ref:ProjectCopyReference)=>JSON.stringify([ref.kind,ref.projectId,ref.id]);
function checkedReference(input:ProjectCopyReference):ProjectCopyReference {
 if(!input||Object.keys(input).sort().join(',')!=='id,kind,projectId'||typeof input.kind!=='string'||input.kind.length>240||!input.kind.includes(':')||typeof input.id!=='string'||!input.id||input.id.length>240||input.projectId!==null&&(typeof input.projectId!=='string'||!input.projectId||input.projectId.length>80))throw errors.copy_invalid('复制关联标识无效');
 return {kind:input.kind,id:input.id,projectId:input.projectId};
}
function capture(input:ProjectCopyPreviewInput){
 input.authorize();
 const projects=[...input.projectIds].sort();
 if(!input.sourceSpaceId||!input.sources.length||projects.length<1||projects.length>100||new Set(projects).size!==projects.length||projects.some(id=>typeof id!=='string'||!id||id==='personal'||id.length>80))throw errors.copy_invalid('请选择有效的独立项目');
 const byKind=new Map<string,ProjectCopySource>(),byOwner=new Map<string,ProjectCopySource>();
 for(const source of input.sources){
  if(!source.ownerId||byOwner.has(source.ownerId))throw errors.copy_invalid('复制 owner 重复或无效');byOwner.set(source.ownerId,source);
  if(!source.owner.kinds.length)throw errors.copy_invalid('复制 owner 未声明内容种类');
  for(const kind of source.owner.kinds){if(typeof kind!=='string'||!kind.startsWith(source.ownerId+':')||kind.length===source.ownerId.length+1||byKind.has(kind))throw errors.copy_invalid('复制 owner 不能冒用其他内容种类');byKind.set(kind,source);}
 }
 const entries=new Map<string,ProjectCopyPreviewEntry>(),queue:{source:ProjectCopySource;entry:ProjectCopyPreviewEntry}[]=[],dependencies=new Map<string,ProjectCopyReference>(),blockers=new Map<string,ProjectCopyBlocker>();
 let savedBytes=0;
 const add=(source:ProjectCopySource,projectId:string|null,asset:ProjectCopyAsset)=>{
  if(!asset||Object.keys(asset).sort().join(',')!=='key,value'||typeof asset.key!=='string'||!asset.key||asset.key.length>2000)throw errors.copy_invalid('复制资产标识无效');
  const key=JSON.stringify([source.ownerId,asset.key]),body=canonical(asset.value),old=entries.get(key);
  if(old){if(old.projectId!==projectId||canonical(old.asset.value)!==body)throw errors.copy_stale('读取关联内容期间原件已变化，请重新预览');return;}
  savedBytes+=Buffer.byteLength(body);if(entries.size>=50000||savedBytes>512*1024*1024)throw errors.copy_limit('项目内容超过本轮预览预算，原件已保留');
  const entry={ownerId:source.ownerId,projectId,asset:{key:asset.key,value:JSON.parse(body) as unknown}};entries.set(key,entry);queue.push({source,entry});
 };
 // Snapshot every selected project, including empty ones, so additions invalidate confirmation too.
 for(const projectId of projects)for(const source of [...byOwner.values()].sort((a,b)=>a.ownerId.localeCompare(b.ownerId))){input.authorize();for(const asset of source.owner.snapshot(projectId))add(source,projectId,asset);input.authorize();}
 for(let index=0;index<queue.length;index++){
  const {source,entry}=queue[index]!;input.authorize();
  for(const raw of source.owner.references(structuredClone(entry.asset))){
   const reference=checkedReference(raw),key=referenceKey(reference);if(dependencies.has(key))continue;if(dependencies.size>=50000)throw errors.copy_limit('关联内容超过本轮预览预算，原件已保留');dependencies.set(key,reference);
   let reason:ProjectCopyBlocker['reason']|null=null;
   if(reference.projectId!==null&&!projects.includes(reference.projectId))reason='unselected_project';
   const target=byKind.get(reference.kind);if(!reason&&!target)reason='owner_unavailable';
   if(reason){blockers.set(key,{reason,reference});continue;}
   input.authorize();const asset=target!.owner.read(reference);input.authorize();
   if(asset===null){blockers.set(key,{reason:'missing',reference});continue;}add(target!,reference.projectId,asset);
  }
 }
 input.authorize();
 const ordered=[...entries.values()].sort((a,b)=>JSON.stringify([a.ownerId,a.asset.key]).localeCompare(JSON.stringify([b.ownerId,b.asset.key]))),refs=[...dependencies.values()].sort((a,b)=>referenceKey(a).localeCompare(referenceKey(b))),blocked=[...blockers.values()].sort((a,b)=>referenceKey(a.reference).localeCompare(referenceKey(b.reference)));
 const fingerprint=createHash('sha256').update(canonical({format:1,sourceSpaceId:input.sourceSpaceId,projects,owners:[...byOwner.values()].map(s=>({id:s.ownerId,kinds:[...s.owner.kinds].sort()})).sort((a,b)=>a.id.localeCompare(b.id)),entries:ordered,dependencies:refs,blockers:blocked})).digest('hex');
 return {entries:ordered,view:{sourceSpaceId:input.sourceSpaceId,fingerprint,projectIds:projects,assetCount:ordered.length,savedBytes,dependencies:refs,blockers:blocked}};
}

/** Generic dependency closure over owner ports. It neither opens stores nor creates projects. */
export function previewProjectCopy(input:ProjectCopyPreviewInput):ProjectCopyPreview {
 const authorize=input.authorize.bind(input),scope={sourceSpaceId:input.sourceSpaceId,projectIds:[...input.projectIds],sources:input.sources.map(source=>({ownerId:source.ownerId,owner:source.owner})),authorize};
 const saved=capture(scope);
 // The returned view contains no source bodies and cannot mutate the saved confirmation state.
 return {get view(){return structuredClone(saved.view);},confirm(fingerprint){
  authorize();if(fingerprint!==saved.view.fingerprint)throw errors.copy_stale('复制预览已变化，请重新预览');
  if(saved.view.blockers.length)throw errors.copy_unavailable('关联内容尚未齐全，未开始复制');
  const current=capture(scope);if(current.view.fingerprint!==fingerprint)throw errors.copy_stale('原项目或关联内容已变化，请重新预览');
  authorize();return structuredClone(saved.entries);
 }};
}
