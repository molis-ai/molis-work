import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import {builtinSyncBindings, discoverRuntimeSyncCollections} from '@molis-ai/molis-work-app-local-host';
import {BUILTIN_PLUGIN_CATALOG, HOST_FRAMED_SURFACES} from '@molis-ai/molis-work-app-workbench';
import type {PluginRegistration as BuiltinPluginEntry} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import {syncOwnerPair} from './fixtures/runtime-personal-sync.js';

test('every registered browser factory parses after composing its shared helpers',()=>{
 for(const entry of BUILTIN_PLUGIN_CATALOG){
  const script=entry.workbench.clientFactory;
  if(script)new Script('('+script+')',{filename:entry.manifest.plugin_id});
 }
});

test('PCSYNC-03/25 each declared collection resolves its own explicit factory, independent of order',()=>{
 const entry=BUILTIN_PLUGIN_CATALOG.find(row=>row.project_plugin_id==='pages')!;
 const calls:string[]=[];
 const factory=(id:string)=>({scope:'home' as const,open(){calls.push(id);return {close(){},replica():never{throw new Error('Discovery must not open a replica');}};}});
 const documents=factory('documents'),attachments=factory('attachments');
 const custom:BuiltinPluginEntry={...entry,manifest:{...entry.manifest,sync:{protocol_version:1,collections:[
  {id:'attachments',title:'Saved attachments',schema_version:1,requires:['documents']},
  {id:'documents',title:'Documents',schema_version:1,requires:[]},
  {id:'future',title:'Not connected',schema_version:1,requires:[]},
  {id:'constructor',title:'Not an own binding',schema_version:1,requires:[]},
 ]}},sync:{documents,attachments,undeclared:factory('must not advertise')}};
 const bindings=builtinSyncBindings([custom]);assert.deepEqual(calls,[],'discovery does not read, upload or grant consent');
 assert.deepEqual(bindings.map(row=>row.collection.id),['attachments','documents']);assert.equal(bindings[0]!.binding,attachments);assert.equal(bindings[1]!.binding,documents);
 assert.deepEqual(bindings[0]!.dependencies.map(s=>s.collection_id),['documents']);assert.equal(bindings[0]!.dependencies[0]!.publisher_signature,custom.manifest.publisher.signature);assert.deepEqual(bindings[1]!.dependencies,[]);
 for(const {binding} of bindings){assert.equal(binding.scope,'home');if(binding.scope==='home')binding.open('unused','owner').close();}
 assert.deepEqual(calls,['attachments','documents']);
 const reordered={...custom,manifest:{...custom.manifest,sync:{...custom.manifest.sync!,collections:[...custom.manifest.sync!.collections].reverse()}}};
 assert.deepEqual(builtinSyncBindings([reordered]).map(row=>[row.collection.id,row.binding]),[['documents',documents],['attachments',attachments]]);
});

test('PCSYNC-22 current built-in bindings all name a declared collection exactly once',()=>{
 const bindings=builtinSyncBindings();assert.deepEqual(bindings.map(({entry,collection})=>[entry.manifest.plugin_id,collection.id]).sort(),[['io.molis.work.plugin-builder','authoring'],['system.shelf','copies']]);
 const identities=bindings.map(({entry,collection})=>JSON.stringify([entry.manifest.plugin_id,collection.id]));assert.equal(new Set(identities).size,identities.length);
 for(const entry of BUILTIN_PLUGIN_CATALOG)for(const collection of entry.manifest.sync?.collections??[])assert.ok(Object.hasOwn(entry.sync??{},collection.id)||collection.sections||collection.tracking||collection.aggregates,`${entry.manifest.plugin_id}.${collection.id} declares a Runtime binding`);
 for(const entry of BUILTIN_PLUGIN_CATALOG)for(const id of Object.keys(entry.sync??{}))assert.ok(entry.manifest.sync?.collections.some(c=>c.id===id),`${entry.project_plugin_id}.${id}`);
});

test('AC-M1-03 all 19 persistent built-ins resolve through static bindings or an active Runtime owner', {timeout: 120_000}, async t => {
 // Inbox keeps nothing to sync since 44B PR3: its attention items are the platform's (system.attention, project library 2→3).
 const excluded = new Set(['diff', 'git', 'inbox']);
 const expected = ['coding', 'cognia', 'dataset', 'feed', 'form', 'goals', 'images', 'issues', 'jelly',
  'lingguang', 'pages', 'plugin-builder', 'ppt', 'risk', 'schedule', 'shelf', 'todo', 'work-brief', 'workflows'];
 // The studio's drafts are the platform's since 47-1 C, under the identity they always had (HOST_FRAMED_SURFACES).
 const catalog = [...BUILTIN_PLUGIN_CATALOG.filter(entry => !excluded.has(entry.project_plugin_id)), ...HOST_FRAMED_SURFACES];
 assert.deepEqual(catalog.map(entry => entry.project_plugin_id).sort(), expected);
 const {source} = await syncOwnerPair(t, catalog.filter(entry => 'project_runtime' in entry && entry.project_runtime).map(entry => entry.project_plugin_id));
 const {spaceId} = source.sync.policy();
 const runtime = await discoverRuntimeSyncCollections(source.home, spaceId, source.host, source.withCatalog, () => {});
 const key = (plugin: string, collection: string) => JSON.stringify([plugin, collection]);
 const registered = new Set(builtinSyncBindings().map(({selection}) => key(selection.plugin_id, selection.collection_id)));
 for (const row of runtime) {
  assert.equal(row.available?.(), true, `running owner for ${row.selection.plugin_id}.${row.selection.collection_id}`);
  registered.add(key(row.selection.plugin_id, row.selection.collection_id));
 }

 await source.sync.refreshCatalog();
 const coordinator = new Set(source.sync.status().collections.map(({selection}) => key(selection.plugin_id, selection.collection_id)));
 for (const entry of catalog) {
  const collections = entry.manifest.sync?.collections;
  assert.ok(collections?.length, `${entry.project_plugin_id} has a portable collection`);
  for (const collection of collections) {
   const identity = key(entry.manifest.plugin_id, collection.id);
   assert.ok(registered.has(identity), `${identity} has a real binding`);
   assert.ok(coordinator.has(identity), `${identity} is reachable through the coordinator`);
  }
 }
 for (const entry of BUILTIN_PLUGIN_CATALOG.filter(entry => excluded.has(entry.project_plugin_id))) {
  assert.equal(entry.manifest.sync, undefined);
  assert.equal([...coordinator].some(value => JSON.parse(value)[0] === entry.manifest.plugin_id), false);
 }
});
