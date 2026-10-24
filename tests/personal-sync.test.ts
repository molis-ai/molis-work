import { syncRoundResponse } from './fixtures/sync-round.js';
import type {TestContext} from "node:test";
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath,openBaselineHomeSqlite,replicaSchemaSql,initializeReplica,namespacedReplicaDatabase,createSqliteReplica} from '@molis-ai/molis-work-storage';
import {openPagesStore} from '@molis-ai/molis-work-plugin-pages';
import {PersonalSync,syncNamespace,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import type {SyncEvent,SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {availableProjectPluginIds,BUILTIN_PLUGIN_CATALOG,builtinSyncBindings} from '@molis-ai/molis-work-app-workbench';
import {createPersonalSync,bindSavedHistory} from '@molis-ai/molis-work-app-local-host';
import type {PluginRegistration,ProjectSyncContentOwner} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import {artifactSyncSelection,createPersonalArtifactRegistration} from '@molis-ai/molis-work-app-local-host';
import {LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {ArtifactsModule,createArtifactReplication} from '@molis-ai/molis-work-module-artifacts';
import {openFormStore,formManifest} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore,datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore,pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore,lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {openWorkflowsStore,workflowsManifest,newStation,manualLink} from '@molis-ai/molis-work-plugin-workflows';
import {openJellyStore,jellyManifest} from '@molis-ai/molis-work-plugin-jelly';
import {openTodoStore,openTodoSyncStore,todoManifest} from '@molis-ai/molis-work-plugin-todo';
import {scheduleManifest} from '@molis-ai/molis-work-plugin-schedule';
import {feedManifest,FeedOutRuleStore} from '@molis-ai/molis-work-plugin-feed';
import {SourcesModule} from '@molis-ai/molis-work-module-sources';
import {charactersManifest} from '@molis-ai/molis-work-plugin-characters';
import {openCharacters} from '@molis-ai/molis-work-module-characters';
import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';

const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
const body=(text:string)=>({type:'doc' as const,content:[{type:'paragraph',content:[{type:'text',text}]}]});

test('plugin-owned sync hooks are discovered without Host names; preparation is selected, project-bound and revocable',async t=>{
 const f=fixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
 let installs=0,preparations=0,completed=0,reads=0,active=true,revokeOnRead=false;
 const check=()=>{if(!active)throw new Error('REVOKED');};
 const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{const p=await c.createProject({display_name:'Declared hooks',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'coding',actor_id:'alice'});return p;});
 // The fixture, like the product's versioned baseline, owns the technical ledger schema before hooks run.
 const baseline=new LocalProjectDatabase(project.database_path);try{baseline.db.exec(replicaSchemaSql('sync_fixture')+replicaSchemaSql('fixture_journal'));}finally{baseline.close();}
 const template=BUILTIN_PLUGIN_CATALOG.find(e=>e.project_plugin_id==='coding')!;
 const owner:Exclude<ProjectSyncContentOwner,string>={
  create:()=>({id:'fixture_content',assetKind:'fixture_content',tables:[{name:'sync_fixture_items',columns:['project_id','id'],keys:['project_id','id']}],journalTypes:[],receiptOperations:[],sequenceFields:[],validate(){}}),
  async prepareUpload(_db,context){preparations++;assert.equal(context.projectId,project.project_id);await context.readSavedHistory('fixture-session');completed++;},
 };
 const entry:PluginRegistration={...template,catalog_order:999,manifest:{...template.manifest,plugin_id:'io.molis.work.sync-fixture',databases:{project:{store_name:'sync-fixture',version:1,schema:'CREATE TABLE sync_fixture_items(project_id TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(project_id,id));',read_permission:'storage:private',write_permission:'storage:private'}},sync:{protocol_version:1,collections:[{id:'content',title:'Fixture',schema_version:1,requires:[]},{id:'journal',title:'Journal',schema_version:1,requires:[]}]}},sync:{
  content:{scope:'project-sections',kind:'fixture_content',namespace:'sync_fixture',owners:[owner]},
  journal:{scope:'project-database',kind:'fixture_journal',install(db){installs++;initializeReplica(namespacedReplicaDatabase(db,'fixture_journal'));},create(db,context){return createSqliteReplica(namespacedReplicaDatabase(db,'fixture_journal'),{authorize:context.authorize,read:()=>null,apply(){throw new Error('Unselected collection must not apply');}});}},
 }};
 const catalog=BUILTIN_PLUGIN_CATALOG as PluginRegistration[];catalog.push(entry);t.after(()=>{catalog.splice(catalog.indexOf(entry),1);});
 const db=new LocalProjectDatabase(project.database_path);db.close();assert.ok(installs>0,'journal installs on open, before the first sync');assert.equal(preparations,0);
 const before=installs,local=new LocalProjectDatabase(join(f.homes[0],'standalone.sqlite'));local.close();assert.equal(installs,before,'ordinary local databases do not install sync journals');
 t.after(bindSavedHistory(f.homes[0],{async read(id,identity,authorize){reads++;assert.equal(id,'fixture-session');assert.deepEqual(identity,{project_id:project.project_id,plugin_id:entry.manifest.plugin_id,actor_id:LOCAL_PERSON_ACTOR_ID});authorize();if(revokeOnRead)active=false;return '{}';}}));
 const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
 const sync=(await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check))!;t.after(()=>sync.close());
 sync.status();await sync.run();assert.equal(preparations,0,'discovery/status/unselected round do not read history');
 const selected=builtinSyncBindings().find(b=>b.entry===entry&&b.collection.id==='content')!.selection;
 await sync.save({...sync.policy(),selections:[selected]});await sync.run();assert.equal(sync.status().error,null);assert.ok(preparations>0);assert.equal(reads,preparations);
 const prepared=preparations;await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},c=>c.removeProjectPlugin({project_id:project.project_id,plugin_id:'coding',actor_id:'alice'}));await sync.run();assert.equal(preparations,prepared,'disabled project does not prepare an upload');
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},c=>c.addProjectPlugin({project_id:project.project_id,plugin_id:'coding',actor_id:'alice'}));
 const finished=completed;revokeOnRead=true;await sync.run();assert.ok(preparations>prepared);assert.equal(completed,finished,'revocation after awaited history read prevents the hook from continuing');assert.throws(()=>sync.status(),/REVOKED/);
});

