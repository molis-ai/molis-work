import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';
import { personalSyncFixture as fixture, pagesSyncSelection as selection } from './fixtures/personal-sync-coordinator.js';
import {openDatasetStore,openFormStore,openLingguangStore,openPptStore,openTodoStore,openTodoSyncStore,openWorkflowsStore} from "./fixtures/plugin-sync-stores.js";

import type {TestContext} from "node:test";
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {homeSqlitePath,openBaselineHomeSqlite,namespacedReplicaDatabase} from '@molis-ai/molis-work-storage';

import {PersonalSync,syncNamespace,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';

import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {pluginSyncNamespace} from '@molis-ai/molis-work-app-local-host';
import {pagesManifest} from '@molis-ai/molis-work-plugin-pages';

import {artifactSyncSelection,createPersonalArtifactRegistration} from '@molis-ai/molis-work-app-local-host';
import {LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {ArtifactsModule,createArtifactReplication} from '@molis-ai/molis-work-module-artifacts';

import {newStation} from '@molis-ai/molis-work-plugin-workflows';

const body=(text:string)=>({type:'doc' as const,content:[{type:'paragraph',content:[{type:'text',text}]}]});

test('PERSAF-02 per-document replication works beyond the project snapshot limit and leaves unrelated editor versions untouched',async t=>{
  const f=fixture(t);const ids=f.withStore(0,s=>Array.from({length:170},(_,i)=>s.create({project_id:'project',title:'Document '+i,body:body('x'.repeat(100000))}).id));
  await f.enable();
  for(let i=0;i<6;i++){await f.clients[0].run();await f.clients[1].run();}
  assert.equal(f.clients[0].status().error,null);assert.equal(f.clients[1].status().error,null);
  assert.equal(f.withStore(1,s=>s.list('project').length),170);
  const unchanged=f.withStore(1,s=>s.get(ids[1]!).version);
  f.withStore(0,s=>s.update(ids[0]!,{title:'Changed only one'}));await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.get(ids[0]!).title),'Changed only one');
  assert.equal(f.withStore(1,s=>s.get(ids[1]!).version),unchanged);
});

for(const concurrent of [false,true])test('PCSYNC-10 full quota keeps uploads queued while independent deletes and downloads continue '+concurrent,async t=>{
  const f=fixture(t),old=f.withStore(0,s=>s.create({project_id:'project',title:'delete me'}));
  await f.enable();await f.clients[1].run();
  const pending=f.withStore(0,s=>s.create({project_id:'project',title:'retained locally'}));
  f.withStore(0,s=>s.delete(old.id));
  if(concurrent)f.afterQuotaSnapshot(()=>f.used(100000000));else f.used(100000000);
  await f.clients[0].run();assert.match(f.clients[0].status().error??'',/100 MB/);
  assert.equal(f.clients[0].status().collections[0].pending,1);
  assert.equal(f.withStore(0,s=>s.get(pending.id).title),'retained locally');
  await f.clients[1].run();assert.equal(f.withStore(1,s=>s.list('project').length),0);
  f.afterQuotaSnapshot(()=>{});f.used(0);await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.clients[0].status().error,null);assert.equal(f.withStore(1,s=>s.get(pending.id).title),'retained locally');
});

for (const reserved of [false, true]) test('Host binding receives Pages in '+(reserved?'the reserved personal partition':'a managed project'),{timeout:30000},async t=>{
  const f=fixture(t);
  const previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});
  t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>{
    const p=reserved ? await catalog.ensurePersonalSpace('alice') : await catalog.createProject({display_name:'跨设备项目',actor_id:'alice'});
    catalog.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});return p;
  });
  const page=f.withStore(0,s=>s.create({project_id:project.project_id,title:'完整正文',body:body('Shared content')}));
  let active=true;const check=()=>{if(!active)throw new Error('REVOKED');};
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{
    const target=reserved?await catalog.ensurePersonalSpace('alice'):await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},check);
    assert.equal(target.project_id,project.project_id);catalog.addProjectPlugin({project_id:target.project_id,plugin_id:'pages',actor_id:'alice'});
  });
  const runtimes=await Promise.all(f.homes.map(home=>runtimePersonalSync(home,f.space,check)));runtimes.forEach(runtime=>f.closeWith(()=>runtime.close()));
  const [a,b]=runtimes.map(runtime=>runtime.sync);
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});await a.run();assert.equal(a.status().error,null);
  await b.run();assert.equal(b.status().error,null);
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'完整正文');
  await runtimes[1]!.withCatalog({homeDirectory:f.homes[1]},catalog=>{
    assert.equal(catalog.listProjects().find(p=>p.project_id===project.project_id)?.display_name,reserved?'个人空间':'跨设备项目');
    assert.ok(catalog.listProjects().some(row=>row.project_id===project.project_id),'synchronization retains the explicit destination project');
  });
  assert.deepEqual(b.status().unavailable,[],'the explicitly opened project retains its installed Pages owner');
  active=false;await b.run();assert.throws(()=>b.status(),/REVOKED/);
});

