import { personalRuntimeSyncAuthority } from './personal-runtime-sync-authority.js';
import type {ProjectDeletionService} from './project-deletion-service.js';
import {assertProjectSyncChildren} from './project-sync-children.js';
import { PersonalSync, resolveSyncEndpoint, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { builtinPluginByProjectKey } from './plugin-registry.js';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import type { PersonalAccountLease } from './personal-auth.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import {createPersonalFixedVersionBindings} from './personal-artifact-sync.js';
import {createPersonalPluginRegistrations,createPersonalCharacterRegistration} from './personal-plugin-sync.js';
import {createPersonalProjectRegistrations} from './personal-project-sync.js';
import {createPersonalCatalogRegistration} from './personal-catalog-sync.js';

/** Built-in bindings only; the sync service and Rust transport never import plugin owners. */
export async function createPersonalSync(home:string,space:StorageSpace,lease:PersonalAccountLease,withCatalog:LocalWebCatalogRunner,assertActive:()=>void,discover?: (authorize:()=>void)=>Promise<readonly SyncRegistration[]>,lifecycleService?:ProjectDeletionService,readCatalog?:import('./personal-runtime-sync-authority.js').SyncCatalogReader) {
  const endpoint=resolveSyncEndpoint({origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL==='1'});
  if(!endpoint)return null;
  const check=()=>{lease.assertCurrent();assertActive();};
  const goalsManifest=builtinPluginByProjectKey('goals')?.manifest;
  let children:readonly SyncRegistration[]=[],discovered:readonly SyncRegistration[]=[];
  const hasGoal=(projectId:string,goalId:string)=>{
    check();const collection=goalsManifest?.sync?.collections.find(row=>row.id==='project_goals');
    if(!goalsManifest||!collection)return false;
    const owner=discovered.find(row=>row.selection.plugin_id===goalsManifest.plugin_id&&row.selection.publisher_id===goalsManifest.publisher.publisher_id&&row.selection.publisher_signature===goalsManifest.publisher.signature&&row.selection.collection_id===collection.id&&row.selection.schema_version===collection.schema_version);
    const result=owner?.hasReference?.(projectId,goalId)??false;check();return result;
  };
  const {artifacts,registrations:versions}=createPersonalFixedVersionBindings(home,space.spaceId,lease.userId,check,withCatalog,hasGoal);
  const plugins=createPersonalPluginRegistrations(home,space.spaceId,lease.userId,check,withCatalog,(projectId,id,version)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version}),(projectId,reference)=>artifacts.hasReference(projectId,reference));
  plugins.push(createPersonalCharacterRegistration(home,space.spaceId,lease.userId,check));
  for(const plugin of plugins)await plugin.refresh();
  const catalog=createPersonalCatalogRegistration(home,space.spaceId,lease.userId,check,withCatalog,'molis',lifecycleService?{service:lifecycleService,refreshChildren:async()=>{for(const child of [...children,...discovered]){await child.refresh();check();}},assertChildrenSettled:projectId=>assertProjectSyncChildren([...children,...discovered],projectId,check)}:undefined);await catalog.refresh();
  const projectPlugins=createPersonalProjectRegistrations(home,space.spaceId,lease.userId,check,withCatalog,readCatalog);
  for(const plugin of projectPlugins)await plugin.refresh();
  children=[...projectPlugins,...versions,...plugins];
  let service: PersonalSync;
  const runtimeAuthority=personalRuntimeSyncAuthority({home,spaceId:space.spaceId,authorize:check,policy:()=>service.policy(),withCatalog,readCatalog,hasArtifact:(projectId,id,version)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version}),hasReference:(projectId,reference)=>artifacts.hasReference(projectId,reference)});
  service=new PersonalSync({home,spaceId:space.spaceId,endpoint,authority:{...lease,assertCurrent:check},registrations:[catalog,...projectPlugins,...versions,...plugins],...(discover?{discover:async()=>{await runtimeAuthority.refresh();discovered=(await discover(check)).map(runtimeAuthority.bind);return discovered;}}:{})});
  return service;
}