test('declared content owners reject empty, unknown and duplicate identities before journal installation',async t=>{
 const f=fixture(t),project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},c=>c.createProject({display_name:'Owner refusal',actor_id:'alice'}));
 const entry=BUILTIN_PLUGIN_CATALOG.find(e=>e.project_plugin_id==='coding')!,binding=entry.sync!.sessions!;assert.equal(binding.scope,'project-sections');if(binding.scope!=='project-sections')return;
 const owners=binding.owners as ProjectSyncContentOwner[],original=[...owners];t.after(()=>owners.splice(0,owners.length,...original));
 for(const invalid of [[],['unknown-owner'],[original[0]!,original[0]!]]){owners.splice(0,owners.length,...invalid);assert.throws(()=>new LocalProjectDatabase(project.database_path),error=>error instanceof Error&&'code' in error&&error.code==='host.replica_project_invalid');}
});

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
    new SourcesModule(scheduleStore.db).commands.save({project_id:project.project_id,source_id:'portable-source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'跨设备来源',description:'只同步描述与历史',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'this-device-only-connection'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:null},connection_ref:'this-device-only-reference',account_label:'This device',last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:'2026-10-18T00:00:00.000Z',updated_at:'2026-10-18T00:00:00.000Z'});
  }finally{scheduleStore.close();}
  const check=()=>{};const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=(await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check))!,b=(await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check))!;t.after(()=>{a.close();b.close();});
  const selections=[formManifest,datasetManifest,pptManifest,lingguangManifest,workflowsManifest,jellyManifest,todoManifest,scheduleManifest,charactersManifest,feedManifest].flatMap(m=>m.sync!.collections.map(c=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:c.id,schema_version:c.schema_version})));
  assert.equal(a.status().collections.length,26);assert.ok(a.status().collections.some(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1'));assert.equal(a.policy().selections.length,0,'new collections are opt-in, including Projects, Work, Coding and Builder');
  await a.save({...a.policy(),selections});await a.run();assert.equal(a.status().error,null);await b.run();assert.equal(b.status().error,null);
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
    const source=new SourcesModule(receivedSchedule.db).query.get(project.project_id,'portable-source');assert.equal(source.name,'跨设备来源');assert.equal(source.enabled,false);assert.equal(source.connection_ref,null);assert.deepEqual(source.config,{});assert.deepEqual(source.schedule,{mode:'manual'});
  }finally{receivedSchedule.close();}
  const before=f.events.length;await a.run();await b.run();assert.equal(f.events.length,before,'no replication echo');
  assert.doesNotMatch(JSON.stringify(f.events),/this-device-only-connection|this-device-only-reference/,'source setup never enters the transport');
});
test('PERSAF-05 incoming content does not silently re-enable an explicitly removed plugin',async t=>{
  const f=fixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
  const p=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{const p=await c.createProject({display_name:'Explicit choice',actor_id:'alice'});c.addProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});return p;});
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async c=>{await c.ensureSyncedProject({project_id:p.project_id,display_name:p.display_name,actor_id:'alice'},()=>{});c.addProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});c.removeProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});});
  const store=new LocalProjectDatabase(p.database_path);let id:string;try{id=new FeedOutRuleStore(store.db).create(p.project_id,{name:'User choice is retained',match:{contains:'fact'},enabled:false}).rule_id;}finally{store.close();}
  const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=(await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check))!,b=(await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check))!;t.after(()=>{a.close();b.close();});
  const m=feedManifest;await a.save({...a.policy(),selections:[{plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:m.sync!.collections[0]!.id,schema_version:1}]});await a.run();await b.run();
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>{assert.equal(availableProjectPluginIds(c.listProjectPlugins(p.project_id)).has('feed'),false);c.addProjectPlugin({project_id:p.project_id,plugin_id:'feed',actor_id:'alice'});});
  await b.run();assert.equal(b.status().error,null);
  const target=await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.listProjects().find(row=>row.project_id===p.project_id)!);const received=new LocalProjectDatabase(target.database_path);try{assert.equal(new FeedOutRuleStore(received.db).get(p.project_id,id).name,'User choice is retained');}finally{received.close();}
});

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