test('Host sync: delayed fixed Artifact versions restore a waiting document without manual resolution',{timeout:60000},async t=>{
  const f=fixture(t);const previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});
  t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{
    const p=await c.createProject({display_name:'关联测试',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'pages',actor_id:'alice'});return p;
  });
  const store=new LocalProjectDatabase(project.database_path);
  try{
    const owner=new ArtifactsModule({db:store.db,appendEvent:e=>store.appendEvent(e)});
    for(const version of [1,2])owner.commands.registerVersion({project_id:project.project_id,artifact_id:'linked-artifact',version,actor_id:'alice',artifact_type_id:'io.molis.work.document',schema_version:1,origin:{kind:'imported',file_name:'report.json'},title:'Report',media_type:'application/json',producer:{plugin_id:'io.molis.work.pages',plugin_version:'1.0.0',binding_signature:'official-pages-binding'},content:{kind:'inline',payload:{title:'固定成果',version,text:'完整正文'}}});
    owner.commands.archiveVersion({project_id:project.project_id,artifact_id:'linked-artifact',version:1,actor_id:'alice'});
  }finally{store.close();}
  const page=f.withStore(0,s=>{const p=s.create({project_id:project.project_id,title:'有成果的文档',body:body('完整正文')});return s.update(p.id,{artifact_id:'linked-artifact',artifact_version:1});});
  const check=()=>{};
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},check);catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'pages',actor_id:'alice'});});
  const runtimes=await Promise.all(f.homes.map(home=>runtimePersonalSync(home,f.space,check)));runtimes.forEach(runtime=>f.closeWith(()=>runtime.close()));
  const [a,b]=runtimes.map(runtime=>runtime.sync);
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});await a.run();await b.run();assert.equal(b.status().error,null);
  const waiting=b.status().collections.find(c=>c.selection.plugin_id===selection.plugin_id)!.conflicts;
  assert.equal(waiting.length,1);assert.equal(waiting[0].waiting,true);assert.match(waiting[0].reason,/成果/);
  assert.equal(f.withStore(1,s=>s.list(project.project_id).length),0);
  await assert.rejects(()=>b.resolve(syncNamespace(selection),waiting[0].key,'local'),/尚未到达/);
  // Artifact history is a platform owner; selecting it does not install or enable a plugin.
  await a.save({...a.policy(),selections:[selection,artifactSyncSelection]});await a.run();assert.equal(a.status().error,null);
  await b.run();assert.equal(b.status().error,null);
  const restored=f.withStore(1,s=>s.get(page.id));assert.equal(restored.artifact_id,'linked-artifact');assert.equal(restored.artifact_version,1);assert.deepEqual(restored.body,body('完整正文'));
  await runtimes[1]!.withCatalog({homeDirectory:f.homes[1]},c=>{
    const p=c.listProjects().find(p=>p.project_id===project.project_id)!;const db=new LocalProjectDatabase(p.database_path);
    try{const owner=new ArtifactsModule({db:db.db,appendEvent:e=>db.appendEvent(e)});assert.equal(owner.query.listArtifactVersions(p.project_id,'linked-artifact').length,2);assert.equal(owner.query.getArtifactVersion(p.project_id,{artifact_id:'linked-artifact',version:1})!.lifecycle_state,'archived');}finally{db.close();}
  });
  assert.ok(b.status().collections.filter(c=>b.policy().selections.some(s=>syncNamespace(s)===syncNamespace(c.selection))).every(c=>c.conflicts.length===0&&c.pending===0));
  assert.equal(b.status().collections.find(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1')!.pending,0,'unselected project metadata is not read through its adapter');
  assert.equal(b.status().progress.pending,0,'PCSYNC-27 aggregate progress excludes unselected local queues');assert.equal(b.status().progress.complete,true);
  const n=f.events.length;await b.run();await a.run();assert.equal(f.events.length,n,'receipt/apply must not create a replication echo');
});

