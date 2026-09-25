import type {PluginDefinition,PluginManifest} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {Release,Design,Behavior} from './model.js';
import {RecordStore,validateStoredRecords} from './records.js';
import {bodyObject,recordsResponse} from './record-routes.js';
/** The installed code is the fixed interpreter v1; a published design is versioned application data. */
export interface GeneratedPluginControl {validateRecords(design:Design,behavior:Behavior):void}
function manifestVersion(releaseVersion:number):string{return `${releaseVersion}.0.0`;}
export function compatibleReleaseVersions(versions:readonly Release[],targetVersion:number):number[]{
 const ordered=[...versions].sort((a,b)=>a.version-b.version),target=ordered.findIndex(item=>item.version===targetVersion);
 if(target<0)return[];const compatible:number[]=[];
 for(let index=target;index>0;index--){if(ordered[index]!.compatibleWithPrevious!==true)break;compatible.push(ordered[index-1]!.version);}
 return compatible;
}
export function migratableReleaseVersions(versions:readonly Release[],targetVersion:number):number[]{
 const ordered=[...versions].sort((a,b)=>a.version-b.version),target=ordered.findIndex(item=>item.version===targetVersion);
 if(target<0)return[];const compatible=new Set(compatibleReleaseVersions(ordered,targetVersion));
 return ordered.slice(0,target).map(item=>item.version).filter(version=>!compatible.has(version));
}
export function createGeneratedPlugin(initial:Release,current:()=>Release,onReady?:(control:GeneratedPluginControl)=>void,compatibleFromVersions:readonly number[]=[],migratableFromVersions:readonly number[]=[]):PluginDefinition{
 const uiId=initial.pluginId+'.ui.v1';
 const manifest:PluginManifest={schema_version:2,host_api_version:2,plugin_id:initial.pluginId,version:manifestVersion(initial.version),name:initial.design.title,kind:'app',
  publisher:{publisher_id:'molis',signature:`generated-builder-${initial.buildId}`},entrypoints:[{deployment:'local',entrypoint:'./generated.js'}],
  ...(compatibleFromVersions.length||migratableFromVersions.length?{upgrade_compatibility:{
   ...(compatibleFromVersions.length?{compatible_from_versions:[...new Set(compatibleFromVersions)].sort((a,b)=>a-b).map(manifestVersion)}:{}),
   ...(migratableFromVersions.length?{migratable_from_versions:[...new Set(migratableFromVersions)].sort((a,b)=>a-b).map(manifestVersion)}:{}),
  }}:{}),
  permissions:[{permission:'storage:private',required:true,reason:'保存此插件自己的数据'}],capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},
  routes:[{route_id:'generated.state',method:'GET',path:'/state'},{route_id:'generated.records',method:'GET',path:'/records'},{route_id:'generated.mutate',method:'POST',path:'/records'}],
  ui:{contributions:[uiId],views:[{view_id:'app',slot:'stage',title:initial.design.title,contribution_id:uiId}]}};
 return {manifest,async validateUpgrade({context}){
  context.requireGrant('storage:private');const storage=context.services?.storage;if(!storage)throw new Error('插件存储尚未装配');
  const release=current();validateStoredRecords(storage,'records',release.design,release.behavior);
 },async start(context){
  context.requireGrant('storage:private');if(!context.services?.storage)throw new Error('插件存储尚未装配');const storage=context.services.storage;
  onReady?.({validateRecords(design,behavior){new RecordStore(storage,'records',design,behavior).list();}});
  return {kind:'app',views:[{descriptor:{contribution_id:uiId,plugin_id:initial.pluginId,kind:'primary-page',label:initial.design.title,slots:[]},render:()=>'<main class="pb-generated" data-generated-app></main>'}],routes:manifest.routes!.map(r=>({route_id:r.route_id,handle(request){try{
   const release=current();if(release.pluginId!==initial.pluginId)throw new Error('插件身份不一致');
   if(request.method==='POST'&&bodyObject(request.body).releaseVersion!==release.version)throw new Error('插件已发布新版本，请刷新后再保存；当前输入未覆盖');
   if(r.route_id==='generated.state')return {status:200,body:{release}};
   return {status:200,body:recordsResponse(new RecordStore(storage,'records',release.design,release.behavior),request)};
  }catch(error){return {status:400,body:{error:error instanceof Error?error.message:'操作失败'}};}}}))};
 }};
}
