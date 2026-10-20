import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {SqlitePluginPrivateStorage} from '@molis-ai/molis-work-plugin-runtime';
import {AgentBuilderStore,builderManifest} from '@molis-ai/molis-work-plugin-builder';
import type {PluginPrivateStorage} from '@molis-ai/molis-work-contracts/platform/plugin';

const KEY='plugin-builder:agent-built:v1';
const context={install_id:'builder-state-test',plugin_id:builderManifest.plugin_id,version:builderManifest.version,deployment:'local' as const,project_id:'project',grants:['storage:private'],requireGrant(){}};
async function fixture(t:TestContext){
 const root=await mkdtemp(join(tmpdir(),'molis-builder-state-')),path=join(root,'owner.db'),db=new DatabaseSync(path),other=new DatabaseSync(path);
 const storage=new SqlitePluginPrivateStorage(db).forPlugin(context,builderManifest),second=new SqlitePluginPrivateStorage(other).forPlugin(context,builderManifest);
 t.after(async()=>{other.close();db.close();await rm(root,{recursive:true,force:true});});
 return {storage,second,owner:new AgentBuilderStore(storage)};
}

// PCS-S6: keep the target editing floor in the same actual private-KV CAS, including a refused deletion.
test('PTR-01 Builder refuses deletion, preserves the entire original and rejects stale editors',async t=>{
 const {storage,second,owner}=await fixture(t),build=owner.create('完整创作需求与未完成问题');
 const changed=owner.update(build.id,build.revision,value=>{value.title='新版本';value.messages.push({role:'user',text:'保留全部输入'});});
 assert.throws(()=>new AgentBuilderStore(second).update(build.id,build.revision,value=>{value.title='old editor';}),/草稿已更新/);
 assert.equal(owner.require(build.id).title,'新版本');
 const raw=storage.get(KEY)!;
 assert.throws(()=>owner.remove(build.id,changed.revision),{code:'plugin_builder.draft_deletion_unavailable'});
 assert.deepEqual(owner.require(build.id),changed);assert.equal(storage.get(KEY),raw,'refused deletion retains the full original bytes and editing floor');
 assert.throws(()=>new AgentBuilderStore(second).update(build.id,build.revision,()=>{}),/草稿已更新/);
 assert.equal(storage.get(KEY),raw,'rejected stale editors cannot erase a retained original');
});

// PCS-S6: refusal is the asserted outcome; neither the old version nor damaged state is replaced with an empty shelf.
test('Builder refuses another owner format and malformed editing floors without rewriting original bytes',async t=>{
 const {storage,owner}=await fixture(t),build=owner.create('保留的需求');const good=storage.get(KEY)!;
 for(const invalid of ['{"builds":[],"releases":[]}','not-json',JSON.stringify({...JSON.parse(good),format:1}),
  JSON.stringify({...JSON.parse(good),revisions:{[build.id]:0}}),JSON.stringify({...JSON.parse(good),revisions:{[build.id]:build.revision+1}})]){
  storage.set(KEY,invalid);assert.throws(()=>owner.list(),/格式版本无效/);assert.throws(()=>owner.create('must not reset'),/格式版本无效/);assert.equal(storage.get(KEY),invalid);
 }
 storage.set(KEY,good);assert.equal(owner.require(build.id).brief,'保留的需求');
});

// PCS-S6: an independent connection wins between read and the one actual CAS. No get+set overwrite or retry.
test('Builder CAS preserves a concurrent owner write and invokes a rejected mutation only once',async t=>{
 const {storage,second,owner}=await fixture(t),build=owner.create('original'),other=new AgentBuilderStore(second);let once=true,calls=0;
 const port:PluginPrivateStorage={...storage,compareAndSet(key,expected,value){if(once){once=false;other.update(build.id,build.revision,row=>{row.title='other connection';});}return storage.compareAndSet!(key,expected,value);}};
 assert.throws(()=>new AgentBuilderStore(port).update(build.id,build.revision,row=>{calls++;row.title='unaccepted';}),/草稿已更新/);
 assert.equal(calls,1);assert.equal(owner.require(build.id).title,'other connection');
 const state=JSON.parse(storage.get(KEY)!);assert.equal(state.revisions[build.id],build.revision+1);
});

test('Builder refuses revision overflow before running the mutation or deleting the owner record',async t=>{
 const {storage,owner}=await fixture(t),build=owner.create('revision boundary'),state=JSON.parse(storage.get(KEY)!);
 state.builds[0].revision=Number.MAX_SAFE_INTEGER;state.revisions[build.id]=Number.MAX_SAFE_INTEGER;storage.set(KEY,JSON.stringify(state));
 const before=storage.get(KEY);let calls=0;assert.throws(()=>owner.update(build.id,Number.MAX_SAFE_INTEGER,()=>{calls++;}),/版本已达上限/);
 assert.throws(()=>owner.remove(build.id,Number.MAX_SAFE_INTEGER),{code:'plugin_builder.draft_deletion_unavailable'});assert.equal(calls,0);assert.equal(storage.get(KEY),before);
});
