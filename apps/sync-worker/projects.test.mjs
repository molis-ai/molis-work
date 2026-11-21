import {createStaticPersonalSync as createPersonalSync} from '../../tests/fixtures/static-personal-sync.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {withMolisWorkProjectCatalog,openMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {ProjectDeletionService,createPersonalSync as createRealPersonalSync,createWebCatalogAccess} from '@molis-ai/molis-work-app-local-host';
import {PersonalSync,syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import {openTestSqlite} from '@molis-ai/molis-work-test-kit/sqlite';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-20/15 Projects use actual Host/Rust/D1 with independent paths and inactive portable plugin requirements',async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'project-catalog-cloud-'));
  const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(home=>ensureStorageSpace(home,space));
  const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(()=>{rmSync(root,{recursive:true,force:true});for(const [key,v] of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]])if(v===undefined)delete process.env[key];else process.env[key]=v;});
  const apiRequests=[];t.mock.method(globalThis,'fetch',(url,options)=>{apiRequests.push(new URL(String(url)).pathname);return cloud.transport(url,options);});
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async c=>{const p=await c.createProject({display_name:'云端项目资料',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});return p;});
  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
  const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));t.after(()=>clients.forEach(c=>c.close()));
  const [a,b]=clients,selection=a.status().collections.find(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1').selection,namespace=syncNamespace(selection);
  assert.deepEqual(a.policy().selections,[]);await a.run();await b.run();
  await clients[1].withCatalog({homeDirectory:homes[1]},c=>assert.equal(c.listProjects().length,0,'discovery and idle rounds do not silently select or download Projects'));
  await a.save({...a.policy(),selections:[selection]});await a.run();await b.run();for(const c of clients)assert.equal(c.status().error,null);
  const target=await clients[1].withCatalog({homeDirectory:homes[1]},c=>{
    const p=c.getProject(project.project_id);
    assert.equal(p.display_name,'云端项目资料');
    assert.notEqual(p.database_path,project.database_path);
    assert.ok(p.database_path.startsWith(realpathSync(homes[1])));
    assert.deepEqual(c.listProjectPlugins(p.project_id),['schedule']);
    assert.ok(c.projectPluginRequirements(p.project_id).some(p=>p.plugin_id==='feed'&&p.installed&&!p.active));
    return p;
  });
  assert.equal(b.status().collections.find(c=>syncNamespace(c.selection)===namespace).pending,0);
  await clients[1].withCatalog({homeDirectory:homes[1]},c=>c.renameProject(target.project_id,'目标新名称','alice','云端项目资料'));await b.run();await a.run();
  await clients[0].withCatalog({homeDirectory:homes[0]},c=>assert.equal(c.getProject(project.project_id).display_name,'目标新名称'));
  await clients[0].withCatalog({homeDirectory:homes[0]},c=>c.renameProject(project.project_id,'源并发编辑','alice','目标新名称'));
  await clients[1].withCatalog({homeDirectory:homes[1]},c=>c.renameProject(project.project_id,'目标独有编辑','alice','目标新名称'));await a.run();await b.run();
  const conflict=b.inspectConflict(namespace,project.project_id);assert.equal(conflict.local.project.title,'目标独有编辑');assert.equal(conflict.remote.project.title,'源并发编辑');
  await b.resolve(namespace,project.project_id,'remote',conflict.revision,conflict.state);
  await clients[1].withCatalog({homeDirectory:homes[1]},c=>{
    assert.equal(c.getProject(project.project_id).display_name,'源并发编辑');
    assert.deepEqual(c.listProjectPlugins(project.project_id),['schedule']);
  });
  const history=await b.history.keys(namespace);assert.ok(history.items.some(i=>i.key===project.project_id),'losing project facts use the same protected retained cloud history');
  const events=await cloud.db.prepare('SELECT value FROM sync_events').all();assert.doesNotMatch(JSON.stringify(events),/database_path|canonical_path|project-catalog-cloud-/);
  const count=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await a.run();await b.run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,count,'receipt and passive metadata apply do not echo');
  const calls=apiRequests.length,authCalls=cloud.requests.length;await a.run();
  assert.deepEqual(apiRequests.slice(calls),['/v1/round'],'actual Host with settled Projects uses one authenticated idle request');
  assert.equal(cloud.requests.length,authCalls+1,'summary still validates the actual upstream Auth response');
});

