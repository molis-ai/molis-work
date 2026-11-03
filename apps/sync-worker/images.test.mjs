import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { imagesActions, IMAGES_ACTION_PERMISSIONS, imagesManifest } from '@molis-ai/molis-work-plugin-images';
import { molisWorkHostProjectReference } from '@molis-ai/molis-work-app-local-host';
import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { cloudFixture } from './testing.mjs';
import {runtimePersonalSync,prepareSyncTestHome} from '../../tests/fixtures/runtime-personal-sync.ts';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
test('PCSYNC-IMG-READ-01 Images transfers saved bytes/history through actual D1/R2 and reads via actions without services or runners',async t=>{
 const f=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-images-sync-'));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>{ensureStorageSpace(h,space);prepareSyncTestHome(h);});
 let executions=0;
 const provider=createServer(async(req,res)=>{for await(const _ of req){}executions++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:PNG.toString('base64')}]}));});
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));t.after(()=>{provider.closeAllConnections();return new Promise(resolve=>provider.close(resolve));});
 const previous=process.env.MOLIS_WORK_SYNC_ORIGIN;process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=previous;});const nativeFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',(url,init)=>new URL(String(url)).origin==='https://sync.example.test'?f.transport(url,init):nativeFetch(url,init));
 const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},c=>c.createProject({display_name:'Pictures',actor_id:'alice'}));
 const target=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{}));
 const runtimes=await Promise.all(homes.map(home=>runtimePersonalSync(home,space,()=>{},{accessToken:async()=>'alice',authOrigin:'https://auth.example.test'}))),hosts=runtimes.map(runtime=>runtime.host);t.after(async()=>{try{for(const runtime of runtimes)await runtime.close();}finally{rmSync(root,{recursive:true,force:true});}});
 const actions=hosts.map((host,i)=>bindActionClient(host.actionClient(molisWorkHostProjectReference({databasePath:[project,target][i].database_path,projectId:project.project_id})),()=>({actor_id:LOCAL_PERSON_ACTOR_ID,project_id:project.project_id,audience:'user',permissions:IMAGES_ACTION_PERMISSIONS})));
 const {connection}=await actions[0].invoke(imagesActions.saveConnection,{name:'This-device-only',api_format:'openai-images',base_url:`http://127.0.0.1:${provider.address().port}`,model:'synthetic'});
 const {job:started}=await actions[0].invoke(imagesActions.start,{request_id:'only-click',connection_id:connection.id,prompt:'Saved picture'});
 let job;const deadline=Date.now()+5000;do{job=(await actions[0].invoke(imagesActions.get,{id:started.id})).job;if(job.status==='running')await setTimeout(10);}while(job.status==='running'&&Date.now()<deadline);
 assert.equal(job.status,'succeeded');assert.equal(executions,1);
 const selection={plugin_id:imagesManifest.plugin_id,publisher_id:imagesManifest.publisher.publisher_id,publisher_signature:imagesManifest.publisher.signature,collection_id:imagesManifest.sync.collections[0].id,schema_version:imagesManifest.sync.collections[0].schema_version};
 const clients=runtimes.map(runtime=>runtime.sync);await clients[0].run();await clients[1].run();
 await clients[0].save({spaceId:space.spaceId,revision:0,selections:[selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const restored=(await actions[1].invoke(imagesActions.get,{id:job.id})).job;assert.equal(restored.prompt,job.prompt);assert.equal(restored.connection_id,'');assert.equal(restored.status,'succeeded');
 assert.deepEqual((await actions[1].invoke(imagesActions.list,{})).jobs,[restored]);assert.deepEqual(Buffer.from((await actions[1].invoke(imagesActions.image,{id:job.id,image_id:job.images[0].id})).base64,'base64'),PNG);
 assert.deepEqual((await actions[1].invoke(imagesActions.connections,{})).connections,[]);assert.equal(executions,1);
 const db=new DatabaseSync(join(homes[1],'images','images.db'));try{assert.equal(db.prepare('SELECT runner_id FROM jobs WHERE id=?').get(job.id).runner_id,null);}finally{db.close();}
 const events=await f.db.prepare('SELECT value FROM sync_events').all();assert.doesNotMatch(events.results.map(r=>r.value).join(''),/only-click|runner_id|input_hash|connection_id|filename|base_url/);assert.ok((await f.bucket.list()).objects.length>=2,'raw PNG and owner JSON are private R2 content');
 // Owner edit versus remote edit: both versions retained, compare then resolve with an observed revision.
 const edit=(index,prompt)=>{const db=new DatabaseSync(join(homes[index],'images','images.db'));try{db.prepare('UPDATE jobs SET prompt=? WHERE id=?').run(prompt,job.id);}finally{db.close();}};
 edit(0,'source edit');edit(1,'other edit');await clients[0].run();await clients[1].run();const collection=clients[1].status().collections.find(c=>c.selection.plugin_id===selection.plugin_id&&c.selection.collection_id===selection.collection_id);assert.equal(collection.conflicts.length,1);
 const key=collection.conflicts[0].key,ns=JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,selection.schema_version]);
 const seen=clients[1].inspectConflict(ns,key);assert.equal(seen.local.value.record.prompt,'other edit');assert.equal(seen.remote.value.record.prompt,'source edit');await clients[1].resolve(ns,key,'remote',seen.revision,seen.state);assert.equal(clients[1].recoveries(ns).length,1);
 const count=(await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,count,'receipts prevent echo');
 await actions[0].invoke(imagesActions.delete,{id:job.id});await clients[0].run();await clients[1].run();await assert.rejects(actions[1].invoke(imagesActions.get,{id:job.id}),{code:'images.not_found'});assert.equal(executions,1);
});
