import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {AttentionModule} from '@molis-ai/molis-work-module-attention-resumption';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createPersonalSync,LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-01/11/15/22 Inbox uses actual Host registry and Rust/D1/R2, retaining references without running them',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-attention-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
 t.after(()=>{for(const [name,value]of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]])if(value===undefined)delete process.env[name];else process.env[name]=value;});t.mock.method(globalThis,'fetch',cloud.transport);
 const p=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{const project=await c.createProject({display_name:'Saved Inbox',actor_id:'alice'});c.addProjectPlugin({project_id:project.project_id,plugin_id:'inbox',actor_id:'alice'});return project;});
 const source=new LocalProjectDatabase(p.database_path);t.after(()=>source.close());const owner=new AttentionModule(source.db,{exists:()=>true});
 for(let n=0;n<320;n++){const entry=owner.commands.create({project_id:p.project_id,entry_id:'entry-'+n,subject_type:'feed_item',subject_id:'saved-item-'+n,reason:'manual',detail:{source_id:'source'}}).entry;if(n%2===0)owner.commands.setStatus(p.project_id,entry.entry_id,'done',entry.revision);}
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
 const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));t.after(()=>clients.forEach(c=>c.close()));
 const selected=clients[0].status().collections.find(row=>row.selection.collection_id==='attention');assert.ok(selected);assert.equal(clients[0].policy().selections.length,0,'new collection does not grant consent');
 await clients[0].save({...clients[0].policy(),selections:[selected.selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restored=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(row=>row.project_id===p.project_id));assert.ok(restored);
 const target=new LocalProjectDatabase(restored.database_path);t.after(()=>target.close());let effects=0;const received=new AttentionModule(target.db,{exists:()=>false},{eventSink(){effects++;}});
 assert.equal(received.query.list(p.project_id).length,320);assert.equal(received.events.list(p.project_id).length,480);assert.equal(received.query.get(p.project_id,'entry-0').status,'done');assert.equal(received.query.get(p.project_id,'entry-1').subject_id,'saved-item-1');assert.equal(effects,0);assert.ok((await cloud.bucket.list()).objects.length>0);
 // Two devices edit the same previously synchronized entry. Resolve explicitly; don't overwrite either branch silently.
 owner.commands.setStatus(p.project_id,'entry-1','done',owner.query.get(p.project_id,'entry-1').revision);const shown=received.query.get(p.project_id,'entry-1');received.commands.setStatus(p.project_id,'entry-1','dismissed',shown.revision);
 await clients[0].run();await clients[1].run();const collection=clients[1].status().collections.find(row=>row.selection.collection_id==='attention'),conflict=collection.conflicts[0];assert.ok(conflict);
 const namespace=syncNamespace(collection.selection),comparison=clients[1].inspectConflict(namespace,conflict.key);assert.ok(comparison);await clients[1].resolve(namespace,conflict.key,'remote',comparison.revision);
 const adopted=received.query.get(p.project_id,'entry-1');assert.equal(adopted.status,'done');assert.ok(adopted.revision>shown.revision);assert.throws(()=>received.commands.setStatus(p.project_id,'entry-1','open',shown.revision),{code:'attention.revision_conflict'});
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before,'adopting remote content produces no echo');
});
