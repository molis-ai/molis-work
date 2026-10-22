import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import {builtinSyncBindings,BUILTIN_PLUGIN_CATALOG,type BuiltinPluginEntry} from '@molis-ai/molis-work-app-workbench';

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
 const bindings=builtinSyncBindings();assert.equal(bindings.length,23);
 const identities=bindings.map(({entry,collection})=>JSON.stringify([entry.manifest.plugin_id,collection.id]));assert.equal(new Set(identities).size,identities.length);
 for(const entry of BUILTIN_PLUGIN_CATALOG)for(const id of Object.keys(entry.sync??{}))assert.ok(entry.manifest.sync?.collections.some(c=>c.id===id),`${entry.project_plugin_id}.${id}`);
});