test('logout during a download cannot apply a late response or advance its cursor',async t=>{
  const f=fixture(t);const page=f.withStore(0,s=>s.create({project_id:'project',title:'late'}));await f.enable();
  f.beforeDownload(f.revoke);await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.list('project').some(p=>p.id===page.id)),false);
  const db=new DatabaseSync(homeSqlitePath(f.homes[1],'pages'));
  try{assert.equal(namespacedReplicaDatabase(db,pluginSyncNamespace(pagesManifest,'documents')).prepare('SELECT cursor FROM replica_state WHERE id=1').get()!.cursor,0);}finally{db.close();}
});

test('an unavailable collection does not block unrelated selected collections',async t=>{
  const f=fixture(t);const page=f.withStore(0,s=>s.create({project_id:'project',title:'Still syncs'}));await f.enable();
  // Enable through the synthetic server, as another device may have selected this known collection.
  await f.transport('http://127.0.0.1:8788/v1/policy',{method:'PUT',body:JSON.stringify({...f.clients[0].policy(),selections:[selection,artifactSyncSelection]})});
  const good:SyncRegistration={selection,title:'文档与文件夹',refresh:async()=>{},prepare:async()=>{},withReplica:run=>f.withReplica(1,run)};
  const bad:SyncRegistration={...good,selection:artifactSyncSelection,title:'成果及固定版本',refresh:async()=>{throw new Error('UNSUPPORTED_CONTENT');}};
  const c=new PersonalSync({home:f.homes[1],spaceId:f.space.spaceId,endpoint:'http://127.0.0.1:8788',fetch:f.transport,authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'},registrations:[bad,good]});t.after(()=>c.close());
  await c.run();assert.match(c.status().error!,/UNSUPPORTED_CONTENT/);assert.equal(f.withStore(1,s=>s.get(page.id).title),'Still syncs');
});

test('Artifact Host refuses an account or space that does not own its Home',t=>{
  const f=fixture(t);
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],f.space.spaceId,'bob',()=>{},withMolisWorkProjectCatalog),{code:'host.version_sync_scope'});
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],'foreign-space','alice',()=>{},withMolisWorkProjectCatalog),{code:'host.version_sync_scope'});
});

test('S-140 PCSYNC-14 Host refuses malformed fixed content before creating any target project',async t=>{
  const f=fixture(t),check=()=>{};
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},c=>c.createProject({display_name:'Validated before creation',actor_id:'alice'}));
  const source=new LocalProjectDatabase(project.database_path);t.after(()=>source.close());
  new ArtifactsModule({db:source.db,appendEvent:e=>source.appendEvent(e)}).commands.registerVersion({
    project_id:project.project_id,artifact_id:'fixed-report',version:1,actor_id:'alice',artifact_type_id:'io.example.report',schema_version:1,
    origin:{kind:'imported',file_name:'report.json'},title:'Report',media_type:'application/json',
    producer:{plugin_id:'io.example.writer',plugin_version:'1.0.0',binding_signature:'writer-signature'},content:{kind:'inline',payload:{text:'Complete report'}},
  });
  const artifact=createArtifactReplication(source.db,{spaceId:f.space.spaceId,projectId:project.project_id,authorize:check},{appendEvent:e=>source.appendEvent(e)}).read('fixed-report')!;
  const target=createPersonalArtifactRegistration(f.homes[1],f.space.spaceId,'alice',check,withMolisWorkProjectCatalog).registration;
  const value={project:{id:project.project_id,title:project.display_name},artifact};
  const event={key:JSON.stringify([project.project_id,'artifact','fixed-report']),operationId:'malformed-operation',deviceId:'source',revision:1,value};
  const tampered=structuredClone(event);tampered.value.artifact.versions[0]!.payload={text:'Tampered'};
  await assert.rejects(()=>target.prepare!(tampered),{code:'artifacts.sync_invalid'});
  const wrong=structuredClone(event);wrong.value.artifact.identity.artifact_id='another-report';
  await assert.rejects(()=>target.prepare!(wrong));
  assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.listProjects()),[]);
  await target.prepare!(event);
  assert.equal((await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.listProjects())).length,1,'valid complete content may provision its target');
});

