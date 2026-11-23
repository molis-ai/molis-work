import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { PluginRuntime, PluginSupervisor, HOST_BUILD_TRUST, bindRuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { goalsActions } from '@molis-ai/molis-work-plugin-goals';
import { pagesActions } from '@molis-ai/molis-work-plugin-pages';
import { person } from './fixtures/home-runtime.js';
import { approvalSelections } from './fixtures/personal-goals-sync.js';
import { pagesSyncSelection } from './fixtures/personal-sync-coordinator.js';
import { syncOwnerPair } from './fixtures/runtime-personal-sync.js';

test('passive owner reference checks see current facts and lose access with the installation or account',async t=>{
 let account=true;const ids=new Set(['original']),project='project';
 const unused=()=>{throw new Error('CONTENT_NOT_REQUESTED');};
 const replica:SyncReplicaAdapter={next:unused,receive:unused,acknowledge:unused,cursor:unused,counts:unused,conflicts:unused,resolve:unused};
 const definition:PluginDefinition={manifest:{schema_version:1,host_api_version:1,plugin_id:'io.molis.work.example.references',name:'References',version:'1.0.0',kind:'app',publisher:{publisher_id:'example',signature:'signed-owner'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],permissions:[{permission:'storage:private',required:true,reason:'Own data'}],capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},ui:{contributions:[]},sync:{protocol_version:1,collections:[{id:'items',title:'Items',schema_version:1,requires:[]}]}},
  async start(){return {kind:'app',sync:[{collection_id:'items',replica,hasReference(projectId,id,version){return projectId===project&&version===undefined&&ids.has(id);}}]};}};
 const runtime=new PluginRuntime(undefined,undefined,{hostIds:new Set([definition.manifest.plugin_id]),actions:{registry:new ActionService()}}),supervisor=new PluginSupervisor(runtime);
 await supervisor.start([{definition,trust:HOST_BUILD_TRUST,grants:['storage:private']}]);
 t.after(async()=>{for(const record of runtime.list())if(record.state==='running')await runtime.stop(record.install_id);});
 const binding=await bindRuntimeSyncCollection(supervisor,definition.manifest.plugin_id,'items',{authorize(){if(!account)throw new Error('ACCOUNT_CHANGED');},record:id=>runtime.get(id)});assert.ok(binding?.hasReference,JSON.stringify(supervisor.states()));
 assert.equal(binding.hasReference(project,'original'),true);assert.equal(binding.hasReference('foreign','original'),false);
 assert.equal(binding.hasReference(project,'new'),false);ids.add('new');assert.equal(binding.hasReference(project,'new'),true,'same-round restored facts are visible without a stale snapshot');
 assert.throws(()=>binding.hasReference!(project,'original',-1));
 account=false;assert.throws(()=>binding.hasReference!(project,'original'),/ACCOUNT_CHANGED/);account=true;
 supervisor.revoke(definition.manifest.plugin_id);assert.throws(()=>binding.hasReference!(project,'original'),{code:'actions.forbidden'});
});

test('a fresh Pages replica receives documents with Goals references on its first round', { timeout: 90_000 }, async t => {
  const { owner, source, target } = await syncOwnerPair(t, ['goals', 'pages']);
  const client = (side: typeof source) => bindActionClient(side.actions(), () => ({
    ...person(['goals:read', 'goals:write', 'pages:read', 'pages:write'], side.project().project_id), actor_id: owner,
  }));
  const goal_id = 'first-sync-goal';
  await client(source).invoke(goalsActions.create, { goal_id, title: 'First sync goal', idempotency_key: goal_id });
  const { document } = await client(source).invoke(pagesActions.create, { goal_id, title: 'Linked page' });

  await source.sync.run();
  await source.sync.save({ ...source.sync.policy(), selections: [pagesSyncSelection, ...approvalSelections] });
  await source.sync.run();
  assert.equal(source.sync.status().error, null);
  await target.sync.run();
  assert.equal(target.sync.status().error, null);
  for (const { sync } of [source, target]) {
    for (const row of sync.status().collections.filter(row => row.selection.collection_id === pagesSyncSelection.collection_id || row.selection.collection_id === 'project_goals')) {
      assert.deepEqual(row.failures, [], row.selection.collection_id);
      assert.deepEqual(row.conflicts, [], row.selection.collection_id);
      assert.equal(row.pending, 0, row.selection.collection_id);
    }
  }

  const restored = await client(target).invoke(pagesActions.get, { id: document.id });
  assert.equal(restored.document.goal_id, goal_id);
});