test('PCSYNC-OPT-14 a personal project without Goals syncs, restores, and recycles cleanly through actual Host and Rust/D1',async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'project-no-goals-'));
  const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(n=>join(root,n));homes.forEach(home=>ensureStorageSpace(home,space));
  const previous={origin:process.env.MOLIS_WORK_SYNC_ORIGIN,local:process.env.MOLIS_WORK_SYNC_LOCAL};process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(()=>{rmSync(root,{recursive:true,force:true});for(const [key,v] of [['MOLIS_WORK_SYNC_ORIGIN',previous.origin],['MOLIS_WORK_SYNC_LOCAL',previous.local]])if(v===undefined)delete process.env[key];else process.env[key]=v;});
  t.mock.method(globalThis,'fetch',(url,options)=>cloud.transport(url,options));
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},c=>c.createProject({display_name:'无目标集合同步项目',actor_id:'alice'}));
  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
  const pair=await Promise.all(homes.map(async home=>{
    const access=createWebCatalogAccess(home,openMolisWorkProjectCatalog);
    await access.warm();
    const deletion=new ProjectDeletionService(access.withCatalog,{isPanelAlive:()=>false,isProjectBusy:()=>false,async releaseProject(){}});
    const sync=await createRealPersonalSync(home,space,lease,access.withCatalog,check,undefined,deletion,access.read);
    return {home,access,deletion,sync};
  }));
  t.after(async()=>{for(const item of pair){item.sync.close();await item.access.close();}});
  const [a,b]=pair,projectsSelection=a.sync.status().collections.find(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1').selection;
  // Sync with zero Goals collection registered or selected
  assert.equal(a.sync.status().collections.some(c=>c.selection.collection_id==='project_goals'),false,'Goals collection is not hardcoded into Host registration');
  await a.sync.save({...a.sync.policy(),selections:[projectsSelection]});await a.sync.run();await b.sync.run();
  for(const item of pair)assert.equal(item.sync.status().error,null);
  await b.access.withCatalog({homeDirectory:b.home},c=>{
    const synced=c.getProject(project.project_id);
    assert.equal(synced.display_name,'无目标集合同步项目');
  });
  // Recycle on A, propagate to B, then restore on B and propagate back to A
  const obsA=await a.access.withCatalog({homeDirectory:a.home},c=>c.recycle.inspect(project.project_id));
  await a.deletion.changeRecycled(a.home,{project_id:project.project_id,recycled:true,confirmed:true,actor_id:'alice',operation_id:'opt14-recycle',expected_state:obsA.state},check);
  await a.sync.run();await b.sync.run();
  for(const item of pair)assert.equal(item.sync.status().error,null);
  await b.access.withCatalog({homeDirectory:b.home},c=>assert.equal(c.recycle.isRecycled(project.project_id),true));
  const obsB=await b.access.withCatalog({homeDirectory:b.home},c=>c.recycle.inspect(project.project_id));
  await b.deletion.changeRecycled(b.home,{project_id:project.project_id,recycled:false,confirmed:true,actor_id:'alice',operation_id:'opt14-restore',expected_state:obsB.state},check);
  await b.sync.run();await a.sync.run();
  for(const item of pair)assert.equal(item.sync.status().error,null);
  await a.access.withCatalog({homeDirectory:a.home},c=>assert.equal(c.recycle.isRecycled(project.project_id),false));
});

