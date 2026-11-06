import {runtimePersonalSync} from '../../tests/fixtures/runtime-personal-sync.ts';
import {feedManifest} from '@molis-ai/molis-work-plugin-feed';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {SourcesModule,sourceDeletedAt,fromBetterSqlite} from '@molis-ai/molis-work-plugin-feed/store';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-01/11/17/22 Source descriptions use actual Host registry and Rust/D1/R2 without transferring a connection',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-source-cloud-'));const runtimes=[];t.after(async()=>{for(const runtime of runtimes)await runtime.close();rmSync(root,{recursive:true,force:true});});
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
 t.after(()=>{for(const [name,value]of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]])if(value===undefined)delete process.env[name];else process.env[name]=value;});t.mock.method(globalThis,'fetch',cloud.transport);
 const p=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{const project=await c.createProject({display_name:'Portable source project',actor_id:'alice'});c.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});return project;});
 const source=new LocalProjectDatabase(p.database_path);t.after(()=>source.close());const owner=new SourcesModule(fromBetterSqlite(source.db)),now='2026-10-18T00:00:00.000Z';
 const record={project_id:p.project_id,source_id:'saved-source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'Saved source',description:'Business description',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'never-share-device-connection'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:null},connection_ref:'never-share-device-reference',account_label:'Never share account label',last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:now,updated_at:now};
 // A realistic retained status history makes the selected owner graph use common JSON/R2 content chunks.
 for(let n=0;n<600;n++)owner.commands.save({...record,description:'Saved description '+n});
 // The other device explicitly opens the known project before passive synchronization discovery.
 await withMolisWorkProjectCatalog({homeDirectory:homes[1]},async c=>{await c.ensureSyncedProject({project_id:p.project_id,display_name:p.display_name,actor_id:'alice'},()=>{});c.addProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});});
 for(const home of homes)runtimes.push(await runtimePersonalSync(home,space,()=>{},{authOrigin:'https://auth.example.test',accessToken:async()=>'alice'}));
 const clients=runtimes.map(runtime=>runtime.sync);
 const select=id=>{const collection=feedManifest.sync.collections.find(row=>row.id===id);assert.ok(collection);return {plugin_id:feedManifest.plugin_id,publisher_id:feedManifest.publisher.publisher_id,publisher_signature:feedManifest.publisher.signature,collection_id:id,schema_version:collection.schema_version};};
 const selected={selection:select('source_descriptions')};
 await clients[0].save({...clients[0].policy(),selections:[selected.selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restoredProject=await runtimes[1].withCatalog({homeDirectory:homes[1]},c=>c.listProjects().find(row=>row.project_id===p.project_id));assert.ok(restoredProject);
 const target=new LocalProjectDatabase(restoredProject.database_path);t.after(()=>target.close());const received=new SourcesModule(fromBetterSqlite(target.db)),value=received.query.get(p.project_id,record.source_id);
 assert.equal(value.description,'Saved description 599');assert.equal(value.enabled,false);assert.equal(value.status,'paused');assert.equal(value.connection_ref,null);assert.deepEqual(value.config,{});assert.deepEqual(value.schedule,{mode:'manual'});assert.equal(received.events.list(p.project_id).length,600);
 assert.equal(owner.query.get(p.project_id,record.source_id).connection_ref,record.connection_ref);
 const objects=await cloud.bucket.list();assert.ok(objects.objects.length>0);for(const object of objects.objects){const content=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer()).toString('utf8');assert.doesNotMatch(content,/never-share-device-connection|never-share-device-reference|Never share account label/);}
 owner.commands.retire(p.project_id,record.source_id,'retain_history','2026-10-18T01:00:00.000Z');await clients[0].run();await clients[1].run();assert.equal(sourceDeletedAt(received.query.get(p.project_id,record.source_id)),'2026-10-18T01:00:00.000Z');assert.equal(received.query.get(p.project_id,record.source_id).enabled,false);
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before);
});
