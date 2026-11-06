import assert from 'node:assert/strict';
import test from 'node:test';
import { bindRuntimeSyncCollection, type PluginHostLifecycle } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createPersonalNotesSample } from '../examples/personal-sync-plugin/plugin.js';

test('copy source discovery never activates a dormant owner or creates source data', async () => {
  const manifest=createPersonalNotesSample().definition.manifest;
  let starts=0;
  const lifecycle:PluginHostLifecycle={manifest:()=>manifest,contract:()=>undefined,generation:()=>1,
    installation:()=>undefined,enabledPluginIds:()=>[manifest.plugin_id],activeInstance:()=>undefined,
    async ensureStarted(){starts++;throw new Error('SOURCE_WOULD_BE_MUTATED');}};
  const binding=await bindRuntimeSyncCollection(lifecycle,manifest.plugin_id,'notes',{authorize(){},record:()=>null},{activeOnly:true});
  assert.equal(binding,null);assert.equal(starts,0);
});

test('passive copy owner retains revocation fence across asset preparation',async()=>{
  const manifest=createPersonalNotesSample().definition.manifest;
  let alive=true,starts=0,prepared=0,resume!:()=>void;
  const waiting=new Promise<void>(resolve=>{resume=resolve;});
  const record={install_id:'copy-source',installation_generation:'one',plugin_id:manifest.plugin_id,version:manifest.version,
    publisher_id:manifest.publisher.publisher_id,publisher_signature:manifest.publisher.signature,state:'running',grants:['storage:private']} as PluginInstanceRecord;
  const replica={next:()=>null,acknowledge(){},receive(){},cursor:()=>0,counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}} satisfies SyncReplicaAdapter;
  const instance={install_id:record.install_id,active:()=>alive,contribution:{kind:'app' as const,sync:[{collection_id:'notes',replica,copy:()=>({kinds:[manifest.plugin_id+':note'],read:()=>null,snapshot:()=>[],references:()=>[],fork:(asset:{key:string;value:unknown})=>asset,apply(){},async prepare(){await waiting;prepared++;}})}]}};
  const lifecycle:PluginHostLifecycle={manifest:()=>manifest,contract:()=>undefined,generation:()=>1,installation:()=>undefined,
    enabledPluginIds:()=>[manifest.plugin_id],activeInstance:()=>instance,async ensureStarted(){starts++;return instance;}};
  const binding=await bindRuntimeSyncCollection(lifecycle,manifest.plugin_id,'notes',{authorize(){},record:()=>record},{activeOnly:true});
  assert.ok(binding?.copy);assert.equal(starts,0);
  const owner=binding.copy('source'),pending=owner.prepare!({key:'one',value:{}});
  alive=false;resume();await assert.rejects(pending,{code:'actions.forbidden'});assert.equal(prepared,1);
  assert.throws(()=>owner.snapshot('project'),{code:'actions.forbidden'});assert.equal(starts,0);
});