test('PCSYNC-OPT-16 expired project cascades cloud child heads and R2 attachments and local final cleanup enforces owner/runtime guards',async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'project-cascade-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(root,space);
  const projectSelection={plugin_id:'io.molis.work.module.projects.v1',publisher_id:'molis',publisher_signature:'official-project-catalog-binding',collection_id:'projects',schema_version:1};
  const childSelection={plugin_id:'io.example.plugin',publisher_id:'example',publisher_signature:'synthetic',collection_id:'docs',schema_version:1};
  const projectNs=syncNamespace(projectSelection),childNs=syncNamespace(childSelection);
  assert.equal((await cloud.call('/v1/policy','alice',{spaceId:cloud.space('alice'),revision:0,selections:[projectSelection,childSelection]},'PUT')).status,200);
  // Upload child R2 blob + child record + project record
  const raw=Buffer.from('project-owned-attachment-bytes'),digest=createHash('sha256').update(raw).digest('hex'),ref={digest,size:raw.length};
  assert.equal((await cloud.call('/v1/blobs/reserve','alice',{namespace:childNs,...ref})).status,200);
  assert.equal((await cloud.transport('https://sync.example.test/v1/blobs/chunk?'+new URLSearchParams({namespace:childNs,digest,part:'0'}),{method:'PUT',headers:{Authorization:'Bearer alice'},body:raw})).status,200);
  assert.equal((await cloud.call('/v1/blobs/complete','alice',{namespace:childNs,digest})).status,200);
  const projCreate=await(await cloud.call('/v1/changes','alice',{namespace:projectNs,policyRevision:1,mutation:{operationId:'p1',key:'proj-exp',base:0,value:{title:'Expiring'}},attachments:[]})).json();
  const childKey=JSON.stringify(['proj-exp','doc-1']);
  const childCreate=await(await cloud.call('/v1/changes','alice',{namespace:childNs,policyRevision:1,mutation:{operationId:'c1',key:childKey,base:0,value:{title:'Child doc'},},attachments:[ref]})).json();
  assert.ok(childCreate.revision>0);
  // Soft-delete project head and age past 30 days + blob age > 24h
  assert.equal((await cloud.call('/v1/changes','alice',{namespace:projectNs,policyRevision:1,mutation:{operationId:'p-del',key:'proj-exp',base:projCreate.revision,value:null},attachments:[]})).status,200);
  await cloud.db.prepare('UPDATE sync_heads SET deleted_at=unixepoch()*1000-? WHERE deleted_at IS NOT NULL').bind(31*86400000).run();
  await cloud.db.prepare('UPDATE sync_blobs SET created_at=unixepoch()*1000-172800000').run();
  assert.equal((await cloud.call('/v1/maintenance','alice',{})).status,200);
  assert.equal((await(await cloud.call('/v1/quota')).json()).usedBytes,0,'cascading project expiry releases child text and R2 bytes to 0');
  assert.equal((await cloud.bucket.list()).objects.length,0,'child R2 attachment is reclaimed after project cascade');
  const reviveChild=await cloud.call('/v1/changes','alice',{namespace:childNs,policyRevision:1,mutation:{operationId:'revive-c1',key:childKey,base:childCreate.revision,value:{title:'Offline revive'}},attachments:[]});
  assert.equal(reviveChild.status,409,'cascaded child tombstone prevents offline resurrection');
  // Local ProjectDeletionService.finalizeExpiredPersonalProject guards
  const project=await withMolisWorkProjectCatalog({homeDirectory:root},c=>c.createProject({display_name:'待清理个人项目',actor_id:'alice'}));
  let busy=false,unsettled=true;
  const deletion=new ProjectDeletionService(withMolisWorkProjectCatalog,{isPanelAlive:()=>false,isProjectBusy:()=>busy,async releaseProject(){}});
  const obs=await withMolisWorkProjectCatalog({homeDirectory:root},c=>c.recycle.inspect(project.project_id));
  await deletion.changeRecycled(root,{project_id:project.project_id,recycled:true,confirmed:true,actor_id:'alice',operation_id:'opt16-rec',expected_state:obs.state},()=>{});
  await assert.rejects(()=>deletion.finalizeExpiredPersonalProject(root,{project_id:project.project_id,actor_id:'alice',idempotency_key:'opt16-fin',server_purged_at:0},{authorize(){},assertChildrenSettled(){}}),/凭据/);
  await assert.rejects(()=>deletion.finalizeExpiredPersonalProject(root,{project_id:project.project_id,actor_id:'alice',idempotency_key:'opt16-fin',server_purged_at:Date.now()},{authorize(){},assertChildrenSettled(){if(unsettled)throw new Error('UNSETTLED_CHILD');}}),/UNSETTLED_CHILD/);
  unsettled=false;busy=true;
  await assert.rejects(()=>deletion.finalizeExpiredPersonalProject(root,{project_id:project.project_id,actor_id:'alice',idempotency_key:'opt16-fin',server_purged_at:Date.now()},{authorize(){},assertChildrenSettled(){}}),/运行或排队/);
  busy=false;
  // Late child-settlement failure inside transaction must leave the project recycled without restoring it.
  let failOnSecondCheck=0;
  await assert.rejects(()=>deletion.finalizeExpiredPersonalProject(root,{project_id:project.project_id,actor_id:'alice',idempotency_key:'opt16-fin-late',server_purged_at:Date.now()},{
    authorize(){},
    assertChildrenSettled(){
      failOnSecondCheck++;
      if(failOnSecondCheck>=4)throw new Error('LATE_UNSETTLED_CHILD');
    },
  }),/LATE_UNSETTLED_CHILD/);
  await withMolisWorkProjectCatalog({homeDirectory:root},c=>{
    assert.equal(c.recycle.isRecycled(project.project_id),true,'aborted finalization never resurrects recycled project');
    assert.equal(c.listProjects().some(p=>p.project_id===project.project_id),false,'aborted finalization never makes recycled project visible');
  });
  const finalized=await deletion.finalizeExpiredPersonalProject(root,{project_id:project.project_id,actor_id:'alice',idempotency_key:'opt16-fin',server_purged_at:Date.now()},{authorize(){},assertChildrenSettled(){}});
  assert.equal(finalized.deletion.project_id,project.project_id);
  await withMolisWorkProjectCatalog({homeDirectory:root},c=>assert.equal(c.listProjects().some(p=>p.project_id===project.project_id),false));
  const catalogDb=openTestSqlite(join(root,'projects','catalog.db'));
  try{
    const restoredEvents=catalogDb.prepare("SELECT COUNT(*) AS n FROM project_events WHERE project_id=? AND type='project.restored'").get(project.project_id);
    assert.equal(restoredEvents.n,0,'finalizeExpiredPersonalProject must delete directly without emitting project.restored');
  }finally{catalogDb.close();}
});

