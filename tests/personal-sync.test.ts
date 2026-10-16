import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath} from '@molis-ai/molis-work-storage';
import {openPagesStore} from '@molis-ai/molis-work-plugin-pages';
import {PersonalSync,syncNamespace,type SyncRegistration} from '../modules/sync-replication/src/index.js';
import type {SyncEvent,SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {availableProjectPluginIds} from '@molis-ai/molis-work-app-workbench';
import {createPersonalSync} from '../apps/local-host/src/personal-sync.js';
import {artifactSyncSelection,createPersonalArtifactRegistration} from '../apps/local-host/src/personal-artifact-sync.js';
import {LocalProjectDatabase} from '../apps/local-host/src/project-database.js';
import {ArtifactsModule} from '@molis-ai/molis-work-module-artifacts';
import {openFormStore,formManifest} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore,datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore,pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore,lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {openWorkflowsStore,workflowsManifest,newStation,manualLink} from '@molis-ai/molis-work-plugin-workflows';
import {openJellyStore,jellyManifest} from '@molis-ai/molis-work-plugin-jelly';
import {openTodoStore,todoManifest} from '@molis-ai/molis-work-plugin-todo';
import {scheduleManifest} from '@molis-ai/molis-work-plugin-schedule';
import {feedManifest,FeedOutRuleStore} from '@molis-ai/molis-work-plugin-feed';
import {charactersManifest} from '@molis-ai/molis-work-plugin-characters';
import {openCharacters} from '@molis-ai/molis-work-module-characters';
import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';

const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
const body=(text:string)=>({type:'doc' as const,content:[{type:'paragraph',content:[{type:'text',text}]}]});

test('Host exposes and transfers all registered creative collections through the shared coordinator',{timeout:60000},async t=>{
  const f=fixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{
    const p=await c.createProject({display_name:'多插件项目',actor_id:'alice'});
    for(const plugin_id of ['form','dataset','ppt','lingguang','workflows','schedule','feed'])c.addProjectPlugin({project_id:p.project_id,plugin_id,actor_id:'alice'});return p;
  });
  const factories=[openFormStore,openDatasetStore,openPptStore,openLingguangStore];
  const ids=factories.map(open=>{const s=open(f.homes[0]);try{return s.create({project_id:project.project_id,title:'跨设备业务内容'}).id;}finally{s.close();}});
  const workflow=(()=>{const s=openWorkflowsStore(f.homes[0]);try{
    const flow=s.create({project_id:project.project_id,title:'跨设备流程',chain:{stations:[newStation('pages'),newStation('inbox')],links:[manualLink()]}});
    return {id:flow.workflow_id,instance:s.startInstance(flow,{plugin:'pages',item_id:'source',title:'资料'}).instance_id};
  }finally{s.close();}})();
  const jelly=(()=>{const s=openJellyStore(f.homes[0]);try{return s.execute({type:'note.create',title:'跨设备笔记',markdown:'同步内容'}).notes[0]!.id;}finally{s.close();}})();
  const todo=(()=>{const s=openTodoStore(f.homes[0]);try{return s.create({title:'跨设备待办'},{projectId:null,everything:true,actor:'user',actorId:'alice'}).item.id;}finally{s.close();}})();
  const character=(()=>{const s=openCharacters(f.homes[0],LOCAL_PERSON_ACTOR_ID);try{
    const draft=s.service.create();return s.service.update(draft.character_id,draft.revision,{title:'跨设备角色',instructions:'核对事实',host_tools:null}).character_id;
  }finally{s.close();}})();
  const scheduleStore=new LocalProjectDatabase(project.database_path);
  let feedRuleId='';
  try{
    scheduleStore.db.prepare(`INSERT INTO schedule_conversation_tasks (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('sync-task','跨设备提醒','检查进展',9,0,1,1,0,0,'origin-job',null,null,'2026-10-14T00:00:00.000Z','2026-10-14T00:00:00.000Z');
    feedRuleId=new FeedOutRuleStore(scheduleStore.db).create(project.project_id,{name:'跨设备捕捉',match:{contains:'发布'},enabled:true}).rule_id;
  }finally{scheduleStore.close();}
  const check=()=>{};const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=(await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check))!,b=(await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check))!;t.after(()=>{a.close();b.close();});
  const selections=[formManifest,datasetManifest,pptManifest,lingguangManifest,workflowsManifest,jellyManifest,todoManifest,scheduleManifest,charactersManifest,feedManifest].map(m=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:m.sync!.collections[0]!.id,schema_version:1}));
  assert.equal(a.status().collections.length,14);assert.equal(a.policy().selections.length,0,'new collections are opt-in');
  await a.save({...a.policy(),selections});assert.equal(a.status().error,null);await b.run();assert.equal(b.status().error,null);
  factories.forEach((open,i)=>{const s=open(f.homes[1]);try{assert.equal(s.get(ids[i]!,project.project_id).title,'跨设备业务内容');}finally{s.close();}});
  const received=openWorkflowsStore(f.homes[1]);try{
    assert.equal(received.get(workflow.id,project.project_id).title,'跨设备流程');
    assert.equal(received.instance(workflow.instance,project.project_id).title,'资料');
    assert.throws(()=>received.assertExecutableInstance(workflow.instance),/仅可查看/);
  }finally{received.close();}
  const receivedJelly=openJellyStore(f.homes[1]);try{
    assert.equal(receivedJelly.read().notes.find(note=>note.id===jelly)?.title,'跨设备笔记');
  }finally{receivedJelly.close();}
  const receivedTodo=openTodoStore(f.homes[1]);try{
    assert.equal(receivedTodo.get(todo,{projectId:null,everything:true,actor:'user',actorId:'alice'}).title,'跨设备待办');
  }finally{receivedTodo.close();}
  const receivedCharacter=openCharacters(f.homes[1],LOCAL_PERSON_ACTOR_ID);try{
    assert.equal(receivedCharacter.service.get(character)?.title,'跨设备角色');
  }finally{receivedCharacter.close();}
  const target=await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.listProjects().find(p=>p.project_id===project.project_id)!);
  const receivedSchedule=new LocalProjectDatabase(target.database_path);try{
    const task=receivedSchedule.db.prepare('SELECT enabled,job_id,title FROM schedule_conversation_tasks WHERE task_id=?').get('sync-task') as {enabled:number;job_id:string|null;title:string};
    assert.equal(task.title,'跨设备提醒');assert.equal(task.enabled,0);assert.equal(task.job_id,null);
    const rule=new FeedOutRuleStore(receivedSchedule.db).get(project.project_id,feedRuleId);
    assert.equal(rule.name,'跨设备捕捉');assert.equal(rule.enabled,false,'received capture rules cannot run before local opt-in');
  }finally{receivedSchedule.close();}
  const before=f.events.length;await a.run();await b.run();assert.equal(f.events.length,before,'no replication echo');
});
function fixture(t:any){
  const root=mkdtempSync(join(tmpdir(),'personal-sync-'));
  const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(h=>ensureStorageSpace(h,space));
  let active=true;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const context={authorize,project:()=>({title:'文档项目',context:{spaceId:space.spaceId,projectId:'project',authorize,hasReference:()=>true}})};
  const withStore=<T>(i:number,run:(store:ReturnType<typeof openPagesStore>)=>T)=>{const store=openPagesStore(homes[i]);try{return run(store);}finally{store.close();}};
  const withReplica=<T>(i:number,run:(r:ReturnType<ReturnType<typeof openPagesStore>['replica']>)=>T)=>withStore(i,s=>run(s.replica(context)));
  const registrations=homes.map((_,i):SyncRegistration=>({selection,title:'文档与文件夹',refresh:async()=>{},prepare:async()=>{},withReplica:run=>withReplica(i,run)}));
  const events:SyncEvent[]=[];const namespaces=new WeakMap<SyncEvent,string>();let revision=0,online=true,drop=false;
  let beforeDownload:()=>void=()=>{};
  let policy={spaceId:space.spaceId,revision:0,selections:[] as typeof selection[]};
  const transport:typeof fetch=async(input,init)=>{
    if(!online)throw new Error('OFFLINE');
    const url=new URL(String(input));const payload=init?.body?JSON.parse(String(init.body)):null;
    if(url.pathname==='/v1/policy'){
      if(init?.method==='PUT'){
        if(payload.revision!==policy.revision)return Response.json({error:'CONFLICT'},{status:409});
        policy={...payload,revision:policy.revision+1};
      }return Response.json(policy);
    }
    if(init?.method==='POST'){
      const m=payload.mutation as SyncMutation;
      const previous=events.find(e=>namespaces.get(e)===payload.namespace&&e.operationId===m.operationId);
      if(!previous){
        const head=events.filter(e=>namespaces.get(e)===payload.namespace&&e.key===m.key).at(-1)?.revision??0;
        if(head!==m.base)return Response.json({error:'CONFLICT'},{status:409});
        assert.ok(policy.selections.some(s=>syncNamespace(s)===payload.namespace));const event={...m,revision:++revision};events.push(event);namespaces.set(event,payload.namespace);
      }
      if(drop){drop=false;throw new Error('RECEIPT_LOST');}
      return Response.json({accepted:true});
    }
    const rows=events.filter(e=>namespaces.get(e)===url.searchParams.get('namespace')&&e.revision>Number(url.searchParams.get('after')));
    beforeDownload();
    return Response.json({events:rows.slice(0,2),more:rows.length>2});
  };
  const controller=new AbortController();
  const clients=homes.map((home,i)=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority:{signal:controller.signal,assertCurrent:authorize,accessToken:async()=>{authorize();return 'synthetic-only';}},registrations:[registrations[i]],fetch:transport}));
  const enable=async()=>{await clients[0].save({spaceId:space.spaceId,revision:policy.revision,selections:[selection]});await clients[0].run();};
  t.after(()=>{clients.forEach(c=>c.close());rmSync(root,{recursive:true,force:true});});
  return {space,homes,clients,events,withStore,withReplica,enable,transport,beforeDownload:(run:()=>void)=>beforeDownload=run,offline:()=>online=false,online:()=>online=true,drop:()=>drop=true,revoke:()=>{active=false;controller.abort();}};
}

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
  const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check);
  const b=await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check);
  assert.ok(a&&b);t.after(()=>{a.close();b.close();});
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});assert.equal(a.status().error,null);
  await b.run();assert.equal(b.status().error,null);
  assert.equal(f.withStore(1,s=>s.get(page.id).title),'完整正文');
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},catalog=>{
    assert.equal(catalog.listProjects().find(p=>p.project_id===project.project_id)?.display_name,reserved?'个人空间':'跨设备项目');
    assert.ok(availableProjectPluginIds(catalog.listProjectPlugins(project.project_id)).has('pages'));
  });
  active=false;await b.run();assert.throws(()=>b.status(),/REVOKED/);
});

test('Host sync: delayed fixed Artifact versions restore a waiting document without manual resolution',{timeout:60000},async t=>{
  const f=fixture(t);const previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});
  t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{
    const p=await c.createProject({display_name:'关联测试',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'artifacts',actor_id:'alice'});return p;
  });
  const store=new LocalProjectDatabase(project.database_path);
  try{
    const owner=new ArtifactsModule({db:store.db,appendEvent:e=>store.appendEvent(e)});
    for(const version of [1,2])owner.commands.registerVersion({project_id:project.project_id,artifact_id:'linked-artifact',version,actor_id:'alice',artifact_type_id:'io.molis.work.document',schema_version:1,origin:{kind:'imported',file_name:'report.json'},title:'Report',media_type:'application/json',producer:{plugin_id:'io.molis.work.pages',plugin_version:'1.0.0',binding_signature:'official-pages-binding'},content:{kind:'inline',payload:{title:'固定成果',version,text:'完整正文'}}});
    owner.commands.archiveVersion({project_id:project.project_id,artifact_id:'linked-artifact',version:1,actor_id:'alice'});
  }finally{store.close();}
  const page=f.withStore(0,s=>{const p=s.create({project_id:project.project_id,title:'有成果的文档',body:body('完整正文')});return s.update(p.id,{artifact_id:'linked-artifact',artifact_version:1});});
  const check=()=>{};const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=(await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check))!;
  const b=(await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check))!;t.after(()=>{a.close();b.close();});
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});await b.run();assert.equal(b.status().error,null);
  const waiting=b.status().collections.find(c=>c.selection.plugin_id===selection.plugin_id)!.conflicts;
  assert.equal(waiting.length,1);assert.equal(waiting[0].waiting,true);assert.match(waiting[0].reason,/成果/);
  assert.equal(f.withStore(1,s=>s.list(project.project_id).length),0);
  await assert.rejects(()=>b.resolve(syncNamespace(selection),waiting[0].key,'local'),/尚未到达/);
  // The project was created by Pages first: explicit user activation on this device is retained.
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.addProjectPlugin({project_id:project.project_id,plugin_id:'artifacts',actor_id:'alice'}));
  await a.save({...a.policy(),selections:[selection,artifactSyncSelection]});assert.equal(a.status().error,null);
  await b.run();assert.equal(b.status().error,null);
  const restored=f.withStore(1,s=>s.get(page.id));assert.equal(restored.artifact_id,'linked-artifact');assert.equal(restored.artifact_version,1);assert.deepEqual(restored.body,body('完整正文'));
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>{
    const p=c.listProjects().find(p=>p.project_id===project.project_id)!;const db=new LocalProjectDatabase(p.database_path);
    try{const owner=new ArtifactsModule({db:db.db,appendEvent:e=>db.appendEvent(e)});assert.equal(owner.query.listArtifactVersions(p.project_id,'linked-artifact').length,2);assert.equal(owner.query.getArtifactVersion(p.project_id,{artifact_id:'linked-artifact',version:1})!.lifecycle_state,'archived');}finally{db.close();}
  });
  assert.ok(b.status().collections.every(c=>c.conflicts.length===0&&c.pending===0));
  const n=f.events.length;await b.run();await a.run();assert.equal(f.events.length,n,'receipt/apply must not create a replication echo');
});

test('logout during a download cannot apply a late response or advance its cursor',async t=>{
  const f=fixture(t);const page=f.withStore(0,s=>s.create({project_id:'project',title:'late'}));await f.enable();
  f.beforeDownload(f.revoke);await f.clients[1].run();
  assert.equal(f.withStore(1,s=>s.list('project').some(p=>p.id===page.id)),false);
  const db=new DatabaseSync(homeSqlitePath(f.homes[1],'pages'));
  try{assert.equal(db.prepare('SELECT cursor FROM replica_state WHERE id=1').get()!.cursor,0);}finally{db.close();}
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
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],f.space.spaceId,'bob',()=>{},withMolisWorkProjectCatalog),/OWNERSHIP/);
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],'foreign-space','alice',()=>{},withMolisWorkProjectCatalog),/OWNERSHIP/);
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
  await f.clients[1].resolve(syncNamespace(selection),conflict.key,'local');await f.clients[1].run();await f.clients[0].run();
  assert.equal(f.withStore(0,s=>s.get(page.id).title),'B');
  const db=new DatabaseSync(homeSqlitePath(f.homes[1],'pages'));try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n,1);}finally{db.close();}
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
  try{db.exec("BEGIN; INSERT INTO folders VALUES ('f','project','Temp','2026-09-30T00:00:00Z','2026-09-30T00:00:00Z'); ROLLBACK;");assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,0);}finally{db.close();}
});

test('D1 schema: atomic CAS, owner isolation, idempotency constraint, disabled policy',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync('cloud/sync/migrations/0001_sync.sql','utf8'));
    const ns=syncNamespace(selection);
    db.prepare('INSERT INTO sync_policy VALUES (?,1,?,?)').run('alice','{}',JSON.stringify([ns]));
    const insert=db.prepare('INSERT INTO sync_events(space,namespace,operation,key,base,value,policy_revision) VALUES (?,?,?,?,?,?,?)');
    insert.run('alice',ns,'one','doc',0,'{}',1);
    assert.throws(()=>insert.run('alice',ns,'two','doc',0,'{}',1),/SYNC_VERSION_CONFLICT/);
    assert.throws(()=>insert.run('bob',ns,'one','doc',0,'{}',1),/SYNC_POLICY_CONFLICT/);
    db.exec("UPDATE sync_policy SET revision=2,namespaces='[]'");
    assert.throws(()=>insert.run('alice',ns,'three','doc',1,'{}',1),/SYNC_POLICY_CONFLICT/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_events').get()!.n,1);
  }finally{db.close();}
});
