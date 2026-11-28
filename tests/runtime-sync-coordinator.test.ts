import assert from 'node:assert/strict';
import test from 'node:test';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { PluginRuntime, PluginSupervisor, HOST_BUILD_TRUST, bindRuntimeSyncCollection, installIdentity } from '@molis-ai/molis-work-plugin-runtime';
import { runtimeSyncRegistration } from '@molis-ai/molis-work-app-local-host';
import { PersonalSync } from '@molis-ai/molis-work-module-sync-replication';
import { openOverviewIndex } from '@molis-ai/molis-work-storage';
import type { PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { personalSyncFixture } from './fixtures/personal-sync-coordinator.js';

test('Runtime contributions prepare only selected installed owners and lose authority across awaited history reads',async t=>{
 const f=personalSyncFixture(t);let active=true,revokeOnRead=false,preparations=0,completed=0,reads=0;
 const check=()=>{if(!active)throw new Error('REVOKED');};
 const readHistory=async()=>{check();reads++;await Promise.resolve();if(revokeOnRead)active=false;check();return '{}';};
 const idle:SyncReplicaAdapter={next:()=>null,receive(){throw new Error('unexpected incoming');},acknowledge(){},cursor:()=>0,counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){throw new Error('unexpected resolve');}};
 const definition:PluginDefinition={manifest:{schema_version:1,host_api_version:1,plugin_id:'com.example.syncfixture',name:'Fixture',version:'1.0.0',kind:'app',publisher:{publisher_id:'example',signature:'fixture'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],permissions:[{permission:'storage:private',required:true,reason:'Owner records'}],capabilities:{provides:[],consumes:[]},artifacts:{produces:[],consumes:[]},ui:{contributions:[]},sync:{protocol_version:1,collections:[{id:'content',title:'Content',schema_version:1,requires:[]},{id:'journal',title:'Journal',schema_version:1,requires:[]}]}},
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

test('AP-09 runtimeSyncRegistration read-only polls do not dirty overview_libraries while mutating receive marks only its own install dirty', async t => {
 const f = personalSyncFixture(t);
 const received: unknown[] = [];
 const replica: SyncReplicaAdapter = {
  next: () => null,
  receive(event) { received.push(event); },
  acknowledge() {},
  cursor: () => 0,
  counts: () => ({ pending: 0, conflicts: 0 }),
  conflicts: () => [],
  resolve() {},
 };
 const definition: PluginDefinition = {
  manifest: {
   schema_version: 1, host_api_version: 1, plugin_id: 'com.example.syncdirty', name: 'SyncDirty', version: '1.0.0', kind: 'app',
   publisher: { publisher_id: 'example', signature: 'syncdirty' },
   entrypoints: [{ deployment: 'local', entrypoint: './index.js' }],
   permissions: [{ permission: 'storage:private', required: true, reason: 'Owner records' }],
   capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
   sync: { protocol_version: 1, collections: [{ id: 'content', title: 'Content', schema_version: 1, requires: [] }] },
  },
  async start() { return { kind: 'app', sync: [{ collection_id: 'content', replica }] }; },
 };
 const runtime = new PluginRuntime(undefined, undefined, { hostIds: new Set([definition.manifest.plugin_id]), actions: { registry: new ActionService() } });
 const supervisor = new PluginSupervisor(runtime);
 await supervisor.start([{ definition, trust: HOST_BUILD_TRUST, grants: ['storage:private'] }]);
 f.closeWith(async () => { for (const record of runtime.list()) if (record.state === 'running') await runtime.stop(record.install_id); });
 const binding = await bindRuntimeSyncCollection(supervisor, definition.manifest.plugin_id, 'content', { authorize() {}, record: id => runtime.get(id) });
 assert.ok(binding);
 const registration = runtimeSyncRegistration(f.homes[0], f.space.spaceId, [{ projectId: 'proj-1', binding }], () => {});
 const installId = installIdentity(definition.manifest);
 const otherInstallId = 'other-install-id';

 const index = openOverviewIndex({ homeDirectory: f.homes[0] });
 try {
  index.replace({ partition_id: 'proj-1', install_id: installId, plugin_id: definition.manifest.plugin_id, path: '/unused', kinds: ['task'] }, [], []);
  index.replace({ partition_id: 'proj-1', install_id: otherInstallId, plugin_id: 'com.example.other', path: '/unused-other', kinds: ['task'] }, [], []);
  // Read-only polls must NOT dirty either installation.
  registration.withReplica(r => { r.counts(); r.next(); r.conflicts(); r.cursor(); });
  assert.deepEqual(index.state('proj-1', installId), { dirty: false }, 'read-only polls leave own overview library clean');
  assert.deepEqual(index.state('proj-1', otherInstallId), { dirty: false }, 'read-only polls leave sibling overview library clean');
  // Mutating receive marks ONLY this plugin's install_id dirty, never the whole partition.
  registration.withReplica(r => r.receive({
   key: JSON.stringify(['proj-1', 'item-1']),
   value: { sync_runtime: 1, spaceId: f.space.spaceId, projectId: 'proj-1', value: { ok: true } },
   revision: 1, base: 0, operationId: 'op-1',
  }));
  assert.equal(received.length, 1);
  assert.deepEqual(index.state('proj-1', installId), { dirty: true }, 'mutating receive marks this install dirty');
  assert.deepEqual(index.state('proj-1', otherInstallId), { dirty: false }, 'sibling install in the same partition stays clean');
 } finally {
  index.close();
 }
});
