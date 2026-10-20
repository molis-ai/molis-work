import {existsSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {join,resolve,relative,sep,isAbsolute} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import type {PrivateValueReplicationOwner} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {PluginSyncDeclaration} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {AgentBuild,AgentRelease} from './agent-model.js';
import {parseBuilderState,nextBuilderRevision,type BuilderSavedState} from './agent-state.js';
import {assertBuilderIdle,builderSyncInvalid,portableBuilderBuild,portableBuilderRelease,validateBuilderPortable,type BuilderPortableState} from './sync-shape.js';
import {captureBuilderDirectory,stageBuilderDirectories,copyEditableBuilderDirectories,type BuilderPortableDirectory} from './sync-files.js';

export const BUILDER_CONTENT_REPLICA_ID='builder_content';
export const builderSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'authoring',title:'插件创作与发布内容',schema_version:1,requires:[]}]};
const errors=defineErrorCodes('plugin_builder',{sync_unavailable:'unavailable'});
const unavailable=():never=>{throw errors.sync_unavailable('完整创作内容暂不可用，原内容已保留');};
export interface BuilderReplicationOptions {home?:string;authorize?():void;assertIdle?(projectId:string,itemId:string):void}
/** Called only by an explicit local continuation, never during passive import. */
export function prepareBuilderLocalEdit(options:BuilderReplicationOptions,projectId:string,build:AgentBuild):string|undefined{
 if(!build.directory)return undefined;const base=root(options,projectId),source=sourcePath(options,projectId,build.directory);
 if(!/^sync\/[a-f0-9]{64}\/(?:current|history-[0-9]+)$/.test(relative(base,source.path).split(sep).join('/')))return build.directory;
 options.authorize?.();assertBuilderIdle([build]);options.assertIdle?.(projectId,build.id);
 const entries=[captureBuilderDirectory(base,source.path,'current')];if(existsSync(source.path+'.settled'))entries.push(captureBuilderDirectory(base,source.path+'.settled','current-settled'));
 return copyEditableBuilderDirectories(base,build.id,entries,()=>{options.authorize?.();options.assertIdle?.(projectId,build.id);});
}
function root(options:BuilderReplicationOptions,projectId:string,create=false):string{
 if(!options.home)return unavailable();if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(projectId))return builderSyncInvalid();
 // Canonicalizing the trusted Home is allowed; owner descendants must never be symbolic links.
 let current=realpathSync(options.home);
 for(const part of ['plugin-builder',projectId]){current=join(current,part);if(!existsSync(current)){if(!create)return unavailable();mkdirSync(current,{mode:0o700});}
  const stat=lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())builderSyncInvalid();}
 return current;
}
function sourcePath(options:BuilderReplicationOptions,projectId:string,path:string):{root:string;path:string}{
 if(!options.home)return unavailable();const original=resolve(options.home,'plugin-builder',projectId),base=root(options,projectId);
 // The Home may have a system alias such as /var -> /private/var; all owner descendants are still checked.
 const full=resolve(path),inside=(p:string)=>!!p&&!isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep);
 const fromOriginal=relative(original,full),fromCanonical=relative(base,full),part=inside(fromOriginal)?fromOriginal:fromCanonical;
 if(!inside(part))return builderSyncInvalid();return {root:base,path:join(base,part)};
}
function capture(options:BuilderReplicationOptions,projectId:string,build:AgentBuild|undefined,releases:readonly AgentRelease[]):BuilderPortableDirectory[]{
 const entries:BuilderPortableDirectory[]=[];
 const add=(directory:string|undefined,slot:string,release=false)=>{
  if(!directory)return;options.authorize?.();const source=sourcePath(options,projectId,directory);entries.push(captureBuilderDirectory(source.root,source.path,slot,release));
  if(!release&&existsSync(source.path+'.settled'))entries.push(captureBuilderDirectory(source.root,source.path+'.settled',slot+'-settled'));
 };
 add(build?.directory,'current');build?.history.forEach((h,index)=>add(h.directory,'history-'+index));
 for(const release of releases)add(release.directory,'release-'+release.version,true);
 return entries;
}
function project(state:BuilderSavedState,projectId:string,itemId:string,options:BuilderReplicationOptions):BuilderPortableState|null{
 state={...state,builds:state.builds.filter(b=>b.id===itemId),releases:state.releases.filter(r=>r.buildId===itemId)};
 if(!state.builds.length&&!state.releases.length)return null;
 options.authorize?.();assertBuilderIdle(state.builds);options.assertIdle?.(projectId,itemId);
 const ids=new Set([...state.builds.map(b=>b.id),...state.releases.map(r=>r.buildId)]);
 const files=Object.fromEntries([...ids].map(id=>[id,capture(options,projectId,state.builds.find(b=>b.id===id),state.releases.filter(r=>r.buildId===id))]));
 const value=validateBuilderPortable({format:1,builds:state.builds.map(portableBuilderBuild),releases:state.releases.map(portableBuilderRelease),files});
 options.authorize?.();return value;
}
function immutableReleases(value:BuilderPortableState,local:BuilderSavedState,projectId:string,options:BuilderReplicationOptions){
 for(const incoming of value.releases){
  const old=local.releases.find(r=>r.buildId===incoming.buildId&&r.version===incoming.version);if(!old)continue;
  const previous=capture(options,projectId,undefined,[old]),next=value.files[old.buildId]!.filter(d=>d.slot==='release-'+old.version);
  if(!isDeepStrictEqual(portableBuilderRelease(old),incoming)||!isDeepStrictEqual(previous,next))builderSyncInvalid();
 }
}
function restore(value:BuilderPortableState|null,local:BuilderSavedState,projectId:string,itemId:string,options:BuilderReplicationOptions):BuilderSavedState{
 options.authorize?.();assertBuilderIdle(local.builds.filter(b=>b.id===itemId));options.assertIdle?.(projectId,itemId);
 if(value)immutableReleases(value,local,projectId,options);
 const revisions={...local.revisions};revisions[itemId]=nextBuilderRevision(revisions[itemId]??0);
 const paths=new Map<string,Map<string,string>>();
 if(value)for(const [id,files] of Object.entries(value.files))if(files.length)paths.set(id,stageBuilderDirectories(root(options,projectId,true),files,()=>options.authorize?.()));
 const incoming=(value?.builds??[]).map(row=>{
  const id=String(row.id),revision=revisions[id]!;
  const directories=paths.get(id),directory=directories?.get('current');
  // Native execution state is never inherited. A received ready build must pass local checks again before publication.
  return {...row,revision,active:null,...(directory?{directory}:{}),history:(row.history as Record<string,unknown>[]).map((h,index)=>{
   const path=directories?.get('history-'+index);return {...h,...(path?{directory:path}:{})};
  })} as AgentBuild;
 });
 const builds=[...local.builds.filter(b=>b.id!==itemId),...incoming],releases=[...local.releases];
 for(const row of value?.releases??[]){
  if(releases.some(r=>r.buildId===row.buildId&&r.version===row.version))continue;
  const directory=paths.get(String(row.buildId))?.get('release-'+row.version);if(!directory)builderSyncInvalid();
  releases.push({...row,directory,bundlePath:join(directory!,'plugin.mjs'),packagePath:directory} as AgentRelease);
 }
 options.authorize?.();return parseBuilderState(JSON.stringify({format:2,builds,releases,revisions}));
}
/** Runtime selects one exact private key; independent authoring items have independent change keys. */
export function builderPrivateValueReplicationOwner(options:BuilderReplicationOptions={}):PrivateValueReplicationOwner{
 const parse=(input:unknown)=>parseBuilderState(input===null?null:JSON.stringify(input));
 const validate=(input:unknown,itemId:string)=>{const value=validateBuilderPortable(input);
  if(Object.keys(value.files).length!==1||!Object.hasOwn(value.files,itemId)||value.builds.some(b=>b.id!==itemId)||value.releases.some(r=>r.buildId!==itemId))builderSyncInvalid();return value;};
 return {id:BUILDER_CONTENT_REPLICA_ID,assetKind:BUILDER_CONTENT_REPLICA_ID,namespacePrefix:'agent-studio:',key:'plugin-builder:agent-built:v1',
  journal:[{array:'builds',id:'id'},{array:'releases',id:'buildId'}],
  project(input,projectId,itemId){try{return project(parse(input),projectId,itemId,options);}catch(error){if(error&&typeof error==='object'&&'code' in error&&['ENOENT','EACCES','ENOTDIR'].includes(String(error.code)))return unavailable();throw error;}},
  validate(input,_projectId,itemId){validate(input,itemId);},
  beforeClear(input,projectId,itemId){options.authorize?.();assertBuilderIdle(parse(input).builds.filter(b=>b.id===itemId));options.assertIdle?.(projectId,itemId);},
  restore(input,current,projectId,itemId){return restore(input===null?null:validate(input,itemId),parse(current),projectId,itemId,options);},
 };
}
