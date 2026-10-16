import { PersonalSync } from '@molis-ai/molis-work-module-sync-replication';
import { manifestFor } from '@molis-ai/molis-work-app-workbench';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import type { PersonalAccountLease } from './personal-auth.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import {createPersonalArtifactRegistration} from './personal-artifact-sync.js';
import {createPersonalPluginRegistrations} from './personal-plugin-sync.js';
import {createPersonalGoalRegistration,createPersonalProjectRegistrations} from './personal-project-sync.js';

/** Built-in binding only; coordinator and Rust transport never import plugin owners. */
export async function createPersonalSync(home:string,space:StorageSpace,lease:PersonalAccountLease,withCatalog:LocalWebCatalogRunner,assertActive:()=>void) {
  // Opt-in local integration. Not a configurable public upload destination.
  if(process.env.MOLIS_WORK_SYNC_LOCAL!=='1')return null;
  const check=()=>{lease.assertCurrent();assertActive();};
  const artifacts=createPersonalArtifactRegistration(home,space.spaceId,lease.userId,check,withCatalog);
  const plugins=createPersonalPluginRegistrations(home,space.spaceId,lease.userId,check,withCatalog,(projectId,id,version)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version}),(projectId,reference)=>artifacts.hasReference(projectId,reference));
  for(const plugin of plugins)await plugin.refresh();
  const goalsManifest=manifestFor('goals')!;
  const goals=createPersonalGoalRegistration(home,space.spaceId,lease.userId,check,withCatalog,{plugin_id:goalsManifest.plugin_id,publisher_id:goalsManifest.publisher.publisher_id,publisher_signature:goalsManifest.publisher.signature,collection_id:'project_goals',schema_version:1});
  await goals.refresh();
  const projectPlugins=createPersonalProjectRegistrations(home,space.spaceId,lease.userId,check,withCatalog);
  for(const plugin of projectPlugins)await plugin.refresh();
  return new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority:{...lease,assertCurrent:check},registrations:[goals,...projectPlugins,artifacts.registration,...plugins]});
}
