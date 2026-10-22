import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {FeedModule,feedContentReplicationDefinition} from '@molis-ai/molis-work-module-feed';
import {SignalsModule,signalContentReplicationDefinition} from '@molis-ai/molis-work-module-signals';
import {AttentionModule} from '@molis-ai/molis-work-module-attention-resumption';
import {createContextLedger} from '@molis-ai/molis-work-module-context-ledger';
import {createProjectEvidenceContent} from '@molis-ai/molis-work-app-local-host';
import {bindDatabaseSpace,personalStorageSpace,ensureStorageSpace,createEvidenceContentStore,createLazyFileSecretStore,replicaSchemaSql,createProjectContentReplicaFactory,installProjectReplicaJournal,type ReplicaDatabase,type ReplicaInputValue,type ReplicaOutputValue} from '@molis-ai/molis-work-storage';

function fixture(){
 const home=mkdtempSync(join(tmpdir(),'feed-sync-owner-')),space=personalStorageSpace('https://auth.example','work','user');ensureStorageSpace(home,space);
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');db.exec("CREATE TABLE project_root(project_id TEXT PRIMARY KEY);INSERT INTO project_root VALUES('project');CREATE TABLE boards(project_id TEXT PRIMARY KEY);INSERT INTO boards VALUES('project')");let effects=0,authorized=true;
 const attention=new AttentionModule(db,{exists:()=>true}),signals=new SignalsModule(db);
 const feed=new FeedModule(db,attention,{ledger:createContextLedger(db,{authorize:()=>true}),eventSink(){effects++;}});
 const port:ReplicaDatabase={exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[],Record<string,ReplicaOutputValue>>(sql)};bindDatabaseSpace(port,space);db.exec(replicaSchemaSql('messages'));
 const definitions=[signalContentReplicationDefinition(),feedContentReplicationDefinition()];installProjectReplicaJournal(port,'messages',definitions,['project']);
 const authorize=()=>{if(!authorized)throw new Error('lease revoked');},replica=createProjectContentReplicaFactory(definitions,'messages','project_feed')(port,{spaceId:space.spaceId,projectId:'project',title:'Test',authorize});
 const content=createEvidenceContentStore({secretStore:createLazyFileSecretStore(home),rootDirectory:join(home,'feed','evidence')}),codec=createProjectEvidenceContent(home,definitions,'project_feed',space.spaceId,authorize);
 return {home,db,feed,attention,signals,replica,content,codec,deny(){authorized=false;},effects:()=>effects,close(){db.close();rmSync(home,{recursive:true,force:true});}};
}
function seed(f:ReturnType<typeof fixture>){
 const text='Saved original 🙂\n'.repeat(17000),ref=f.content.write(text).contentRef,at='2026-10-18T00:00:00.000Z';
 const draft={project_id:'project',source_id:'source',provider_dedupe_id:'event',kind:'update',occurred_at:at,observed_at:at,payload:{title:'Version one'},content_refs:[ref],raw_event_id:'raw-event',adapter:{plugin_id:'fixture',version:'1.0.0'},provenance:{source:'fixture'}};
 f.signals.commands.submitDraft(draft);const signal=f.signals.commands.submitDraft({...draft,payload:{title:'Version two'}}).signal;
 const item=f.feed.commands.ingest({project_id:'project',source_id:'source',source_kind:'fixture',source_label:'Saved source',external_id:'event',signal:{signal_id:signal.signal_id,revision:signal.revision},title:'Saved item',summary:'Saved summary',occurred_at:at,attention:false,
 material:{material_id:'material',canonical_url:'https://example.test/item',title:'Original',source_name:'Fixture',published_at:at,preview:'Saved preview',content_hash:'fixed-provider-digest',content_ref:ref,content_available:true,content_type:'text/markdown',character_count:text.length,captured_at:at,provenance:{evidence:'fixed'},selected_for_context:true}}).item;
 return {text,ref,item,draft,mutation:f.replica.next()!};
}
test('S-81 PCSYNC-01/11/12/22 Feed restores exact evidence bytes, fixed Signal revisions and owner facts without listener or Inbox effects',async t=>{
 const a=fixture(),b=fixture();t.after(()=>{a.close();b.close();});const {text,ref,item,draft,mutation}=seed(a),encoded=a.codec.encode(mutation.key,mutation.value);
 assert.ok(encoded.blobs.some(blob=>Buffer.from(blob.bytes).equals(Buffer.from(text))));assert.doesNotMatch(JSON.stringify(encoded.value),/\.db|evidence-content-key|credential|cursor|lease/);
 const decoded=await b.codec.decode(mutation.key,encoded.value,async r=>{const blob=encoded.blobs.find(b=>b.digest===r.digest&&b.size===r.size);assert.ok(blob);return blob.bytes;});
 b.replica.receive({...mutation,value:decoded,revision:1});assert.equal(b.content.read(ref),text);assert.equal(b.feed.query.get('project',item.item_id).materials[0]!.content_ref,ref);assert.equal(b.signals.query.list('project')[0]!.revision,2);assert.equal(b.signals.events.list('project').length,2);assert.equal(b.attention.query.list('project').length,0);assert.equal(b.effects(),0);assert.equal(b.replica.next(),null);
 assert.notEqual(createLazyFileSecretStore(a.home).get('system:feed:evidence-content-key:v1'),createLazyFileSecretStore(b.home).get('system:feed:evidence-content-key:v1'),'target encrypts with its own key; no key is transported');
 const next=b.signals.commands.submitDraft({...draft,payload:{title:'Version three'}});assert.equal(next.signal.revision,3,'fixed history resumes without renumbering');
});
test('S-81 PCSYNC-01/12/14/15 Feed refuses foreign identity, missing/corrupt evidence, stale edits and revoked late writes',async t=>{
 const a=fixture(),b=fixture(),late=fixture();t.after(()=>{a.close();b.close();late.close();});const {ref,item,mutation}=seed(a),encoded=a.codec.encode(mutation.key,mutation.value);
 await assert.rejects(()=>b.codec.decode(JSON.stringify(['other','project_feed','other']),encoded.value,async()=>{throw new Error('must not read');}));
 await assert.rejects(()=>b.codec.decode(mutation.key,encoded.value,async()=>Buffer.from('damaged')));assert.equal(b.content.has(ref),false);assert.deepEqual(b.feed.query.list('project'),[]);
 const bad=structuredClone(mutation.value) as {facts:{signals_content:{signal_revisions:{content_hash:string}[]}}};bad.facts.signals_content.signal_revisions[0]!.content_hash='0'.repeat(64);assert.throws(()=>a.codec.encode(mutation.key,bad));
 const coerced=structuredClone(mutation.value) as {facts:{feed_content:{feed_materials:{content_available:unknown}[]}}};coerced.facts.feed_content.feed_materials[0]!.content_available='1';assert.throws(()=>a.codec.encode(mutation.key,coerced),'current flags must not be silently coerced from text');
 const read=async(r:{digest:string;size:number})=>encoded.blobs.find(b=>b.digest===r.digest&&b.size===r.size)!.bytes;
 await assert.rejects(()=>late.codec.decode(mutation.key,encoded.value,async r=>{const bytes=await read(r);late.deny();return bytes;}),/lease revoked/);assert.equal(late.content.has(ref),false);
 const decoded=await b.codec.decode(mutation.key,encoded.value,read);b.replica.receive({...mutation,value:decoded,revision:1});const shown=b.feed.query.get('project',item.item_id);
 a.feed.commands.setDisposition('project',item.item_id,'saved',item.revision);const second=a.replica.next()!; // Frozen first operation still exists until its exact ACK.
 assert.equal(second.operationId,mutation.operationId);a.replica.acknowledge(mutation.key,mutation.operationId,1);const changed=a.replica.next()!;
 b.replica.receive({...changed,revision:2});assert.throws(()=>b.feed.commands.setDisposition('project',item.item_id,'archived',shown.revision),{code:'feed.revision_conflict'});assert.equal(b.feed.query.get('project',item.item_id).disposition,'saved');
 a.content.delete(ref);assert.throws(()=>a.codec.encode(changed.key,changed.value),{code:'host.replica_content_unavailable'});
});
