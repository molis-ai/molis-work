import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { acquireStorageOwner, homeSqlitePath, initializeMemoryForgetting, MEMORY_LEDGER_STORE, openMemoryLedger } from '@molis-ai/molis-work-storage';
import { defaultPrefs } from '@molis-ai/molis-work-service-memory';
import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { MolisWorkLocalHost, discoverRuntimeSyncCollections, molisWorkHostProjectReference, createPersonalSync, bindPersonalSpaceAuthority, personalRuntimeSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import { personalSyncFixture } from './personal-sync-coordinator.js';
/** Explicit setup of a fresh synthetic Home, before any Runtime or business owner opens it. */
export function prepareSyncTestHome(home:string){
 // A current Home has its forgetting file before its ledger; only a Home with no ledger yet is fresh.
 if(!existsSync(homeSqlitePath(home,MEMORY_LEDGER_STORE))){const owner=acquireStorageOwner(join(home,'agent-runtime'));try{initializeMemoryForgetting({homeDirectory:home,storageOwner:owner,assertCurrent(){}});}finally{owner.release();}}
 const memory=openMemoryLedger({homeDirectory:home});
 try{memory.transaction(()=>{if(!memory.prefs(LOCAL_PERSON_ACTOR_ID,'personal'))memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'personal',defaultPrefs('personal','reviewed'));if(!memory.prefs(LOCAL_PERSON_ACTOR_ID,'project-default'))memory.savePrefs(LOCAL_PERSON_ACTOR_ID,'project-default',defaultPrefs('project','reviewed'));});}finally{memory.close();}
}

/** Actual built-in activations and authority, with two synthetic personal Homes. */
export async function syncOwnerPair(t: TestContext, plugins: readonly string[], projectCount = 1) {
  const f = personalSyncFixture(t);
  const local = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  t.after(() => { if (local === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL; else process.env.MOLIS_WORK_SYNC_LOCAL = local; });
  const fetch = t.mock.method(globalThis, 'fetch', f.transport);
  const owner = f.space.ownerUserId!;
  const projects = await withMolisWorkProjectCatalog({homeDirectory: f.homes[0]}, async catalog => {
    const rows = [];
    for (let index = 0; index < projectCount; index++) rows.push(await catalog.createProject({display_name: `Sync project ${index + 1}`, actor_id: owner}));
    return rows;
  });
  for (const home of f.homes) {
    await withMolisWorkProjectCatalog({homeDirectory: home}, async catalog => {
      for (const project of projects) {
        if (home !== f.homes[0]) await catalog.ensureSyncedProject({project_id: project.project_id, display_name: project.display_name, actor_id: owner}, () => {});
        for (const plugin_id of plugins) {
          if (!catalog.listProjectPlugins(project.project_id).includes(plugin_id)) await catalog.addProjectPlugin({project_id: project.project_id, plugin_id, actor_id: owner});
        }
      }
    });
  }
  const open = async (home: string) => {
    const runtime = await runtimePersonalSync(home, f.space);
    f.closeWith(() => runtime.close());
    const localProjects = await runtime.withCatalog({homeDirectory: home}, catalog => catalog.listProjects());
    const project = (index = 0) => {
      const row = localProjects.find(candidate => candidate.project_id === projects[index]!.project_id);
      assert.ok(row);
      return row;
    };
    const actions = (index = 0) => {
      const row = project(index);
      return runtime.host.actionClient(molisWorkHostProjectReference({projectId: row.project_id, databasePath: row.database_path}));
    };
    const bind = async (pluginId: string, collectionId?: string) => {
      const rows = await discoverRuntimeSyncCollections(home, f.space.spaceId, runtime.host, runtime.withCatalog, () => {});
      const registration = rows.find(row => row.selection.plugin_id === pluginId && (!collectionId || row.selection.collection_id === collectionId));
      assert.ok(registration, `active sync owner: ${pluginId} ${collectionId ?? ''}`);
      return personalRuntimeSyncAuthority({home, spaceId: f.space.spaceId, authorize() {}, withCatalog: runtime.withCatalog,
        readCatalog: runtime.readCatalog, policy: () => ({ revision: 1, selections: [registration.selection] }), hasArtifact: () => false, hasReference: () => false}).bind(registration);
    };
    return { ...runtime, home, project, actions, bind };
  };
  return { owner, space: f.space, source: await open(f.homes[0]!), target: await open(f.homes[1]!), requests: () => fetch.mock.callCount() };
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
