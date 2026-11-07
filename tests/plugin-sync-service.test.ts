import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPluginSyncService, assertPluginSyncDeclarations } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginSyncServicePort } from '@molis-ai/molis-work-plugin-runtime';
import type { SyncAggregateDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';

const manifest: PluginManifest = {
  schema_version: 1, plugin_id: 'example.sync', version: '1', name: 'Sync', kind: 'app',
  publisher: { publisher_id: 'example', signature: 'example' }, host_api_version: 1,
  entrypoints: [], permissions: [], capabilities: {provides: [], consumes: []},
  artifacts: {produces: [], consumes: []}, ui: {contributions: []},
  sync: {protocol_version: 1, collections: [{id: 'records', title: 'Records', schema_version: 1, requires: [], aggregates:[{kind:'record',table:'records',columns:['id','project_id','body'],children:[]}]}]},
};
const definition = (): SyncAggregateDefinition => ({kind: 'record', table: 'records', columns: ['id', 'project_id', 'body'], children: [], validate() {}});
function setup() {
  let calls = 0, active = true;
  const port: PluginSyncServicePort = {
    manifest, tables: new Map([['records', new Set(['id', 'project_id', 'body'])]]),
    assertActive() { if (!active) throw new Error('stopped'); },
    aggregate(_collection, definitions) { calls++; assert.ok(Object.isFrozen(definitions)); assert.ok(Object.isFrozen(definitions[0])); throw new Error('accepted'); },
    sections() { calls++; throw new Error("accepted"); },
    collectionCopy() { calls++; throw new Error("accepted"); },
    collection() { calls++; throw new Error("accepted"); },
    retain() { calls++; },
    copy() { calls++; throw new Error('accepted'); },
  };
  return {client: createPluginSyncService(port), calls: () => calls, stop() {active = false;} };
}
test('sync admission refuses foreign tables, columns and undeclared collections before a library is touched', () => {
  const {client, calls} = setup();
  assert.throws(() => client.aggregate('other', [definition()]));
  assert.throws(() => client.aggregate('records', [{...definition(), table: 'molis_storage_space'}]));
  assert.throws(() => client.aggregate('records', [{...definition(), columns: ['id', 'secret']} ]));
  assert.throws(() => client.aggregate('records', [{...definition(), children: [{table: 'records', parent: 'id', columns: ['id'], orderBy: 'id; DELETE FROM records'}]}]));
  assert.equal(calls(), 0);
});
test('sync admission freezes accepted owner declarations and rejects a stopped activation', () => {
  const {client, calls, stop} = setup();
  assert.throws(() => client.aggregate('records', [definition()]), /accepted/);
  assert.equal(calls(), 1);
  stop();
  assert.throws(() => client.aggregate('records', [definition()]), /stopped/);
  assert.equal(calls(), 1);
});

test('custom trackers cannot join across project partitions or read platform metadata', () => {
  const {client, calls} = setup();
  const create = () => ({read: () => null, apply() {}});
  assert.throws(() => client.collection('records', {create, tracking: [{table: 'molis_storage_space', key:[{column:'space_id'}]}]}));
  assert.throws(() => client.collection('records', {create, tracking: [{table: 'records',key:[{column:'id'}],lookup:{table:'records',match:[{column:'id',rowColumn:'id'}]}}]}));
  assert.equal(calls(), 0);
});


test('existence predicates may inspect only declared owner tables in the same project',()=>{
  const tables=new Map([['boards',new Set(['project_id'])],['goals',new Set(['project_id','id'])]]);
  const declared=(existsAny: import('@molis-ai/molis-work-contracts/platform/plugin-sync').SyncTrackedTable['existsAny']):PluginManifest=>({...manifest,sync:{protocol_version:1,collections:[{id:'records',title:'Records',schema_version:1,requires:[],tracking:[{table:'boards',key:[{column:'project_id'}],existsAny}]}]}});
  assert.doesNotThrow(()=>assertPluginSyncDeclarations(declared([{table:'goals',match:[{column:'project_id',rowColumn:'project_id'}]}]),tables));
  assert.throws(()=>assertPluginSyncDeclarations(declared([{table:'foreign_owner',match:[{column:'project_id',rowColumn:'project_id'}]}]),tables));
  assert.throws(()=>assertPluginSyncDeclarations(declared([{table:'goals',match:[{column:'id',rowColumn:'project_id'}]}]),tables),'cross-project existence must not authorize a bootstrap mark');
});

test('sections reject empty, foreign and duplicate owner declarations and ignore object property insertion order',()=>{
  const section={id:'records',tables:[{name:'records',columns:['id','project_id','body'],keys:['project_id','id']}],journalTypes:[],receiptOperations:[],sequenceFields:[]};
  const declaration={journal:false,platform:[],business:[section],kind:'records'} as const;
  const tables=new Map([['records',new Set(['id','project_id','body'])]]);
  const manifestFor=(business:typeof declaration.business|readonly unknown[]):PluginManifest=>({...manifest,sync:{protocol_version:1,collections:[{id:'records',title:'Records',schema_version:1,requires:[],sections:{...declaration,business:business as typeof declaration.business}}]}});
  for(const invalid of [[],[{...section,tables:[{...section.tables[0]!,name:'foreign_owner'}]}],[section,section]])assert.throws(()=>assertPluginSyncDeclarations(manifestFor(invalid),tables));
  const port:PluginSyncServicePort={manifest:manifestFor([section]),tables,assertActive(){},sections(){throw new Error('accepted');},aggregate(){throw new Error('unexpected');},copy(){throw new Error('unexpected');},collection(){throw new Error('unexpected');},collectionCopy(){throw new Error('unexpected');},retain(){throw new Error('unexpected');}};
  assert.throws(()=>createPluginSyncService(port).sections('records',{kind:'records',business:[{...section,validate(){}}],platform:[],journal:false}),/accepted/);
});
