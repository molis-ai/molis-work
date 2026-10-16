import { PersonalSync, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { openPagesStore } from '@molis-ai/molis-work-plugin-pages';
import { availableProjectPluginIds, manifestFor } from '@molis-ai/molis-work-app-workbench';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import type { PersonalAccountLease } from './personal-auth.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import {createPersonalArtifactRegistration} from './personal-artifact-sync.js';
import {createPersonalPluginRegistrations} from './personal-plugin-sync.js';
import {createPersonalGoalRegistration,createPersonalScheduleRegistration,createPersonalFeedRuleRegistration} from './personal-project-sync.js';

/** Built-in binding only; coordinator and Rust transport never import plugin owners. */
export async function createPersonalSync(home:string,space:StorageSpace,lease:PersonalAccountLease,withCatalog:LocalWebCatalogRunner,assertActive:()=>void) {
  // Opt-in local integration. Not a configurable public upload destination.
  if(process.env.MOLIS_WORK_SYNC_LOCAL!=='1')return null;
  const check=()=>{lease.assertCurrent();assertActive();};
  const artifacts=createPersonalArtifactRegistration(home,space.spaceId,lease.userId,check,withCatalog);
  let projects=new Map<string,{title:string;enabled:boolean}>();
  const registration:SyncRegistration={
    selection:{plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1},
    title:'文档与文件夹',
    async refresh(){
      await artifacts.registration.refresh();
      // Personal plugins are globally available; a hidden toolbar icon is not a disabled plugin.
      check();projects=await withCatalog({homeDirectory:home},catalog=>new Map(catalog.listProjects().map(p=>[p.project_id,{title:p.display_name,enabled:availableProjectPluginIds(catalog.listProjectPlugins(p.project_id)).has('pages')}])));check();
    },
    withReplica(run){
      check();const store=openPagesStore(home);
      try{return run(store.replica({authorize:check,canUploadProject:projectId=>projects.get(projectId)?.enabled===true,project(projectId){
        const project=projects.get(projectId);
        if(!project)throw new Error('同步项目不存在');
        if(!project.enabled)throw new Error('项目的文档插件已停用');
        return {title:project.title,context:{spaceId:space.spaceId,projectId,authorize:check,hasReference:reference=>artifacts.hasReference(projectId,reference)}};
      }}));}finally{store.close();}
    },
    async prepare(event){
      check();if(event.value===null)return;
      const envelope=event.value as {project?:{id?:unknown;title?:unknown}};
      const project=envelope?.project,key=JSON.parse(event.key);
      if(!project||typeof project.id!=='string'||typeof project.title!=='string'||project.title.length>120||!Array.isArray(key)||key[0]!==project.id)throw new Error('SYNC_INVALID_PROJECT');
      await withCatalog({homeDirectory:home},async catalog=>{
        check();if(catalog.listProjects().some(p=>p.project_id===project.id))return;
        const record=await catalog.ensureSyncedProject({project_id:project.id as string,display_name:project.title as string,actor_id:lease.userId},check);
        check();catalog.addProjectPlugin({project_id:record.project_id,plugin_id:'pages',actor_id:lease.userId});
      });check();
    },
  };
  await artifacts.registration.refresh();await registration.refresh();
  const plugins=createPersonalPluginRegistrations(home,space.spaceId,lease.userId,check,withCatalog,(projectId,id,version)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version}));
  for(const plugin of plugins)await plugin.refresh();
  const goalsManifest=manifestFor('goals')!;
  const goals=createPersonalGoalRegistration(home,space.spaceId,lease.userId,check,withCatalog,{plugin_id:goalsManifest.plugin_id,publisher_id:goalsManifest.publisher.publisher_id,publisher_signature:goalsManifest.publisher.signature,collection_id:'project_goals',schema_version:1});
  await goals.refresh();
  const scheduleManifest=manifestFor('schedule')!;
  const schedule=createPersonalScheduleRegistration(home,space.spaceId,lease.userId,check,withCatalog,{plugin_id:scheduleManifest.plugin_id,publisher_id:scheduleManifest.publisher.publisher_id,publisher_signature:scheduleManifest.publisher.signature,collection_id:'conversation_tasks',schema_version:1});
  await schedule.refresh();
  const feedManifest=manifestFor('feed')!;
  const feedRules=createPersonalFeedRuleRegistration(home,space.spaceId,lease.userId,check,withCatalog,{plugin_id:feedManifest.plugin_id,publisher_id:feedManifest.publisher.publisher_id,publisher_signature:feedManifest.publisher.signature,collection_id:'capture_rules',schema_version:1});
  await feedRules.refresh();
  return new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority:{...lease,assertCurrent:check},registrations:[goals,schedule,feedRules,artifacts.registration,registration,...plugins]});
}