test('two devices: durable offline edits, per-item deltas, folders, deletion and no echo',async t=>{
  const f=fixture(t);
  const folder=f.withStore(0,s=>s.createFolder({project_id:'project',title:'资料'}));
  const page=f.withStore(0,s=>s.create({project_id:'project',title:'初稿',folder_id:folder.id,body:body('one')}));
  await f.clients[0].run();assert.equal(f.events.length,0,'default off');
  await f.enable();await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'初稿');
  assert.equal(f.withReplica(1,r=>r.counts().pending),0,'remote apply does not enqueue');
  const baseline=f.events.length;
  f.offline();f.withStore(0,s=>s.update(page.id,{title:'离线修改'}));await f.clients[0].run();
  assert.match(f.clients[0].status().error!,/OFFLINE/);
  assert.equal(f.withReplica(0,r=>r.counts().pending),1);
  f.online();await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.events.length,baseline+1,'one changed item, not whole collection');
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'离线修改');
  f.withStore(0,s=>s.delete(page.id));await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.list('project').length),0);
  assert.equal(f.events.at(-1)!.value,null);
});

test('lost upload receipt retries exactly once and does not overwrite a newer local edit',async t=>{
  const f=fixture(t);await f.enable();
  const page=f.withStore(0,s=>s.create({project_id:'project',title:'v1'}));
  f.drop();await f.clients[0].run();assert.equal(f.events.length,1);
  f.withStore(0,s=>s.update(page.id,{title:'v2'}));
  await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.events.length,2);assert.equal(f.withStore(1,s=>s.get(page.id).title),'v2');
  assert.equal(f.withReplica(0,r=>r.counts().pending),0);
});

test('simultaneous same-item edits preserve both versions and explicit resolution uses latest remote base',async t=>{
  const f=fixture(t);const page=f.withStore(0,s=>s.create({project_id:'project',title:'base'}));
  await f.enable();await f.clients[1].run();
  f.withStore(0,s=>s.update(page.id,{title:'A'}));f.withStore(1,s=>s.update(page.id,{title:'B'}));
  await f.clients[0].run();await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'B');
  const conflict=f.withReplica(1,r=>r.conflicts()[0]);assert.ok(conflict);
  let pinned=false;f.onRetention(async route=>{assert.equal(route,'/v1/history/pin');assert.equal(f.withStore(1,s=>s.get(page.id).title),'B');assert.equal(f.withReplica(1,r=>r.conflicts().length),1);pinned=true;return undefined;});
  await f.clients[1].resolve(syncNamespace(selection),conflict.key,'local');await f.clients[1].run();await f.clients[0].run();
  assert.equal(pinned,true);assert.deepEqual(f.retained,[],'the already-uploaded remote branch is pinned, not duplicated');
  assert.equal(f.withStore(0,s=>s.get(page.id).title),'B');
  const db=new DatabaseSync(homeSqlitePath(f.homes[1],'pages'));try{assert.equal(namespacedReplicaDatabase(db,pluginSyncNamespace(pagesManifest,'documents')).prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n,1);}finally{db.close();}
});

async function conflictedPages(t:TestContext){
  const f=fixture(t),page=f.withStore(0,s=>s.create({project_id:'project',title:'base'}));
  await f.enable();await f.clients[1].run();
  f.withStore(0,s=>s.update(page.id,{title:'remote A'}));f.withStore(1,s=>s.update(page.id,{title:'local B'}));
  await f.clients[0].run();await f.clients[1].run();
  const namespace=syncNamespace(selection),conflict=f.clients[1].inspectConflict(namespace,f.withReplica(1,r=>r.conflicts()[0]!.key));assert.ok(conflict);
  return {f,page,namespace,conflict};
}

