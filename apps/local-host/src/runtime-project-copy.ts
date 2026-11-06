import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { ProjectCopyOwner } from '@molis-ai/molis-work-contracts/services/placement';
import { bindRuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import { readStorageSpace } from '@molis-ai/molis-work-storage';
import type { HomePluginPlatform } from './home-plugins.js';
import { withPluginSyncAuthority, type PluginSyncCollectionIdentity } from './plugin-sync-authority.js';

/** Explicit copy authority, separate from account sync opt-in. Callers obtain it from the current copy preview/confirmation. */
export interface RuntimeProjectCopyInput {
  readonly home:string;
  readonly platform:HomePluginPlatform;
  readonly direction:'source'|'target';
  readonly context:AggregateReplicaContext;
}
export interface RuntimeProjectCopyDirectory {
  readonly owners:readonly {ownerId:string;owner:ProjectCopyOwner}[];
  close():void;
}

/** Discover only enabled owners. Retained ports recheck the exact installation, collection and copy authorization each call. */
export async function openRuntimeProjectCopyDirectory(input:RuntimeProjectCopyInput):Promise<RuntimeProjectCopyDirectory> {
  let active=true;
  const initial=readStorageSpace(input.home);
  if(!initial)throw new ActionError('actions.forbidden','复制来源尚无已绑定空间');
  const check=()=>{
    if(!active)throw new ActionError('actions.forbidden','复制内容接口已关闭');
    input.context.authorize();
    const space=readStorageSpace(input.home);
    if(!space||space.spaceId!==initial.spaceId||space.kind!==initial.kind||space.spaceId!==input.context.spaceId||input.direction==='target'&&space.kind!=='personal')throw new ActionError('actions.forbidden','复制空间已变化');
  };
  check();
  const owners:{ownerId:string;owner:ProjectCopyOwner}[]=[];
  const byPlugin=new Set<string>();
  for(const pluginId of input.platform.supervisor.enabledPluginIds()){
    const manifest=input.platform.supervisor.manifest(pluginId);
    for(const collection of manifest?.sync?.collections??[]){
      check();
      const binding=await bindRuntimeSyncCollection(input.platform.supervisor,pluginId,collection.id,{authorize:check,record:id=>input.platform.runtime.get(id)},{activeOnly:input.direction==='source'});
      check();if(!binding?.copy)continue;
      if(byPlugin.has(pluginId))throw new ActionError('actions.input_invalid','同一插件的复制集合尚需统一业务入口');
      const expected:PluginSyncCollectionIdentity={plugin_id:binding.plugin_id,publisher_id:binding.publisher_id,publisher_signature:binding.publisher_signature,collection_id:binding.collection.id,schema_version:binding.collection.schema_version};
      const context={...input.context,authorize:check,project:input.context.project.bind(input.context),canUploadProject:input.context.canUploadProject.bind(input.context),hasArtifact:input.context.hasArtifact.bind(input.context),...(input.context.hasReference?{hasReference:input.context.hasReference.bind(input.context)}:{})};
      const authority={home:input.home,context,assertCollection(identity:PluginSyncCollectionIdentity){
        check();if(Object.keys(expected).some(key=>Reflect.get(expected,key)!==Reflect.get(identity,key))||!binding.available())throw new ActionError('actions.forbidden','复制插件身份或安装已变化');
      }};
      const invoke=<T>(run:()=>T):T=>{check();return withPluginSyncAuthority(authority,run);};
      const owner=invoke(()=>binding.copy!(input.direction));
      if(owner.kinds.some(kind=>!kind.startsWith(pluginId+':')))throw new ActionError('actions.forbidden','复制插件冒用了其他内容所有者');
      const guarded:ProjectCopyOwner={kinds:Object.freeze([...owner.kinds]),read:reference=>invoke(()=>owner.read(reference)),snapshot:project=>invoke(()=>owner.snapshot(project)),references:asset=>invoke(()=>owner.references(asset)),fork:(asset,identity)=>invoke(()=>owner.fork(asset,identity)),apply:asset=>invoke(()=>owner.apply(asset)),
        ...(owner.prepare?{async prepare(asset:Parameters<NonNullable<ProjectCopyOwner['prepare']>>[0]){await invoke(()=>owner.prepare!(asset));check();}}:{})};
      owners.push({ownerId:pluginId,owner:guarded});byPlugin.add(pluginId);
    }
  }
  check();return {owners:Object.freeze(owners),close(){active=false;}};
}
