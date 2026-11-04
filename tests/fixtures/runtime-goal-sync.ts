import { MolisWorkLocalHost, discoverRuntimeSyncCollections, molisWorkHostProjectReference, runningProjectPlatform } from '@molis-ai/molis-work-app-local-host';
import { goalsManifest } from '@molis-ai/molis-work-plugin-goals';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import type { SpaceSyncPolicy } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import { personalRuntimeSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { bindPersonalSpaceAuthority } from '@molis-ai/molis-work-app-local-host';

const collection=goalsManifest.sync!.collections.find(row=>row.id==='project_goals')!;
export const goalSyncSelection={plugin_id:goalsManifest.plugin_id,publisher_id:goalsManifest.publisher.publisher_id,publisher_signature:goalsManifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};
/** Real discovery and the same account/policy adapter used by createPersonalSync. Facts are edited by the existing owner fixture. */
export function runtimeGoalSync(home:string,spaceId:string,userId:string,authorize:()=>void) {
  const space=ensureStorageSpace(home);
  if(space.kind!=='personal'||space.spaceId!==spaceId||space.ownerUserId!==userId)throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');
  const release=bindPersonalSpaceAuthority(home,spaceId,authorize);
  const host=new MolisWorkLocalHost({homeDirectory:home,completeText:null});
  const catalogAccess=host.ensureWebCatalog(home,openMolisWorkProjectCatalog);
  const withCatalog=host.configurePersonalPlanning(home,catalogAccess.withCatalog);
  let policy=():SpaceSyncPolicy=>({spaceId,revision:0,selections:[goalSyncSelection]});
  const authority=personalRuntimeSyncAuthority({home,spaceId,authorize,readCatalog:catalogAccess.read,withCatalog:withCatalog,policy:()=>policy(),hasArtifact:()=>false,hasReference:()=>false});
  let current:SyncRegistration|undefined;
  const required=()=>{authorize();if(!current)throw new Error('SYNC_OWNER_NOT_INSTALLED');return current;};
  const registration:SyncRegistration={selection:goalSyncSelection,title:collection.title,
    available:()=>current?.available?.()??false,
    async refresh(){
      await catalogAccess.warm();
      // The person explicitly opens these test projects before passive synchronization discovery.
      for(const project of await withCatalog({homeDirectory:home},catalog=>catalog.listProjects()))
        await host.withProject(molisWorkHostProjectReference({databasePath:project.database_path,projectId:project.project_id}),async runtime=>{const platform=await runningProjectPlatform(runtime.store,runtime.project_id);if(platform?.supervisor.state(goalSyncSelection.plugin_id)?.status!=='running')throw new Error('GOAL_RUNTIME:'+JSON.stringify(platform?.supervisor.state(goalSyncSelection.plugin_id)));}, {activatePlugins:true});
      await authority.refresh();current=(await discoverRuntimeSyncCollections(home,spaceId,host,withCatalog,authorize)).find(row=>row.selection.plugin_id===goalSyncSelection.plugin_id&&row.selection.collection_id===goalSyncSelection.collection_id);if(current)current=authority.bind(current);},
    withReplica:run=>required().withReplica(run),prepare:async(event,options)=>required().prepare(event,options),
    content:{encode:(...args)=>required().content!.encode(...args),decode:(...args)=>required().content!.decode(...args)},
  };
  return {registration,host,withCatalog,setPolicy(read:()=>SpaceSyncPolicy){policy=read;},async close(){try{await host.close();}finally{release();}}};
}
export function goalWire(value:unknown):unknown{return (value as {value:unknown}).value;}