test('PCSYNC-OPT-16 cascading expired project cleanup never regresses /v1/round namespace revision or locks out syncing remaining projects',async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'project-round-noregress-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  ensureStorageSpace(root,space);
  const projectSelection={plugin_id:'io.molis.work.module.projects.v1',publisher_id:'molis',publisher_signature:'official-project-catalog-binding',collection_id:'projects',schema_version:1};
  const childSelection={plugin_id:'io.example.plugin',publisher_id:'example',publisher_signature:'synthetic',collection_id:'docs',schema_version:1};
  const projectNs=syncNamespace(projectSelection),childNs=syncNamespace(childSelection);
  assert.equal((await cloud.call('/v1/policy','alice',{spaceId:cloud.space('alice'),revision:0,selections:[projectSelection,childSelection]},'PUT')).status,200);
  // Seed two projects A and B; project B holds the highest child revision in childNs.
  const projA=await(await cloud.call('/v1/changes','alice',{namespace:projectNs,policyRevision:1,mutation:{operationId:'pa1',key:'proj-a',base:0,value:{title:'Project A'}},attachments:[]})).json();
  const projB=await(await cloud.call('/v1/changes','alice',{namespace:projectNs,policyRevision:1,mutation:{operationId:'pb1',key:'proj-b',base:0,value:{title:'Project B'}},attachments:[]})).json();
  const childA=await(await cloud.call('/v1/changes','alice',{namespace:childNs,policyRevision:1,mutation:{operationId:'ca1',key:JSON.stringify(['proj-a','doc-1']),base:0,value:{title:'Doc A1'}},attachments:[]})).json();
  const childB=await(await cloud.call('/v1/changes','alice',{namespace:childNs,policyRevision:1,mutation:{operationId:'cb1',key:JSON.stringify(['proj-b','doc-1']),base:0,value:{title:'Doc B1'}},attachments:[]})).json();
  assert.ok(childB.revision>childA.revision,'project B holds the highest child revision');
  const receivedProjects=new Map(),receivedChildren=new Map();
  let projectCursor=0,childCursor=0;
  const makeReplica=(store,getCursor,setCursor)=>({
    cursor:getCursor,next:()=>null,acknowledge(){},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){},
    receive(event){store.set(event.key,event.value);setCursor(Math.max(getCursor(),event.revision));},
  });
  const client=new PersonalSync({
    home:root,spaceId:space.spaceId,endpoint:'https://sync.example.test',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'alice';}},
    fetch:cloud.transport,
    registrations:[
      {selection:projectSelection,title:'Projects',async refresh(){},async prepare(){},withReplica:run=>run(makeReplica(receivedProjects,()=>projectCursor,v=>{projectCursor=v;}))},
      {selection:childSelection,title:'Docs',async refresh(){},async prepare(){},withReplica:run=>run(makeReplica(receivedChildren,()=>childCursor,v=>{childCursor=v;}))},
    ],
  });
  t.after(()=>client.close());
  await client.run();
  assert.equal(client.status().error,null);
  assert.equal(childCursor,childB.revision);
  // Soft-delete project B, age past 30 days, and run cascading maintenance that removes B's child sync_events.
  assert.equal((await cloud.call('/v1/changes','alice',{namespace:projectNs,policyRevision:1,mutation:{operationId:'pb-del',key:'proj-b',base:projB.revision,value:null},attachments:[]})).status,200);
  await cloud.db.prepare("UPDATE sync_heads SET deleted_at=unixepoch()*1000-? WHERE key='proj-b'").bind(31*86400000).run();
  assert.equal((await cloud.call('/v1/maintenance','alice',{})).status,200);
  const remainingMaxEvent=await cloud.db.prepare('SELECT MAX(revision) AS rev FROM sync_events WHERE space=? AND namespace=?').bind(cloud.space('alice'),childNs).first();
  assert.equal(remainingMaxEvent.rev,childA.revision,'project B child event was pruned from sync_events');
  // Client sync immediately after cascade must NOT report version regression.
  await client.run();
  assert.equal(client.status().error,null,'/v1/round must retain sync_heads high-water revision after cascade');
  // Project A receives a new change and syncs cleanly without lock-out.
  const childA2=await(await cloud.call('/v1/changes','alice',{namespace:childNs,policyRevision:1,mutation:{operationId:'ca2',key:JSON.stringify(['proj-a','doc-1']),base:childA.revision,value:{title:'Doc A2 updated'}},attachments:[]})).json();
  assert.ok(childA2.revision>childB.revision);
  assert.ok(projA.revision>0);
  await client.run();
  assert.equal(client.status().error,null);
  assert.deepEqual(receivedChildren.get(JSON.stringify(['proj-a','doc-1'])),{title:'Doc A2 updated'});
});
