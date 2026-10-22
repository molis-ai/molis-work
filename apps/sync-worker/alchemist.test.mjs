import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAlchemistStudioRuntime,openAlchemistSyncStore,alchemistActions as a,alchemistManifest} from '@molis-ai/molis-work-plugin-alchemist';
import {builtinSyncBindings} from '@molis-ai/molis-work-app-workbench';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {PersonalSync} from '@molis-ai/molis-work-module-sync-replication';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-ALC-ACTOR-01 Studio real authors cross actual Rust WASM/D1/R2; stale edit and execution restoration are refused',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-studio-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 let executions=0;const ai={listModels:async()=>[],search:async()=>{throw Error('Restore must not search');},generate:async()=>{executions++;throw Error('Restore must not generate');}};
 const runtime=i=>createAlchemistStudioRuntime({databasePath:join(homes[i],'alchemist/projects/project/studio.sqlite'),storage:{space,projectId:'project'},ai});
 const source=runtime(0);t.after(()=>source.close());
 const sourceActions=source.actionsFor('alice');
 const body='Portable research🙂 '.repeat(180);let first;
 for(let i=0;i<320;i++){const result=await sourceActions.invoke(a.directionCreate,{title:'Direction '+i,description:body});first??=result.direction;}
 assert.deepEqual(source.database.prepare('SELECT id FROM workspace_actors').all().map(row=>row.id),['alice']);
 const now=new Date().toISOString();source.database.prepare("INSERT INTO jobs(id,kind,status,input_json,checkpoint_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run('terminal-source-job','discovery.brainstorm.v1','completed','{"private":"never-upload-input"}','{"private":"never-upload-checkpoint"}',now,now);
 source.database.prepare("UPDATE runtime_settings SET model_id='never-upload-device-model'").run();
 const entry=builtinSyncBindings().find(row=>row.entry.manifest.plugin_id===alchemistManifest.plugin_id&&row.collection.id==='studio'),binding=entry.binding;
 assert.equal(binding.scope,'project-library');
 const selection={plugin_id:alchemistManifest.plugin_id,publisher_id:alchemistManifest.publisher.publisher_id,publisher_signature:alchemistManifest.publisher.signature,collection_id:'studio',schema_version:1};
 const clients=homes.map(home=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'alice';}},fetch:cloud.transport,registrations:[{
  selection,title:'Studio',content:binding.content({spaceId:space.spaceId,authorize(){}}),async refresh(){},async prepare(){},withReplica(run){const store=openAlchemistSyncStore(home,'project');try{return run(store.replica({spaceId:space.spaceId,projectId:'project',title:'Portable research',authorize(){}}));}finally{store.close();}}
 }]}));t.after(()=>clients.forEach(c=>c.close()));
 await clients[0].save({spaceId:space.spaceId,revision:0,selections:[selection]});await clients[0].run();await clients[1].run();clients.forEach(c=>assert.equal(c.status().error,null));
 const target=runtime(1),targetActions=target.actionsFor('alice');t.after(()=>target.close());assert.equal((await targetActions.invoke(a.bootstrap,{})).directions.length,320);
 assert.deepEqual(target.database.prepare('SELECT * FROM workspace_actors ORDER BY id').all(),source.database.prepare('SELECT * FROM workspace_actors ORDER BY id').all());
 await target.runPending();assert.equal(executions,0);assert.equal(target.database.prepare('SELECT input_json,checkpoint_json FROM jobs WHERE id=?').get('terminal-source-job').input_json,'{}');assert.equal(target.database.prepare('SELECT checkpoint_json FROM jobs WHERE id=?').get('terminal-source-job').checkpoint_json,null);
 const objects=await cloud.bucket.list();assert.ok(objects.objects.length>1,'large research graph uses common JSON content chunks in private R2');
 for(const object of objects.objects){const bytes=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer());assert.doesNotMatch(bytes.toString('utf8'),/never-upload-input|never-upload-checkpoint|never-upload-device-model/);}
 const old=(await targetActions.invoke(a.directionEditing,{id:first.id})).etag;
 await sourceActions.invoke(a.directionUpdate,{id:first.id,title:'Source changed',description:body,expectedEtag:(await sourceActions.invoke(a.directionEditing,{id:first.id})).etag});
 await clients[0].run();await clients[1].run();assert.equal((await targetActions.invoke(a.directionEditing,{id:first.id})).direction.title,'Source changed');
 await assert.rejects(targetActions.invoke(a.directionUpdate,{id:first.id,title:'Stale editor',description:body,expectedEtag:old}),{code:'alchemist.edit_changed'});
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before,'restoring saved research and rejecting stale edits cause no upload echo');
});