test('PCSYNC-15 choosing remote archives the exact inspected local branch before the original owner transaction',async t=>{
  const {f,page,namespace,conflict}=await conflictedPages(t),before=f.events.length;
  f.onRetention(async route=>{assert.equal(route,'/v1/history/archive');assert.equal(f.withStore(1,s=>s.get(page.id).title),'local B');assert.equal(f.withReplica(1,r=>r.conflicts().length),1);return undefined;});
  await f.clients[1].resolve(namespace,conflict.key,'remote',conflict.revision,conflict.state);
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'remote A');assert.equal(f.withReplica(1,r=>r.conflicts().length),0);
  assert.equal(f.retained.length,1);assert.deepEqual(f.retained[0]!.mutation.value,conflict.local);assert.equal(f.retained[0]!.mutation.base,conflict.revision);
  assert.equal(f.events.length,before,'an archive is not a new business head or an acknowledgement');
  assert.equal(f.clients[1].recoveries(namespace).length,1,'the original atomic local journal also remains available');
});

for(const failure of ['quota','offline','invalid-receipt','remote-changed'] as const)test('PCSYNC-15 failed cloud retention keeps original and conflict: '+failure,async t=>{
  const {f,page,namespace,conflict}=await conflictedPages(t);
  if(failure==='quota')f.used(100000000);
  else if(failure==='offline')f.offline();
  else f.onRetention(async()=>Response.json(failure==='invalid-receipt'?{accepted:true,revision:conflict.revision}:{error:'CONFLICT'},{status:failure==='invalid-receipt'?200:409}));
  await assert.rejects(()=>f.clients[1].resolve(namespace,conflict.key,'remote',conflict.revision,conflict.state));
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'local B');assert.equal(f.withReplica(1,r=>r.conflicts().length),1);assert.equal(f.clients[1].recoveries(namespace).length,0);assert.deepEqual(f.retained,[]);
});

test('PCSYNC-15 a stale inspected revision or state is rejected before any history request',async t=>{
  const {f,namespace,conflict}=await conflictedPages(t);let calls=0;f.onRetention(async()=>{calls++;return undefined;});
  await assert.rejects(()=>f.clients[1].resolve(namespace,conflict.key,'remote',conflict.revision+1,conflict.state),/版本已变化/);
  await assert.rejects(()=>f.clients[1].resolve(namespace,conflict.key,'local',conflict.revision,conflict.state+'stale'),/比较内容已变化/);
  assert.equal(calls,0);assert.equal(f.withReplica(1,r=>r.conflicts().length),1);
});

for(const change of ['edit','device-stop'] as const)test('PCSYNC-15 delayed retention never authorizes a newer local state: '+change,async t=>{
  const {f,page,namespace,conflict}=await conflictedPages(t);
  f.onRetention(async()=>{if(change==='edit')f.withStore(1,s=>s.update(page.id,{title:'newer local C'}));else await f.clients[1].setDevice(false);return undefined;});
  await assert.rejects(()=>f.clients[1].resolve(namespace,conflict.key,'remote',conflict.revision,conflict.state),/内容已变化|状态已变化/);
  assert.equal(f.withStore(1,s=>s.get(page.id).title),change==='edit'?'newer local C':'local B');assert.equal(f.withReplica(1,r=>r.conflicts().length),1);
  assert.equal(f.retained.length,1,'a retained backup does not claim that the user choice committed');assert.deepEqual(f.retained[0]!.mutation.value,conflict.local);
  assert.equal(f.clients[1].recoveries(namespace).length,0);
  if(change==='device-stop'){
    f.onRetention(async()=>undefined);await f.clients[1].resolve(namespace,conflict.key,'remote',conflict.revision,conflict.state);
    assert.equal(f.retained.length,1,'manual retry uses the same operation identity after a cancelled response');assert.equal(f.withStore(1,s=>s.get(page.id).title),'remote A');
  }
});

