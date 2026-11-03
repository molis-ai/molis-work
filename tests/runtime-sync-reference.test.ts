import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { PluginRuntime, PluginSupervisor, HOST_BUILD_TRUST, bindRuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';

test('passive owner reference checks see current facts and lose access with the installation or account',async t=>{
 let account=true;const ids=new Set(['original']),project='project';
 const unused=()=>{throw new Error('CONTENT_NOT_REQUESTED');};
 const replica:SyncReplicaAdapter={next:unused,receive:unused,acknowledge:unused,cursor:unused,counts:unused,conflicts:unused,resolve:unused};
 const definition:PluginDefinition={manifest:{schema_version:2,host_api_version:2,plugin_id:'io.molis.work.example.references',name:'References',version:'1.0.0',kind:'app',publisher:{publisher_id:'example',signature:'signed-owner'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],permissions:[{permission:'storage:private',required:true,reason:'Own data'}],capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},ui:{contributions:[]},sync:{protocol_version:1,collections:[{id:'items',title:'Items',schema_version:1,requires:[]}]}},
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
