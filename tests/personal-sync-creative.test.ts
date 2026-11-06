import assert from 'node:assert/strict';
import test from 'node:test';
import {personalSyncFixture} from './fixtures/personal-sync-coordinator.js';
import {runtimePersonalSync} from './fixtures/runtime-personal-sync.js';
import {openFormStore,openDatasetStore,openPptStore,openLingguangStore,openWorkflowsStore,openJellyStore,openTodoStore} from './fixtures/plugin-sync-stores.js';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase} from '@molis-ai/molis-work-app-local-host';
import {formManifest} from '@molis-ai/molis-work-plugin-form';
import {datasetManifest} from '@molis-ai/molis-work-plugin-dataset';
import {pptManifest} from '@molis-ai/molis-work-plugin-ppt';
import {lingguangManifest} from '@molis-ai/molis-work-plugin-lingguang';
import {workflowsManifest,newStation,manualLink} from '@molis-ai/molis-work-plugin-workflows';
import {jellyManifest} from '@molis-ai/molis-work-plugin-jelly';
import {todoManifest} from '@molis-ai/molis-work-plugin-todo';
import {scheduleManifest} from '@molis-ai/molis-work-plugin-schedule';
import {feedManifest,FeedOutRuleStore} from '@molis-ai/molis-work-plugin-feed';
import {SourcesModule,fromBetterSqlite} from '@molis-ai/molis-work-plugin-feed/store';
import {openCharacters} from '@molis-ai/molis-work-module-characters';
import {LOCAL_PERSON_ACTOR_ID} from '@molis-ai/molis-work-contracts/platform/actions';
import {CHARACTER_PLUGIN_ID,CHARACTER_PUBLISHER_SIGNATURE} from '@molis-ai/molis-work-contracts/modules/characters';
test('Host exposes and transfers all registered creative collections through the shared coordinator',{timeout:60000},async t=>{
  const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async c=>{
    const p=await c.createProject({display_name:'多插件项目',actor_id:'alice'});
    for(const plugin_id of ['form','dataset','ppt','lingguang','workflows','schedule','feed'])c.addProjectPlugin({project_id:p.project_id,plugin_id,actor_id:'alice'});return p;
  });
  await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async c=>{await c.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});for(const plugin_id of ['form','dataset','ppt','lingguang','workflows','schedule','feed'])c.addProjectPlugin({project_id:project.project_id,plugin_id,actor_id:'alice'});});
  const sourceRuntime=await runtimePersonalSync(f.homes[0],f.space),targetRuntime=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(()=>sourceRuntime.close());f.closeWith(()=>targetRuntime.close());const a=sourceRuntime.sync,b=targetRuntime.sync;
  const factories=[openFormStore,openDatasetStore,openPptStore,openLingguangStore];
  const ids=factories.map(open=>{const s=open(f.homes[0]);try{return s.create({project_id:project.project_id,title:'跨设备业务内容'}).id;}finally{s.close();}});
  const workflow=(()=>{const s=openWorkflowsStore(f.homes[0]);try{
    const flow=s.create({project_id:project.project_id,title:'跨设备流程',chain:{stations:[newStation('pages'),newStation('inbox')],links:[manualLink()]}});
    return {id:flow.workflow_id,instance:s.startInstance(flow,{plugin:'pages',item_id:'source',title:'资料'}).instance_id};
  }finally{s.close();}})();
  const jelly=(()=>{const s=openJellyStore(f.homes[0]);try{return s.execute({type:'note.create',title:'跨设备笔记',markdown:'同步内容'}).notes[0]!.id;}finally{s.close();}})();
  const todo=(()=>{const s=openTodoStore(f.homes[0]);try{return s.create({title:'跨设备待办'},{projectId:null,projectIds:[],actor:'user',actorId:'alice'}).item.id;}finally{s.close();}})();
  const character=(()=>{const s=openCharacters(f.homes[0],LOCAL_PERSON_ACTOR_ID);try{
    const draft=s.service.create();return s.service.update(draft.character_id,draft.revision,{title:'跨设备角色',instructions:'核对事实',host_tools:null}).character_id;
  }finally{s.close();}})();
  const scheduleStore=new LocalProjectDatabase(project.database_path);
  let feedRuleId='';
  try{
    scheduleStore.db.prepare(`INSERT INTO schedule_conversation_tasks (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('sync-task','跨设备提醒','检查进展',9,0,1,1,0,0,'origin-job',null,null,'2026-10-14T00:00:00.000Z','2026-10-14T00:00:00.000Z');
    feedRuleId=new FeedOutRuleStore(fromBetterSqlite(scheduleStore.db)).create(project.project_id,{name:'跨设备捕捉',match:{contains:'发布'},enabled:true}).rule_id;
    new SourcesModule(fromBetterSqlite(scheduleStore.db)).commands.save({project_id:project.project_id,source_id:'portable-source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:'跨设备来源',description:'只同步描述与历史',status:'active',enabled:true,origin:'molis_work',config:{connection_id:'this-device-only-connection'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:null},connection_ref:'this-device-only-reference',account_label:'This device',last_sync_at:null,last_outcome:null,last_error_code:null,imported_at:'2026-10-18T00:00:00.000Z',updated_at:'2026-10-18T00:00:00.000Z'});
  }finally{scheduleStore.close();}
  await a.run();await b.run();
  const selections=[formManifest,datasetManifest,pptManifest,lingguangManifest,workflowsManifest,jellyManifest,todoManifest,scheduleManifest,feedManifest].flatMap(m=>m.sync!.collections.map(c=>({plugin_id:m.plugin_id,publisher_id:m.publisher.publisher_id,publisher_signature:m.publisher.signature,collection_id:c.id,schema_version:c.schema_version})));
  selections.push({plugin_id:CHARACTER_PLUGIN_ID,publisher_id:'molis',publisher_signature:CHARACTER_PUBLISHER_SIGNATURE,collection_id:'drafts',schema_version:1});
  for(const selection of selections){const available=a.status().collections.find(row=>row.selection.plugin_id===selection.plugin_id&&row.selection.collection_id===selection.collection_id);assert.ok(available,selection.plugin_id+' '+selection.collection_id+' '+JSON.stringify(a.status().collections));assert.deepEqual(available.selection,selection);}assert.ok(a.status().collections.some(c=>c.selection.plugin_id==='io.molis.work.module.projects.v1'));assert.equal(a.policy().selections.length,0,'all current owner collections are opt-in');
  await a.save({...a.policy(),selections});for(let round=0;round<4;round++){await a.run();await b.run();}assert.equal(a.status().error,null);assert.equal(b.status().error,null);
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
    assert.equal(receivedTodo.get(todo,{projectId:null,projectIds:[],actor:'user',actorId:'alice'}).title,'跨设备待办');
  }finally{receivedTodo.close();}
  const receivedCharacter=openCharacters(f.homes[1],LOCAL_PERSON_ACTOR_ID);try{
    assert.equal(receivedCharacter.service.get(character)?.title,'跨设备角色');
  }finally{receivedCharacter.close();}
  const target=await targetRuntime.withCatalog({homeDirectory:f.homes[1]},c=>c.listProjects().find(p=>p.project_id===project.project_id)!);
  const receivedSchedule=new LocalProjectDatabase(target.database_path);try{
    const task=receivedSchedule.db.prepare('SELECT enabled,job_id,title FROM schedule_conversation_tasks WHERE task_id=?').get('sync-task') as {enabled:number;job_id:string|null;title:string};
    assert.equal(task.title,'跨设备提醒');assert.equal(task.enabled,0);assert.equal(task.job_id,null);
    const rule=new FeedOutRuleStore(fromBetterSqlite(receivedSchedule.db)).get(project.project_id,feedRuleId);
    assert.equal(rule.name,'跨设备捕捉');assert.equal(rule.enabled,false,'received capture rules cannot run before local opt-in');
    const source=new SourcesModule(fromBetterSqlite(receivedSchedule.db)).query.get(project.project_id,'portable-source');assert.equal(source.name,'跨设备来源');assert.equal(source.enabled,false);assert.equal(source.connection_ref,null);assert.deepEqual(source.config,{});assert.deepEqual(source.schedule,{mode:'manual'});
  }finally{receivedSchedule.close();}
  for(const client of [a,b])for(const collection of client.status().collections)assert.deepEqual(collection.conflicts,[],collection.selection.plugin_id+' '+collection.selection.collection_id);
  const before=f.events.length;await a.run();await b.run();assert.equal(f.events.length,before,'no replication echo');
  assert.doesNotMatch(JSON.stringify(f.events),/this-device-only-connection|this-device-only-reference/,'source setup never enters the transport');
});