test('disable retains data; stale policy fails; account revocation blocks late writes',async t=>{
  const f=fixture(t);f.withStore(0,s=>s.create({project_id:'project',title:'keep'}));await f.enable();await f.clients[1].run();
  const old=f.clients[1].policy();await f.clients[0].save({...f.clients[0].policy(),selections:[]});await f.clients[0].run();
  await assert.rejects(()=>f.clients[1].save(old));
  f.withStore(0,s=>s.create({project_id:'project',title:'not uploaded'}));await f.clients[0].run();
  assert.equal(f.events.length,1);assert.equal(f.withStore(1,s=>s.list('project').length),1);
  f.revoke();assert.throws(()=>f.withReplica(0,r=>r.next()),/REVOKED/);
});

test('business SQL rollback rolls back the outbox too',async t=>{
  const f=fixture(t);f.withStore(0,()=>{});
  const db=new DatabaseSync(homeSqlitePath(f.homes[0],'pages'));
  try{db.exec("BEGIN; INSERT INTO folders VALUES ('f','project','Temp','2026-09-30T00:00:00Z','2026-09-30T00:00:00Z'); ROLLBACK;");assert.equal(namespacedReplicaDatabase(db,pluginSyncNamespace(pagesManifest,'documents')).prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,0);}finally{db.close();}
});

test('D1 schema: atomic CAS, owner isolation, idempotency constraint, disabled policy',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync('server/migrations/sync/0001_sync.sql','utf8'));
    const ns=syncNamespace(selection);
    db.prepare('INSERT INTO sync_policy VALUES (?,1,?,?)').run('alice','{}',JSON.stringify([ns]));
    const insert=db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint) VALUES (?,?,?,?,?,?,'[]',?,'schema-fixture')");
    insert.run('alice',ns,'one','doc',0,'{}',1);
    assert.throws(()=>insert.run('alice',ns,'two','doc',0,'{}',1),/SYNC_VERSION_CONFLICT/);
    assert.throws(()=>insert.run('bob',ns,'one','doc',0,'{}',1),/SYNC_POLICY_CONFLICT/);
    db.exec("UPDATE sync_policy SET revision=2,namespaces='[]'");
    assert.throws(()=>insert.run('alice',ns,'three','doc',1,'{}',1),/SYNC_POLICY_CONFLICT/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_events').get()!.n,1);
  }finally{db.close();}
});

test('PCSYNC-20 aggregate and workflow owners report only their own project changes without exporting content',t=>{
 const f=fixture(t),context={spaceId:f.space.spaceId,authorize(){},project:(id:string)=>({title:id}),canUploadProject:()=>false,hasArtifact:()=>false};
 for(const open of [openFormStore,openDatasetStore,openPptStore,openLingguangStore]){
  const store=open(f.homes[0]);try{
   store.create({project_id:'project-a',title:'Unsent'});const replica=store.replica(context);
   assert.equal(replica.hasProjectChanges!('project-a'),true);assert.equal(replica.hasProjectChanges!('project-b'),false);
   assert.equal(replica.next(),null,'disabled upload must not hide unsynced project content from lifecycle inspection');
  }finally{store.close();}
 }
 const store=openWorkflowsStore(f.homes[0]);try{
  store.create({project_id:'project-a',title:'Unsent workflow',chain:{stations:[newStation('pages')],links:[]}});
  const replica=store.replica(context);assert.equal(replica.hasProjectChanges!('project-a'),true);assert.equal(replica.hasProjectChanges!('project-b'),false);
 }finally{store.close();}
});

