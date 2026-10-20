import type { AggregateReplicaContext } from '@molis-ai/molis-work-storage';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { availableProjectPluginIds, builtinSyncBindings } from '@molis-ai/molis-work-app-workbench';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import { personalDocumentOptions } from './personal-document-options.js';

export function createPersonalPluginRegistrations(home:string,spaceId:string,userId:string,check:()=>void,withCatalog:LocalWebCatalogRunner,hasArtifact:AggregateReplicaContext['hasArtifact'],hasReference:AggregateReplicaContext['hasReference']):SyncRegistration[]{
  const space=ensureStorageSpace(home);if(space.kind!=='personal'||space.spaceId!==spaceId||space.ownerUserId!==userId)throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');
  return builtinSyncBindings().flatMap<SyncRegistration>(({entry,collection,binding:sync,selection,dependencies})=>{
    if(sync.scope==='project-database'||sync.scope==='project-library'||sync.scope==='project-sections'||sync.scope==='project-fixed-versions'||sync.scope==='project-private-values')return [];
    if(sync.scope==='home-document'){
      let replica:ReturnType<typeof sync.open>|undefined;
      return {locate:sync.locate,selection,dependencies,title:collection.title,content:sync.content?.({spaceId,authorize:check}),async refresh(){check();},async prepare(){check();},
        withReplica(run){check();if(!replica){const context=personalDocumentOptions(home,sync.path,check);if(!context||context.spaceId!==spaceId)throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');replica=sync.open(home,context);}check();return run(replica);}};
    }
    const binding={id:entry.project_plugin_id,manifest:entry.manifest,...sync};
    let projects=new Map<string,{title:string;enabled:boolean}>();
    return {
      title:collection.title, content: binding.content?.({spaceId,authorize:check}),
      selection,dependencies,locate:binding.locate,
      async refresh(){check();if(binding.scope==='home')return;projects=await withCatalog({homeDirectory:home},c=>new Map(c.listProjects().map(p=>[p.project_id,{title:p.display_name,enabled:binding.scope==='home-with-projects'||availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has(binding.id)}])));check();},
      withReplica(run){check();const store=binding.open(home,userId);try{return run(store.replica({spaceId,authorize:check,conflictState:createSyncConflictState,hasArtifact,hasReference,canUploadProject:id=>projects.get(id)?.enabled===true,project(id){const p=projects.get(id);if(!p||!p.enabled)throw new Error('同步项目不存在或插件已停用');return {title:p.title};}}));}finally{store.close();}},
      async prepare(event){
        check();if(binding.scope==='home'||event.value===null)return;
        if(binding.scope==='home-with-projects'){
          const e=event.value as {spaceId?:unknown;project?:{id?:unknown;title?:unknown}|null};
          const key:unknown=JSON.parse(event.key),p=e?.project;
          if(e.spaceId!==spaceId||!Array.isArray(key)||key.length!==2||key[0]!=='todo'||typeof key[1]!=='string'||!key[1])throw new Error('SYNC_INVALID_TODO');
          if(p===null)return;
          if(!p||typeof p.id!=='string'||!p.id||p.id.length>80||typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw new Error('SYNC_INVALID_PROJECT');
          await withCatalog({homeDirectory:home},async c=>{check();if(!c.listProjects().some(row=>row.project_id===p.id))await c.ensureSyncedProject({project_id:p.id as string,display_name:p.title as string,actor_id:userId},check);check();});projects.set(p.id,{title:p.title,enabled:true});check();return;
        }
        const e=event.value as {spaceId?:unknown;project?:{id?:unknown;title?:unknown}};
        const key:unknown=JSON.parse(event.key),p=e?.project;
        if((e?.spaceId!==undefined&&e.spaceId!==spaceId)||!p||typeof p.id!=='string'||!p.id||p.id.length>80||typeof p.title!=='string'||p.title.length>120||!Array.isArray(key)||key[0]!==p.id)throw new Error('SYNC_INVALID_PROJECT');
        await withCatalog({homeDirectory:home},async c=>{check();if(c.listProjects().some(row=>row.project_id===p.id))return;const project=await c.ensureSyncedProject({project_id:p.id as string,display_name:p.title as string,actor_id:userId},check);check();c.addProjectPlugin({project_id:project.project_id,plugin_id:binding.id,actor_id:userId});});check();
      },
    };
  });
}