function fixture(t:TestContext){
  const root=mkdtempSync(join(tmpdir(),'personal-sync-'));
  const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');
  const homes=['a','b'].map(name=>join(root,name));homes.forEach(h=>ensureStorageSpace(h,space));
  let active=true;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const context={authorize,conflictState:createSyncConflictState,project:()=>({title:'文档项目',context:{spaceId:space.spaceId,projectId:'project',authorize,hasReference:()=>true}})};
  const withStore=<T>(i:number,run:(store:ReturnType<typeof openPagesStore>)=>T)=>{const store=openPagesStore(homes[i]);try{return run(store);}finally{store.close();}};
  const withReplica=<T>(i:number,run:(r:ReturnType<ReturnType<typeof openPagesStore>['replica']>)=>T)=>withStore(i,s=>run(s.replica(context)));
  const registrations=homes.map((_,i):SyncRegistration=>({selection,title:'文档与文件夹',refresh:async()=>{},prepare:async()=>{},withReplica:run=>withReplica(i,run)}));
  const events:SyncEvent[]=[];const namespaces=new WeakMap<SyncEvent,string>();let revision=0,online=true,drop=false,usedBytes=0;
  const retained:Array<{namespace:string;mutation:SyncMutation;revision:number}>=[];
  let retentionHook:(route:string,payload:unknown)=>Promise<Response|undefined>=async()=>undefined;
  let beforeDownload:()=>void=()=>{};
  let afterQuotaSnapshot:()=>void=()=>{};
  let policy={spaceId:space.spaceId,revision:0,selections:[] as typeof selection[]};
  const transport:typeof fetch=async(input,init)=>{
    if(!online)throw new Error('OFFLINE');
    const url=new URL(String(input));const payload=init?.body?JSON.parse(String(init.body)):null;
    if(url.pathname==='/v1/round'){const snapshot=syncRoundResponse(policy,s=>events.filter(event=>namespaces.get(event)===syncNamespace(s)).at(-1)?.revision??0,usedBytes);afterQuotaSnapshot();return snapshot;}
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes});
    if(url.pathname==='/v1/policy'){
      if(init?.method==='PUT'){
        if(payload.revision!==policy.revision)return Response.json({error:'CONFLICT'},{status:409});
        policy={...payload,revision:policy.revision+1};
      }return Response.json(policy);
    }
    if(url.pathname==='/v1/history/pin'||url.pathname==='/v1/history/archive'){
      assert.equal(init?.method,'POST');const intercepted=await retentionHook(url.pathname,payload);if(intercepted)return intercepted;
      const key=payload.key??payload.mutation?.key,head=events.filter(e=>namespaces.get(e)===payload.namespace&&e.key===key).at(-1);
      if(!head||head.revision!==(payload.revision??payload.mutation?.base))return Response.json({error:'CONFLICT'},{status:409});
      assert.equal(payload.policyRevision,policy.revision);
      if(url.pathname==='/v1/history/pin')return Response.json({accepted:true,revision:head.revision});
      if(usedBytes>=100000000)return Response.json({error:'SYNC_QUOTA_EXCEEDED'},{status:413});
      const prior=retained.find(row=>row.namespace===payload.namespace&&row.mutation.operationId===payload.mutation.operationId);
      if(prior)assert.deepEqual(prior.mutation,payload.mutation);else retained.push({namespace:payload.namespace,mutation:payload.mutation,revision:++revision});
      return Response.json({accepted:true,revision:(prior??retained.at(-1))!.revision});
    }
    if(init?.method==='POST'){
      assert.equal(url.pathname,'/v1/changes');
      const m=payload.mutation as SyncMutation;
      if(m.value!==null&&usedBytes>=100000000)return Response.json({error:'SYNC_QUOTA_EXCEEDED'},{status:413});
      const previous=events.find(e=>namespaces.get(e)===payload.namespace&&e.operationId===m.operationId);
      if(!previous){
        const head=events.filter(e=>namespaces.get(e)===payload.namespace&&e.key===m.key).at(-1)?.revision??0;
        if(head!==m.base)return Response.json({error:'CONFLICT'},{status:409});
        assert.ok(policy.selections.some(s=>syncNamespace(s)===payload.namespace));const event={...m,revision:++revision};events.push(event);namespaces.set(event,payload.namespace);
      }
      if(drop){drop=false;throw new Error('RECEIPT_LOST');}
      return Response.json({accepted:true,revision:events.find(e=>namespaces.get(e)===payload.namespace&&e.operationId===m.operationId)!.revision});
    }
    const rows=events.filter(e=>namespaces.get(e)===url.searchParams.get('namespace')&&e.revision>Number(url.searchParams.get('after')));
    beforeDownload();
    return Response.json({events:rows.slice(0,2),more:rows.length>2});
  };
  const controller=new AbortController();
  const clients=homes.map((home,i)=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',authority:{signal:controller.signal,assertCurrent:authorize,accessToken:async()=>{authorize();return 'synthetic-only';}},registrations:[registrations[i]],fetch:transport}));
  const enable=async()=>{await clients[0].save({spaceId:space.spaceId,revision:policy.revision,selections:[selection]});await clients[0].run();};
  t.after(()=>{clients.forEach(c=>c.close());rmSync(root,{recursive:true,force:true});});
  return {space,homes,clients,events,retained,withStore,withReplica,enable,transport,onRetention:(hook:typeof retentionHook)=>retentionHook=hook,used:(bytes:number)=>usedBytes=bytes,beforeDownload:(run:()=>void)=>beforeDownload=run,afterQuotaSnapshot:(run:()=>void)=>afterQuotaSnapshot=run,offline:()=>online=false,online:()=>online=true,drop:()=>drop=true,revoke:()=>{active=false;controller.abort();}};
}

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
  const lease={userId:'alice',applicationId:'work',authOrigin:'http://127.0.0.1:8787',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
  const a=await createPersonalSync(f.homes[0],f.space,lease,withMolisWorkProjectCatalog,check);
  const b=await createPersonalSync(f.homes[1],f.space,lease,withMolisWorkProjectCatalog,check);
  assert.ok(a&&b);t.after(()=>{a.close();b.close();});
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});await a.run();assert.equal(a.status().error,null);
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
  await a.save({spaceId:f.space.spaceId,revision:0,selections:[selection]});await a.run();await b.run();assert.equal(b.status().error,null);
  const waiting=b.status().collections.find(c=>c.selection.plugin_id===selection.plugin_id)!.conflicts;
  assert.equal(waiting.length,1);assert.equal(waiting[0].waiting,true);assert.match(waiting[0].reason,/成果/);
  assert.equal(f.withStore(1,s=>s.list(project.project_id).length),0);
  await assert.rejects(()=>b.resolve(syncNamespace(selection),waiting[0].key,'local'),/尚未到达/);
  // The project was created by Pages first: explicit user activation on this device is retained.
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>c.addProjectPlugin({project_id:project.project_id,plugin_id:'artifacts',actor_id:'alice'}));
  await a.save({...a.policy(),selections:[selection,artifactSyncSelection]});await a.run();assert.equal(a.status().error,null);
  await b.run();assert.equal(b.status().error,null);
  const restored=f.withStore(1,s=>s.get(page.id));assert.equal(restored.artifact_id,'linked-artifact');assert.equal(restored.artifact_version,1);assert.deepEqual(restored.body,body('完整正文'));
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},c=>{
    const p=c.listProjects().find(p=>p.project_id===project.project_id)!;const db=new LocalProjectDatabase(p.database_path);
    try{const owner=new ArtifactsModule({db:db.db,appendEvent:e=>db.appendEvent(e)});assert.equal(owner.query.listArtifactVersions(p.project_id,'linked-artifact').length,2);assert.equal(owner.query.getArtifactVersion(p.project_id,{artifact_id:'linked-artifact',version:1})!.lifecycle_state,'archived');}finally{db.close();}
  });
  assert.ok(b.status().collections.filter(c=>b.policy().selections.some(s=>syncNamespace(s)===syncNamespace(c.selection))).every(c=>c.conflicts.length===0&&c.pending===0));
  assert.equal(b.status().collections.find(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1')!.pending,1,'the explicit local activation retains its unselected project metadata change without uploading it');
  assert.equal(b.status().progress.pending,0,'PCSYNC-27 aggregate progress excludes unselected local queues');assert.equal(b.status().progress.complete,true);
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
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],f.space.spaceId,'bob',()=>{},withMolisWorkProjectCatalog),{code:'host.version_sync_scope'});
  assert.throws(()=>createPersonalArtifactRegistration(f.homes[0],'foreign-space','alice',()=>{},withMolisWorkProjectCatalog),{code:'host.version_sync_scope'});
});

test('S-56 PCSYNC-14 Host refuses malformed fixed content before creating any target project',async t=>{
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
  const db=new DatabaseSync(homeSqlitePath(f.homes[1],'pages'));try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n,1);}finally{db.close();}
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
  try{db.exec("BEGIN; INSERT INTO folders VALUES ('f','project','Temp','2026-09-30T00:00:00Z','2026-09-30T00:00:00Z'); ROLLBACK;");assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,0);}finally{db.close();}
});

test('D1 schema: atomic CAS, owner isolation, idempotency constraint, disabled policy',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync('server/sync/migrations/0001_sync.sql','utf8'));
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
 assert.throws(()=>openTodoSyncStore(home),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(file),before);
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
