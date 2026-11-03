import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { PluginRuntime, PluginSupervisor, HOST_BUILD_TRUST, bindRuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import { runtimeSyncRegistration } from '@molis-ai/molis-work-app-local-host';
import { PersonalSync } from '@molis-ai/molis-work-module-sync-replication';
import type { PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { personalSyncFixture } from './fixtures/personal-sync-coordinator.js';

test('Runtime contributions prepare only selected installed owners and lose authority across awaited history reads',async t=>{
 const f=personalSyncFixture(t);let active=true,revokeOnRead=false,preparations=0,completed=0,reads=0;
 const check=()=>{if(!active)throw new Error('REVOKED');};
 const readHistory=async()=>{check();reads++;await Promise.resolve();if(revokeOnRead)active=false;check();return '{}';};
 const idle:SyncReplicaAdapter={next:()=>null,receive(){throw new Error('unexpected incoming');},acknowledge(){},cursor:()=>0,counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){throw new Error('unexpected resolve');}};
 const definition:PluginDefinition={manifest:{schema_version:2,host_api_version:2,plugin_id:'io.molis.work.example.syncfixture',name:'Fixture',version:'1.0.0',kind:'app',publisher:{publisher_id:'example',signature:'fixture'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],permissions:[{permission:'storage:private',required:true,reason:'Owner records'}],capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},ui:{contributions:[]},sync:{protocol_version:1,collections:[{id:'content',title:'Content',schema_version:1,requires:[]},{id:'journal',title:'Journal',schema_version:1,requires:[]}]}},
  async start(){return {kind:'app',sync:[{collection_id:'content',replica:idle,async prepareUploads(){preparations++;await readHistory();completed++;return [];}},{collection_id:'journal',replica:{...idle,next(){throw new Error('Unselected owner must not be read');}}}]};}};
 const runtime=new PluginRuntime(undefined,undefined,{hostIds:new Set([definition.manifest.plugin_id]),actions:{registry:new ActionService()}}),supervisor=new PluginSupervisor(runtime);
 await supervisor.start([{definition,trust:HOST_BUILD_TRUST,grants:['storage:private']}]);
 f.closeWith(async()=>{for(const record of runtime.list())if(record.state==='running')await runtime.stop(record.install_id);});
 const registrations=[];
 for(const id of ['content','journal']){
  const binding=await bindRuntimeSyncCollection(supervisor,definition.manifest.plugin_id,id,{authorize:check,record:id=>runtime.get(id)});assert.ok(binding);
  registrations.push(runtimeSyncRegistration(f.homes[0],f.space.spaceId,[{projectId:'project',binding}],check));
 }
 const client=new PersonalSync({home:f.homes[0],spaceId:f.space.spaceId,endpoint:'http://127.0.0.1:8788',fetch:f.transport,authority:{signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'},registrations});
 f.closeWith(async()=>client.close());
 client.status();await client.run();assert.equal(preparations,0,'passive discovery and unselected rounds do not read history');
 await client.save({...client.policy(),selections:[registrations[0]!.selection]});await client.run();assert.equal(client.status().error,null);assert.ok(preparations>0);assert.equal(reads,preparations);
 await assert.rejects(()=>registrations[0]!.prepare({key:JSON.stringify(['foreign-project','item']),value:{},revision:1,base:0,operationId:'foreign'}),/尚未安装/);
 const before=completed;revokeOnRead=true;await client.run();assert.equal(completed,before,'a revoked awaited read cannot continue preparing its owner');assert.throws(()=>client.status(),/REVOKED/);
 active=true;revokeOnRead=false;supervisor.revoke(definition.manifest.plugin_id);const prepared=preparations;await client.run();assert.equal(preparations,prepared,'a revoked installation is not revived by discovery');
});
