import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { acquireStorageOwner, homeSqlitePath, initializeMemoryForgetting, MEMORY_LEDGER_STORE, openMemoryLedger } from '@molis-ai/molis-work-storage';
import { defaultPrefs } from '@molis-ai/molis-work-service-memory';
import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { MolisWorkLocalHost, discoverRuntimeSyncCollections, molisWorkHostProjectReference, createPersonalSync, bindPersonalSpaceAuthority } from '@molis-ai/molis-work-app-local-host';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
/** Explicit setup of a fresh synthetic Home, before any Runtime or business owner opens it. */
export function prepareSyncTestHome(home:string){
 // A current Home has its forgetting file before its ledger; only a Home with no ledger yet is fresh.
 if(!existsSync(homeSqlitePath(home,MEMORY_LEDGER_STORE))){const owner=acquireStorageOwner(join(home,'agent-runtime'));try{initializeMemoryForgetting({homeDirectory:home,storageOwner:owner,assertCurrent(){}});}finally{owner.release();}}
 const memory=openMemoryLedger({homeDirectory:home});
 try{memory.transaction(()=>{if(!memory.prefs(LOCAL_PERSON_ACTOR_ID,'personal'))memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'personal',defaultPrefs('personal','reviewed'));if(!memory.prefs(LOCAL_PERSON_ACTOR_ID,'project-default'))memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'project-default',defaultPrefs('project','reviewed'));});}finally{memory.close();}
}
/** Explicitly opens the user's already enabled projects; the coordinator only discovers their current Runtime contributions. */
export async function runtimePersonalSync(home:string,space:StorageSpace,authorize:()=>void=()=>{},options:{accessToken?:()=>Promise<string>;authOrigin?:string}={}) {
 const release=bindPersonalSpaceAuthority(home,space.spaceId,authorize),host=new MolisWorkLocalHost({homeDirectory:home,completeText:null});
 const catalogAccess=host.ensureWebCatalog(home,openMolisWorkProjectCatalog);
  const withCatalog=host.configurePersonalPlanning(home,catalogAccess.withCatalog);
 const openProjects=async()=>{
  for(const project of await withCatalog({homeDirectory:home},catalog=>catalog.listProjects()))
   await host.withProject(molisWorkHostProjectReference({databasePath:project.database_path,projectId:project.project_id}),async()=>{}, {activatePlugins:true});
 };
 const lease={userId:space.ownerUserId!,applicationId:'work',authOrigin:options.authOrigin??'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:authorize,accessToken:options.accessToken??(async()=>'synthetic-only')};
 try {
  await catalogAccess.warm();await openProjects();await host.homePlugins?.ready();
  const sync=await createPersonalSync(home,space,lease,withCatalog,authorize,check=>discoverRuntimeSyncCollections(home,space.spaceId,host,withCatalog,check),undefined,catalogAccess.read);
  if(!sync)throw new Error('TEST_SYNC_ENDPOINT_MISSING');
  return {host,sync,withCatalog,openProjects,readCatalog:catalogAccess.read,async close(){sync.close();try{await host.close();}finally{release();}}};
 }catch(error){try{await host.close();}finally{release();}throw error;}
}
