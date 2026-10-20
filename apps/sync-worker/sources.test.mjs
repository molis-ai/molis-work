import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {SourcesModule,sourceDeletedAt} from '@molis-ai/molis-work-module-sources';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createPersonalSync,LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-01/11/17/22 Source descriptions use actual Host registry and Rust/D1/R2 without transferring a connection',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-source-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
 t.after(()=>{for(const [name,value]of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]])if(value===undefined)delete process.env[name];else process.env[name]=value;});t.mock.method(globalThis,'fetch',cloud.transport);
 const p=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{const project=await c.createProject({display_name:'Portable source project',actor_id:'alice'});c.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});return project;});
 const source=new LocalProjectDatabase(p.database_path);t.after(()=>source.close());const owner=new SourcesModule(source.db),now='2026-10-18T00:00:00.000Z';
 const record={project_id:p.project_id,source_id:'saved-source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'Saved source',description:'Business description',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'never-share-device-connection'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:null},connection_ref:'never-share-device-reference',account_label:'Never share account label',last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:now,updated_at:now};
 // A realistic retained status history makes the selected owner graph use common JSON/R2 content chunks.
 for(let n=0;n<600;n++)owner.commands.save({...record,description:'Saved description '+n});
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
 const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));clients.forEach(c=>assert.ok(c));t.after(()=>clients.forEach(c=>c.close()));
 const selected=clients[0].status().collections.find(row=>row.selection.collection_id==='source_descriptions');assert.ok(selected);
 await clients[0].save({...clients[0].policy(),selections:[selected.selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restoredProject=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(row=>row.project_id===p.project_id));assert.ok(restoredProject);
 const target=new LocalProjectDatabase(restoredProject.database_path);t.after(()=>target.close());const received=new SourcesModule(target.db),value=received.query.get(p.project_id,record.source_id);
 assert.equal(value.description,'Saved description 599');assert.equal(value.enabled,false);assert.equal(value.status,'paused');assert.equal(value.connection_ref,null);assert.deepEqual(value.config,{});assert.deepEqual(value.schedule,{mode:'manual'});assert.equal(received.events.list(p.project_id).length,600);
 assert.equal(owner.query.get(p.project_id,record.source_id).connection_ref,record.connection_ref);
 const objects=await cloud.bucket.list();assert.ok(objects.objects.length>0);for(const object of objects.objects){const content=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer()).toString('utf8');assert.doesNotMatch(content,/never-share-device-connection|never-share-device-reference|Never share account label/);}
 owner.commands.retire(p.project_id,record.source_id,'retain_history','2026-10-18T01:00:00.000Z');await clients[0].run();await clients[1].run();assert.equal(sourceDeletedAt(received.query.get(p.project_id,record.source_id)),'2026-10-18T01:00:00.000Z');assert.equal(received.query.get(p.project_id,record.source_id).enabled,false);
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before);
});