test('PCSYNC-20 Todo preserves deleted project scope across restart and protects both sides of an uncertain move until ACK',t=>{
 const f=fixture(t),home=f.homes[0],access=(projectId:string|null)=>({projectId,everything:true,actor:'user' as const,actorId:'alice'});
 let store=openTodoStore(home),sync=openTodoSyncStore(home);t.after(()=>{store.close();sync.close();});
 const context={spaceId:f.space.spaceId,authorize(){},project:(id:string)=>({title:id}),canUploadProject:()=>true,hasArtifact:()=>false};
 let replica=sync.replica(context);
 const initial=store.create({title:'Retain scope',placement:'project'},access('project-a')).item;
 const frozen=replica.next()!;assert.equal(replica.hasProjectChanges!('project-a'),true);
 const personal=store.update(initial.id,{placement:'personal'},initial.revision,access('project-a')).item;
 const moved=store.update(initial.id,{placement:'project'},personal.revision,access('project-b')).item;
 assert.equal(moved.project_id,'project-b');assert.equal(replica.hasProjectChanges!('project-a'),true);assert.equal(replica.hasProjectChanges!('project-b'),true);
 store.delete(moved.id,moved.revision,access('project-b'));assert.throws(()=>store.get(moved.id,access('project-b')),/找不到/);
 store.close();sync.close();store=openTodoStore(home);sync=openTodoSyncStore(home);replica=sync.replica(context);
 assert.equal(replica.hasProjectChanges!('project-a'),true,'uncertain old upload retains old project scope');
 assert.equal(replica.hasProjectChanges!('project-b'),true,'deleted row retains its last project across restart');
 assert.equal(replica.hasProjectChanges!('unrelated'),false);
 replica.acknowledge(frozen.key,frozen.operationId,1);assert.equal(replica.hasProjectChanges!('project-a'),false,'settled old scope must not block forever');
 assert.equal(replica.hasProjectChanges!('project-b'),true);const deletion=replica.next()!;assert.equal(deletion.value,null);
 replica.acknowledge(deletion.key,deletion.operationId,2);assert.equal(replica.hasProjectChanges!('project-b'),false);
});

test('PCSYNC-20 frozen Todo v2 is refused without changing original rows or bytes',t=>{
 const f=fixture(t),home=f.homes[0],old=openBaselineHomeSqlite(home,'todo',{version:2,schema:readFileSync(new URL('./fixtures/home-store-schemas/todo-v2.sql',import.meta.url),'utf8')});
 old.prepare("INSERT INTO todo_source_memory VALUES('source','original','keep',NULL,'preserve original','2026-10-19T00:00:00Z')").run();old.close();
 const file=join(home,'todo','todo.db'),before=readFileSync(file);
 assert.throws(()=>openTodoSyncStore(home),{code:'storage.store_too_new'});assert.deepEqual(readFileSync(file),before);
});

// PCSYNC-14/23: source-only derived exports do not block incoming records or another healthy project/key.
test('upload preparation runs only for selected uploads and isolates an unavailable derived-history key',async t=>{
 const f=fixture(t),a=f.withStore(0,store=>store.create({project_id:'project',title:'waiting archive'})),b=f.withStore(0,store=>store.create({project_id:'project',title:'healthy archive'}));let preparations=0,maintenance=0,waiting=true;
 const key=JSON.stringify(['project','document',a.id]);
 const registration:SyncRegistration={selection,title:'derived exports',refresh:async()=>{},prepare:async()=>{},withReplica:run=>f.withReplica(0,replica=>run({...replica,maintain(){maintenance++;}})),prepareUploads:async()=>{preparations++;return waiting?[{key,error:new Error('SDK history still active')}]:[];}};
 const client=new PersonalSync({home:f.homes[0],spaceId:f.space.spaceId,endpoint:'http://127.0.0.1:8788',fetch:f.transport,authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'},registrations:[registration]});t.after(()=>client.close());
 await client.run();assert.equal(preparations,0,'an unselected owner does not export histories or initialize a Runtime');assert.equal(maintenance,0,'unselected owners do not collect files');
 await client.save({...client.policy(),selections:[selection]});await client.run();assert.ok(preparations>0);assert.ok(maintenance>0,'selected owners run bounded cleanup after processing uploads');assert.match(client.status().error!,/SDK history still active/);await f.clients[1].run();
 assert.equal(f.withStore(1,store=>store.get(b.id).title),'healthy archive');assert.equal(f.withStore(1,store=>store.list('project').some(page=>page.id===a.id)),false);assert.ok(f.withReplica(0,replica=>replica.counts().pending)>0);
 waiting=false;await client.run();await f.clients[1].run();assert.equal(f.withStore(1,store=>store.get(a.id).title),'waiting archive');
});
