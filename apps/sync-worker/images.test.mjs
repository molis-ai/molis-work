import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { ImagesService, openImagesSyncStore, imagesManifest, createImagesSyncContent } from '@molis-ai/molis-work-plugin-images';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { PersonalSync } from '@molis-ai/molis-work-module-sync-replication';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { cloudFixture } from './testing.mjs';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
test('PCSYNC-11/12/15/22/23 Images transfers saved bytes/history through actual D1/R2, never services or runners',async t=>{
 const f=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-images-sync-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 let executions=0;
 const services=homes.map(home=>new ImagesService({homeDirectory:home,resolveConnectionKey:()=>'',selectConnection(){},selectedConnectionId:()=>null,clearConnection(){},generate:async()=>{executions++;return [{bytes:PNG,mime:'image/png'}];}}));
 t.after(async()=>{for(const s of services)await s.close();});
 const connection=services[0].saveConnection({name:'This-device-only',api_format:'openai-images',base_url:'http://127.0.0.1:19291',model:'synthetic'});
 const started=services[0].start('project',{request_id:'only-click',connection_id:connection.id,prompt:'Saved picture'});
 for(let i=0;i<100&&services[0].getJob('project',started.id).status==='running';i++)await setImmediate();
 const job=services[0].getJob('project',started.id);assert.equal(job.status,'succeeded');assert.equal(executions,1);
 const selection={plugin_id:imagesManifest.plugin_id,publisher_id:imagesManifest.publisher.publisher_id,publisher_signature:imagesManifest.publisher.signature,collection_id:imagesManifest.sync.collections[0].id,schema_version:1};
 const clients=homes.map(home=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'alice';}},fetch:f.transport,registrations:[{
  selection,title:'Images',content:createImagesSyncContent({spaceId:space.spaceId,authorize(){}}),async refresh(){},async prepare(){},
  withReplica(run){const store=openImagesSyncStore(home);try{return run(store.replica({spaceId:space.spaceId,authorize(){},conflictState:createSyncConflictState,canUploadProject:id=>id==='project',project(id){assert.equal(id,'project');return {title:'Pictures'};},hasArtifact:()=>false}));}finally{store.close();}}
 }]}));t.after(()=>clients.forEach(c=>c.close()));
 await clients[0].save({spaceId:space.spaceId,revision:0,selections:[selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restored=services[1].getJob('project',job.id);assert.equal(restored.prompt,job.prompt);assert.equal(restored.connection_id,'');assert.equal(restored.status,'succeeded');assert.deepEqual(services[1].readImage('project',job.id,job.images[0].id).bytes,PNG);assert.deepEqual(services[1].listConnections(),[]);assert.equal(executions,1);
 const db=new DatabaseSync(join(homes[1],'images','images.db'));try{assert.equal(db.prepare('SELECT runner_id FROM jobs WHERE id=?').get(job.id).runner_id,null);}finally{db.close();}
 const events=await f.db.prepare('SELECT value FROM sync_events').all();assert.doesNotMatch(events.results.map(r=>r.value).join(''),/only-click|runner_id|input_hash|connection_id|filename|base_url/);assert.ok((await f.bucket.list()).objects.length>=2,'raw PNG and owner JSON are private R2 content');
 // Owner edit versus remote edit: both versions retained, compare then resolve with an observed revision.
 const edit=(index,prompt)=>{const db=new DatabaseSync(join(homes[index],'images','images.db'));try{db.prepare('UPDATE jobs SET prompt=? WHERE id=?').run(prompt,job.id);}finally{db.close();}};
 edit(0,'source edit');edit(1,'other edit');await clients[0].run();await clients[1].run();const collection=clients[1].status().collections[0];assert.equal(collection.conflicts.length,1);
 const key=collection.conflicts[0].key,ns=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
 const seen=clients[1].inspectConflict(ns,key);assert.equal(seen.local.record.prompt,'other edit');assert.equal(seen.remote.record.prompt,'source edit');await clients[1].resolve(ns,key,'remote',seen.revision,seen.state);assert.equal(clients[1].recoveries(ns).length,1);
 const count=(await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,count,'receipts prevent echo');
 services[0].deleteJob('project',job.id);await clients[0].run();await clients[1].run();assert.throws(()=>services[1].getJob('project',job.id),{code:'images.not_found'});assert.equal(executions,1);
});
