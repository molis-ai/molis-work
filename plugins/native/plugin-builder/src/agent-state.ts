import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {AgentBuild,AgentRelease} from './agent-model.js';

export interface BuilderSavedState {format:2;builds:AgentBuild[];releases:AgentRelease[];revisions:Record<string,number>}
const errors=defineErrorCodes('plugin_builder',{store_invalid:'invalid',store_limit:'too_large'});
const invalid=():never=>{throw errors.store_invalid('创作数据格式版本无效，原内容已保留');};
const identity=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=200;
const revision=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
export function nextBuilderRevision(value:number):number{
 if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(value+1))throw errors.store_limit('草稿编辑版本已达上限，原内容已保留');
 return value+1;
}
/** One current owner document. A different format is refused without rewriting or empty-state recovery. */
export function parseBuilderState(raw:string|null):BuilderSavedState{
 if(raw===null)return {format:2,builds:[],releases:[],revisions:{}};
 let value:unknown;try{value=JSON.parse(raw);}catch{return invalid();}
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(',')!=='builds,format,releases,revisions'||row.format!==2
  ||!Array.isArray(row.builds)||!Array.isArray(row.releases)||row.builds.length>10000||row.releases.length>10000
  ||!row.revisions||typeof row.revisions!=='object'||Array.isArray(row.revisions))return invalid();
 const floors=row.revisions as Record<string,unknown>;
 if(Object.keys(floors).length>100000||Object.entries(floors).some(([id,version])=>!identity(id)||!revision(version)))return invalid();
 const ids=new Set<string>();
 for(const item of row.builds){
  if(!item||typeof item!=='object'||!identity(item.id)||!revision(item.revision)||ids.has(item.id)
   ||!Object.hasOwn(floors,item.id)||floors[item.id]!==item.revision)return invalid();
  ids.add(item.id);
 }
 const releases=new Set<string>();
 for(const item of row.releases){
  if(!item||typeof item!=='object'||!identity(item.buildId)||!identity(item.pluginId)||!revision(item.version))return invalid();
  const id=JSON.stringify([item.buildId,item.version]);if(releases.has(id))return invalid();releases.add(id);
 }
 return value as BuilderSavedState;
}
