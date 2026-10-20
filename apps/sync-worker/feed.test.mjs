import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace,createEvidenceContentStore,createLazyFileSecretStore} from '@molis-ai/molis-work-storage';
import {SignalsModule} from '@molis-ai/molis-work-module-signals';
import {SourcesModule} from '@molis-ai/molis-work-module-sources';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createPersonalSync,LocalProjectDatabase,createLocalFeedApplication} from '@molis-ai/molis-work-app-local-host';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-01/11/12/15/22 Messages and exact evidence cross actual Host/Rust/D1/R2 without keys, listeners or automatic Inbox work',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-feed-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 const env={MOLIS_WORK_SYNC_ORIGIN:'https://sync.example.test',MOLIS_WORK_SYNC_LOCAL:undefined,MOLIS_WORK_SECRET_BACKEND:'file',MOLIS_WORK_ENCRYPTION_KEY:''},previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 for(const [k,v]of Object.entries(env))if(v===undefined)delete process.env[k];else process.env[k]=v;
 t.after(()=>{for(const [k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});t.mock.method(globalThis,'fetch',cloud.transport);
 const p=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{const project=await c.createProject({display_name:'Saved messages',actor_id:'alice'});c.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});return project;});
 const source=new LocalProjectDatabase(p.database_path);t.after(()=>source.close());const at='2026-10-18T00:00:00.000Z',sources=new SourcesModule(source.db);
 sources.commands.save({project_id:p.project_id,source_id:'source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'Saved source',description:'Only its description',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'must-not-share-provider'},schedule:{mode:'manual'},connection_ref:'must-not-share-connection',account_label:null,last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:at,updated_at:at});
 const stores=homes.map(home=>createEvidenceContentStore({secretStore:createLazyFileSecretStore(home),rootDirectory:join(home,'feed','evidence')})),text='Saved raw evidence 🙂\n'.repeat(21000),ref=stores[0].write(text).contentRef;
 const signals=new SignalsModule(source.db),draft={project_id:p.project_id,source_id:'source',provider_dedupe_id:'one',kind:'update',occurred_at:at,observed_at:at,payload:{title:'First'},content_refs:[ref],raw_event_id:'raw-fixed',adapter:{plugin_id:'fixture',version:'1.0.0'},provenance:{fixture:true}};
 signals.commands.submitDraft(draft);const signal=signals.commands.submitDraft({...draft,payload:{title:'Second'}}).signal,feed=createLocalFeedApplication(source.db);
 const result=feed.ingestItem({source:feed.getSource(p.project_id,'source'),externalId:'one',signal:{signal_id:signal.signal_id,revision:2},title:'Saved notification',summary:'Summary',occurredAt:at,attention:false});
 // The owner module provides the explicit material command; no Host SQL writes business facts.
 const {FeedModule}=await import('@molis-ai/molis-work-module-feed'),{AttentionModule}=await import('@molis-ai/molis-work-module-attention-resumption'),{createContextLedger}=await import('@molis-ai/molis-work-module-context-ledger');
 const materialOwner=new FeedModule(source.db,new AttentionModule(source.db,{exists:()=>true}),{ledger:createContextLedger(source.db,{authorize:()=>true})}),item=materialOwner.query.list(p.project_id)[0];assert.ok(result);assert.ok(item);
 materialOwner.commands.upsertMaterial({project_id:p.project_id,item_id:item.item_id,material_id:'material',canonical_url:'https://example.test/item',title:'Original',source_name:'Fixture',published_at:at,preview:'Saved preview',content_hash:'provider-fixed-hash',content_ref:ref,content_available:true,content_type:'text/markdown',character_count:text.length,captured_at:at,provenance:{fixture:true},selected_for_context:true,imported_at:at,updated_at:at});
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'},clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));t.after(()=>clients.forEach(c=>c.close()));
 const selected=clients[0].status().collections.filter(row=>['source_descriptions','messages'].includes(row.selection.collection_id));assert.equal(selected.length,2);
 await clients[0].save({...clients[0].policy(),selections:selected.map(c=>c.selection)});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restored=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(row=>row.project_id===p.project_id));assert.ok(restored);const target=new LocalProjectDatabase(restored.database_path);t.after(()=>target.close());
 const received=createLocalFeedApplication(target.db).snapshot(p.project_id);assert.equal(received.feed_items.length,1);assert.equal(received.feed_items[0].title,'Saved notification');assert.equal(received.feed_items[0].materials[0].content_ref,ref);assert.equal(stores[1].read(ref),text);assert.equal(new SignalsModule(target.db).query.list(p.project_id)[0].revision,2);assert.equal(new SignalsModule(target.db).events.list(p.project_id).length,2);
 assert.equal(new AttentionModule(target.db,{exists:()=>false}).query.list(p.project_id).length,0,'sync does not admit messages into Inbox');assert.equal(new SourcesModule(target.db).query.get(p.project_id,'source').enabled,false);
 assert.notEqual(createLazyFileSecretStore(homes[0]).get('system:feed:evidence-content-key:v1'),createLazyFileSecretStore(homes[1]).get('system:feed:evidence-content-key:v1'));
 for(const object of (await cloud.bucket.list()).objects){const bytes=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer());assert.doesNotMatch(bytes.toString('utf8'),/must-not-share-provider|must-not-share-connection|evidence-content-key/);}
 materialOwner.commands.setDisposition(p.project_id,item.item_id,'archived',item.revision);await clients[0].run();await clients[1].run();assert.equal(createLocalFeedApplication(target.db).snapshot(p.project_id).feed_items[0].disposition,'archived');assert.equal(stores[1].read(ref),text);
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before,'restoration does not echo into a new upload');
});
