import type {ProjectDeletionService} from './project-deletion-service.js';
import {assertProjectSyncChildren} from './project-sync-children.js';
import { PersonalSync, resolveSyncEndpoint, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { manifestFor } from '@molis-ai/molis-work-app-workbench';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import type { PersonalAccountLease } from './personal-auth.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import {createPersonalFixedVersionBindings} from './personal-artifact-sync.js';
import {createPersonalPluginRegistrations} from './personal-plugin-sync.js';
import {createPersonalGoalRegistration,createPersonalProjectRegistrations} from './personal-project-sync.js';
import {createPersonalWorkRegistration} from './personal-work-sync.js';
import {createPersonalCatalogRegistration} from './personal-catalog-sync.js';

/** Built-in binding only; coordinator and Rust transport never import plugin owners. */
export async function createPersonalSync(home:string,space:StorageSpace,lease:PersonalAccountLease,withCatalog:LocalWebCatalogRunner,assertActive:()=>void,discover?: (authorize:()=>void)=>Promise<readonly SyncRegistration[]>,lifecycleService?:ProjectDeletionService) {
  const endpoint=resolveSyncEndpoint({origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL==='1'});
  if(!endpoint)return null;
  const check=()=>{lease.assertCurrent();assertActive();};
  const {artifacts,registrations:versions}=createPersonalFixedVersionBindings(home,space.spaceId,lease.userId,check,withCatalog);
  const plugins=createPersonalPluginRegistrations(home,space.spaceId,lease.userId,check,withCatalog,(projectId,id,version)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version}),(projectId,reference)=>artifacts.hasReference(projectId,reference));
  for(const plugin of plugins)await plugin.refresh();
  const goalsManifest=manifestFor('goals')!;
  let children:readonly SyncRegistration[]=[],discovered:readonly SyncRegistration[]=[];
  const catalog=createPersonalCatalogRegistration(home,space.spaceId,lease.userId,check,withCatalog,goalsManifest.publisher.publisher_id,lifecycleService?{service:lifecycleService,refreshChildren:async()=>{for(const child of [...children,...discovered]){await child.refresh();check();}},assertChildrenSettled:projectId=>assertProjectSyncChildren([...children,...discovered],projectId,check)}:undefined);await catalog.refresh();
  const work=createPersonalWorkRegistration(home,space,lease.userId,check,goalsManifest.publisher);await work.refresh();
  const goals=createPersonalGoalRegistration(home,space.spaceId,lease.userId,check,withCatalog,{plugin_id:goalsManifest.plugin_id,publisher_id:goalsManifest.publisher.publisher_id,publisher_signature:goalsManifest.publisher.signature,collection_id:'project_goals',schema_version:1});
  await goals.refresh();
  const projectPlugins=createPersonalProjectRegistrations(home,space.spaceId,lease.userId,check,withCatalog);
  for(const plugin of projectPlugins)await plugin.refresh();
  children=[goals,...projectPlugins,...versions,...plugins,work];
  return new PersonalSync({home,spaceId:space.spaceId,endpoint,authority:{...lease,assertCurrent:check},registrations:[catalog,goals,...projectPlugins,...versions,...plugins,work],...(discover?{discover:async()=>{discovered=await discover(check);return discovered;}}:{})});
}
