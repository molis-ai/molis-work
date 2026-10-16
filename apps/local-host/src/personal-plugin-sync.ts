import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-storage';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { openFormStore, formManifest } from '@molis-ai/molis-work-plugin-form';
import { openDatasetStore, datasetManifest } from '@molis-ai/molis-work-plugin-dataset';
import { openPptStore, pptManifest } from '@molis-ai/molis-work-plugin-ppt';
import { openLingguangStore, lingguangManifest } from '@molis-ai/molis-work-plugin-lingguang';
import { openWorkflowsStore, workflowsManifest } from '@molis-ai/molis-work-plugin-workflows';
import { openJellyStore, jellyManifest } from '@molis-ai/molis-work-plugin-jelly';
import { openTodoSyncStore, todoManifest } from '@molis-ai/molis-work-plugin-todo';
import { createCharactersReplicationBinding } from '@molis-ai/molis-work-module-characters';
import { charactersManifest } from '@molis-ai/molis-work-plugin-characters';
import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG } from '@molis-ai/molis-work-app-workbench';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

/** Composition catalog only: no plugin tables or domain payloads are interpreted here. */
const bindings:readonly {id:string;manifest:PluginManifest;scope?:'home'|'home-with-projects';open(home:string,userId:string):{close():void;replica(context:AggregateReplicaContext):SyncReplicaAdapter}}[]=[
  {id:'form',manifest:formManifest,open:openFormStore},
  {id:'dataset',manifest:datasetManifest,open:openDatasetStore},
  {id:'ppt',manifest:pptManifest,open:openPptStore},
  {id:'lingguang',manifest:lingguangManifest,open:openLingguangStore},
  {id:'workflows',manifest:workflowsManifest,open:openWorkflowsStore},
  {id:'jelly',manifest:jellyManifest,scope:'home',open:openJellyStore},
  {id:'todo',manifest:todoManifest,scope:'home-with-projects',open:home=>openTodoSyncStore(home)},
  {id:'characters',manifest:charactersManifest,scope:'home',open:createCharactersReplicationBinding},
  ...BUILTIN_PLUGIN_CATALOG.flatMap(entry=>entry.sync?[{id:entry.project_plugin_id,manifest:entry.manifest,scope:entry.sync.scope,open:entry.sync.open}]:[]),
];
export function createPersonalPluginRegistrations(home:string,spaceId:string,userId:string,check:()=>void,withCatalog:LocalWebCatalogRunner,hasArtifact:AggregateReplicaContext['hasArtifact']):SyncRegistration[]{
  const space=ensureStorageSpace(home);if(space.kind!=='personal'||space.spaceId!==spaceId||space.ownerUserId!==userId)throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');
  return bindings.map(binding=>{
    const collection=binding.manifest.sync!.collections[0]!;
    let projects=new Map<string,{title:string;enabled:boolean}>();
    return {
      title:collection.title,
      selection:{plugin_id:binding.manifest.plugin_id,publisher_id:binding.manifest.publisher.publisher_id,publisher_signature:binding.manifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version},
      async refresh(){check();if(binding.scope==='home')return;projects=await withCatalog({homeDirectory:home},c=>new Map(c.listProjects().map(p=>[p.project_id,{title:p.display_name,enabled:binding.scope==='home-with-projects'||availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has(binding.id)}])));check();},
      withReplica(run){check();const store=binding.open(home,userId);try{return run(store.replica({spaceId,authorize:check,hasArtifact,canUploadProject:id=>projects.get(id)?.enabled===true,project(id){const p=projects.get(id);if(!p||!p.enabled)throw new Error('同步项目不存在或插件已停用');return {title:p.title};}}));}finally{store.close();}},
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
        if(e?.spaceId!==spaceId||!p||typeof p.id!=='string'||!p.id||p.id.length>80||typeof p.title!=='string'||p.title.length>120||!Array.isArray(key)||key[0]!==p.id)throw new Error('SYNC_INVALID_PROJECT');
        await withCatalog({homeDirectory:home},async c=>{check();if(c.listProjects().some(row=>row.project_id===p.id))return;const project=await c.ensureSyncedProject({project_id:p.id as string,display_name:p.title as string,actor_id:userId},check);check();c.addProjectPlugin({project_id:project.project_id,plugin_id:binding.id,actor_id:userId});});check();
      },
    };
  });
}
