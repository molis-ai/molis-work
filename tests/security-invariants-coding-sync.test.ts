import {createPrologueNodeAdapter,readSavedAgentHistory,savedAgentHistoryView} from '@molis-ai/molis-work-service-agent-host';
import {refreshCodingSavedHistory} from '@molis-ai/molis-work-plugin-coding';
import {cogniaModelResponse} from './fixtures/cognia-model-response.js';
import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalProjectDatabase,createPersonalSync} from '@molis-ai/molis-work-app-local-host';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {CodingSessionStore,codingManifest,codingContentReplicationDefinition,CODING_CONTENT_REPLICA_ID} from '@molis-ai/molis-work-plugin-coding';
import {createProjectContentReplicaFactory,ensureStorageSpace,personalStorageSpace,validateProjectContentReplication} from '@molis-ai/molis-work-storage';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import type {ProjectReplicaRows,SyncEvent} from '@molis-ai/molis-work-contracts/platform/sync-transport';

async function fixture(t:TestContext){
 const root=mkdtempSync(join(tmpdir(),'coding-owner-sync-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const homes=[join(root,'a'),join(root,'b')],space=personalStorageSpace('https://auth.example.test','work','alice');homes.forEach(home=>ensureStorageSpace(home,space));
 const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Coding facts',actor_id:'alice'}));
 const other=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},catalog=>catalog.ensureSyncedProject({project_id:project.project_id,display_name:'Coding facts',actor_id:'alice'},()=>{}));
 const databases=[project,other].map(p=>new LocalProjectDatabase(p.database_path));t.after(()=>databases.forEach(db=>db.close()));
 const stores=databases.map(db=>new CodingSessionStore(db.db));let active=true;
 const definition=codingContentReplicationDefinition(readSavedAgentHistory),factory=createProjectContentReplicaFactory([definition],'coding',CODING_CONTENT_REPLICA_ID);
 const contexts=databases.map(()=>({spaceId:space.spaceId,projectId:project.project_id,title:'Coding facts',authorize(){if(!active)throw new Error('REVOKED');},conflictState:createSyncConflictState}));
 const replicas=databases.map((db,index)=>factory(db.replicationDatabase,contexts[index]!));
 const create=(index:number,id='session')=>stores[index]!.create({project_id:project.project_id,session_id:id,title:'Saved session',runtime_id:'source-runtime',at:'2026-10-19T00:00:00Z',goal_id:'unresolved-goal'});
 const plan=(index:number,id='session',expected=stores[index]!.planRevision(project.project_id,id))=>stores[index]!.savePlan(project.project_id,id,expected,{revision:expected+1,
  content:{title:'Saved plan',steps:[{title:'Inspect source',acceptance:'Report evidence'}],blockers:'',change_reason:''},
  source:{session_id:id,run_id:'planning-run',task:'Original complete request',workspace_path:'/source-only-native-directory'},confirmed:null});
 const send=(revision=1)=>{const mutation=replicas[0]!.next();assert.ok(mutation);const event={...mutation,revision};replicas[1]!.receive(event);replicas[0]!.acknowledge(mutation.key,mutation.operationId,revision);return event;};
 return {root,homes,space,project,databases,stores,replicas,definition,contexts,create,plan,send,revoke(){active=false;},allow(){active=true;}};
}

test('S-52 PCSYNC-22/23 Coding saved metadata and complete plans travel through their real owner without runtime authority or echo',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.plan(0);
 f.stores[0]!.inputs.write(p,'session',0,{draft:'Complete unsent input',question_drafts:{question:'An unsent answer'}});
 f.stores[0]!.setRuntimeSession(p,'session','source-only-sdk-session','2026-10-19T00:01:00Z');
 f.stores[0]!.setState(p,'session','running','2026-10-19T00:02:00Z');
 f.stores[0]!.setBackground(p,'session',[{task_id:'source-only-command',summary:'do not dispatch',started_at_ms:10}]);
 const next=f.replicas[0]!.next()!;assert.doesNotMatch(JSON.stringify(next.value),/source-only-native-directory|source-only-sdk-session|source-only-command|do not dispatch/);
 f.send();const copied=f.stores[1]!.get(p,'session'),draft=f.stores[1]!.plan(p,'session')!;
 assert.equal(copied.title,'Saved session');assert.equal(copied.goal_id,'unresolved-goal');assert.equal(copied.state,'idle');assert.equal(copied.runtime_session_id,null);
 assert.equal(f.stores[1]!.backgroundOf(p,'session'),null);assert.equal(f.stores[1]!.stepsOf(p,'session'),null);
 assert.equal(draft.source.task,'Original complete request');assert.equal(draft.source.workspace_path,'');assert.equal(draft.confirmed,null);assert.equal(draft.revision,1);
 assert.deepEqual(f.stores[1]!.inputs.read(p,'session'),{draft:'Complete unsent input',question_drafts:{question:'An unsent answer'},revision:1});
 assert.equal(f.replicas[1]!.next(),null);assert.deepEqual(f.replicas[1]!.conflicts(),[]);
 f.stores[0]!.setSteps(p,'session',{mine:1,subtasks:0,unowned:0});f.stores[0]!.setBackground(p,'session',[]);
 f.stores[0]!.setState(p,'session','done','2026-10-19T00:03:00Z');
 assert.throws(()=>f.replicas[0]!.next(),{code:'storage.sync_busy'},'a terminal SDK transition stays pending until its complete history is captured; private cache polling alone adds no portable body');
});

test('S-52 PCSYNC-12/22 saved input clocks reject old editors after adoption and accepted runs never clear newer typing',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.stores[0]!.inputs.write(p,'session',0,{draft:'First input'});f.send();
 f.stores[1]!.inputs.write(p,'session',1,{draft:'My concurrent typing'});f.stores[0]!.inputs.write(p,'session',1,{draft:'Other device input',question_drafts:{q:'All answer text'}});const event=f.send(2);
 f.replicas[1]!.resolve(event.key,'remote',2);assert.deepEqual(f.stores[1]!.inputs.read(p,'session'),{draft:'Other device input',question_drafts:{q:'All answer text'},revision:3});
 assert.throws(()=>f.stores[1]!.inputs.write(p,'session',2,{draft:'Stale text'}),{code:'coding.inputs_changed'});
 const next=f.stores[1]!.inputs.write(p,'session',3,{draft:'Typing after accepted run'});assert.equal(next.revision,4);
 assert.equal(f.stores[1]!.inputs.clearIfUnchanged(p,'session',3),false);assert.equal(f.stores[1]!.inputs.read(p,'session').draft,'Typing after accepted run');
 assert.equal(f.stores[1]!.inputs.clearIfUnchanged(p,'session',4),true);assert.deepEqual(f.stores[1]!.inputs.read(p,'session'),{draft:'',question_drafts:{q:'All answer text'},revision:5});
});

test('S-52 PCSYNC-23 active or uncertain local execution blocks remote overwrite and explicit adoption, then preserves its local binding',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.plan(0);f.send();
 f.stores[1]!.setRuntimeSession(p,'session','target-only-sdk','2026-10-19T00:01:00Z');f.stores[1]!.setState(p,'session','running','2026-10-19T00:02:00Z');
 f.stores[0]!.rename(p,'session','Remote title','2026-10-19T00:03:00Z');const event=f.send(2);
 assert.equal(f.stores[1]!.get(p,'session').title,'Saved session');assert.equal(f.replicas[1]!.conflicts()[0]!.waiting,true);
 assert.throws(()=>f.replicas[1]!.resolve(event.key,'remote',event.revision),/关联资产尚未到达/);
 f.stores[1]!.setState(p,'session','reconcile-required','2026-10-19T00:04:00Z');f.replicas[1]!.retryWaiting!();assert.equal(f.stores[1]!.get(p,'session').title,'Saved session');
 // No Run was created in this metadata-only fixture; clear its transient execution cache to idle. Real completed SDK history is tested below.
 f.stores[1]!.setState(p,'session','idle','2026-10-19T00:05:00Z');f.replicas[1]!.retryWaiting!();
 assert.equal(f.stores[1]!.get(p,'session').title,'Remote title');assert.equal(f.stores[1]!.get(p,'session').runtime_session_id,'target-only-sdk');
 assert.equal(f.stores[1]!.get(p,'session').state,'idle');assert.equal(f.stores[1]!.plan(p,'session')!.revision,2);assert.equal(f.replicas[1]!.next(),null);
});

test('S-52 PCSYNC-12/23 a tombstone cannot bypass execution guards and editor high-water marks survive deletion and recreation',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.plan(0);const first=f.send();
 f.stores[1]!.setState(p,'session','paused','2026-10-19T00:01:00Z');
 const removed:SyncEvent={...first,operationId:'remote-delete',base:1,revision:2,value:null};f.replicas[1]!.receive(removed);
 assert.equal(f.stores[1]!.get(p,'session').state,'paused');assert.throws(()=>f.replicas[1]!.resolve(removed.key,'remote',2),/关联资产尚未到达/);
 f.stores[1]!.setState(p,'session','done','2026-10-19T00:02:00Z');f.replicas[1]!.retryWaiting!();assert.equal(f.stores[1]!.list(p).length,0);
 f.create(1);assert.equal(f.stores[1]!.planRevision(p,'session'),2);
 assert.throws(()=>f.plan(1,'session',0),/计划已被另一页面修改/);assert.throws(()=>f.plan(1,'session',1),/计划已被另一页面修改/);
 assert.equal(f.plan(1).revision,3);assert.equal(f.stores[1]!.planRevision(p,'session'),3);
});

test('S-52 PCSYNC-23 explicit conflict adoption still checks local execution and background commands before clearing rows',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.plan(0);f.send();
 f.stores[1]!.rename(p,'session','My pending edit','2026-10-19T00:01:00Z');f.stores[1]!.setState(p,'session','waiting-approval','2026-10-19T00:02:00Z');
 f.stores[0]!.rename(p,'session','Remote edit','2026-10-19T00:03:00Z');const event=f.send(2);
 assert.equal(f.replicas[1]!.conflicts()[0]!.waiting,false,'this is an actual edit conflict, not the coordinator waiting shortcut');
 assert.throws(()=>f.replicas[1]!.resolve(event.key,'remote',2),{code:'coding.sync_active'});assert.equal(f.stores[1]!.get(p,'session').title,'My pending edit');
 f.stores[1]!.setState(p,'session','done','2026-10-19T00:04:00Z');f.stores[1]!.setBackground(p,'session',[{task_id:'still-active',summary:'Keep the real command',started_at_ms:1}]);
 assert.throws(()=>f.replicas[1]!.resolve(event.key,'remote',2),{code:'coding.sync_active'});assert.equal(f.stores[1]!.planRevision(p,'session'),1);
 f.stores[1]!.setBackground(p,'session',[]);f.replicas[1]!.resolve(event.key,'remote',2);
 assert.equal(f.stores[1]!.get(p,'session').title,'Remote edit');assert.equal(f.stores[1]!.planRevision(p,'session'),2);assert.deepEqual(f.replicas[1]!.conflicts(),[]);
});

test('S-52 PCSYNC-01/14 malformed Coding owner content cannot create a project, leak native fields or lower local counters',async t=>{
 const f=await fixture(t);f.create(0);f.plan(0);f.stores[0]!.inputs.write(f.project.project_id,'session',0,{draft:'Complete saved input'});const event={...f.replicas[0]!.next()!,revision:1};
 const previous=process.env.MOLIS_WORK_SYNC_ORIGIN;process.env.MOLIS_WORK_SYNC_ORIGIN='https://sync.example.test';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_ORIGIN;else process.env.MOLIS_WORK_SYNC_ORIGIN=previous;});
 const collection=codingManifest.sync!.collections[0]!,selection={plugin_id:codingManifest.plugin_id,publisher_id:codingManifest.publisher.publisher_id,publisher_signature:codingManifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};
 let incoming:unknown=null;
 t.mock.method(globalThis,'fetch',async(input:URL|string)=>{const url=new URL(String(input));
  if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:f.space.spaceId,revision:1,selections:[selection]},(incoming as {revision:number}|null)?.revision??0);
  if(url.pathname==='/v1/policy')return Response.json({spaceId:f.space.spaceId,revision:1,selections:[selection]});
  if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
  assert.equal(url.pathname,'/v1/changes');return Response.json({events:[incoming],more:false});
 });
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'synthetic-only'};
 type Unit={facts:Record<string,ProjectReplicaRows>};
 const edits:((unit:Unit)=>void)[]=[
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_sessions![0]!.runtime_session_id='foreign-native';},
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_plan_versions!.push({project_id:f.project.project_id,session_id:'session',revision:1});},
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_plan_drafts![0]!.revision=-1;},
  unit=>{const row=unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_plan_drafts![0]!;const plan=JSON.parse(String(row.draft_json));plan.source.workspace_path='/foreign-directory';row.draft_json=JSON.stringify(plan);},
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_inputs![0]!.revision=1;},
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_inputs![0]!.draft=17;},
  unit=>{unit.facts[CODING_CONTENT_REPLICA_ID]!.coding_inputs![0]!.questions_json='{"q":1e400}';},
 ];
 for(const [index,edit] of edits.entries()){const value=structuredClone(event.value) as Unit;edit(value);incoming={...event,value};
  const home=join(f.root,'uninitialized-target-'+index);ensureStorageSpace(home,f.space);
  const client=(await createPersonalSync(home,f.space,lease,withMolisWorkProjectCatalog,check))!;
  try{await client.run();assert.notEqual(client.status().error,null);assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:home},catalog=>catalog.listProjects()),[]);}finally{client.close();}
 }
 assert.throws(()=>validateProjectContentReplication(event.value,[f.definition],{...f.contexts[0]!,spaceId:'foreign'}));
});

test('S-52 PCSYNC-06 late revocation rolls back imported rows and high-water marks together',async t=>{
 const f=await fixture(t),p=f.project.project_id;f.create(0);f.plan(0);f.stores[0]!.inputs.write(p,'session',0,{draft:'Keep this input'});f.send();const before=f.stores[1]!.plan(p,'session');
 f.stores[0]!.rename(p,'session','Must roll back','2026-10-19T00:01:00Z');const event={...f.replicas[0]!.next()!,revision:2};
 f.databases[1]!.db.function('revoke_coding_sync',()=>{f.revoke();return 1;});
 f.databases[1]!.db.exec('CREATE TRIGGER revoke_coding_import AFTER INSERT ON coding_sessions BEGIN SELECT revoke_coding_sync(); END;');
 assert.throws(()=>f.replicas[1]!.receive(event),/REVOKED/);f.allow();
 assert.equal(f.stores[1]!.get(p,'session').title,'Saved session');assert.deepEqual(f.stores[1]!.plan(p,'session'),before);assert.equal(f.stores[1]!.planRevision(p,'session'),1);
 assert.deepEqual(f.stores[1]!.inputs.read(p,'session'),{draft:'Keep this input',question_drafts:{},revision:1});
});

// PCSYNC-22/23: real SDK event ledgers, not fabricated session-view metadata.
test('canonical saved SDK conversations round-trip through the Coding owner with no target execution binding', {timeout:45000},async t=>{
 const f=await fixture(t),p=f.project.project_id,identity={project_id:p,plugin_id:codingManifest.plugin_id,install_id:'source-coding',actor_id:'web-user'};
 let calls=0;t.mock.method(globalThis,'fetch',async()=>cogniaModelResponse('Actual SDK reply '+(++calls)+' — 完整中文结尾'));
 const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.saved-history-test',appVersion:'1.0.0'},storageRoot:join(f.root,'sdk'),modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'fixture-only'});
 t.after(()=>adapter.close());const runtime=await adapter.createSession({...identity,workspace:'business',title:'Portable conversation'});
 f.stores[0]!.create({project_id:p,session_id:'conversation',title:'Portable conversation',runtime_id:'prologue',at:'2026-10-19T00:00:00Z'});
 f.stores[0]!.setRuntimeSession(p,'conversation',runtime.session_id,'2026-10-19T00:00:00Z');
 const authorize=()=>{},owner={project_id:p,plugin_id:identity.plugin_id,actor_id:identity.actor_id};let revision=0;
 const role={role_id:'reader',version:1,workspace:'business' as const,execution:'read-only' as const,prompts:[],host_tools:[]};
 for(const [index,task] of ['Original first request','Follow-up request — 后续问题'].entries()){
  const handle=await adapter.start({...identity,workspace:'business',session:runtime,role_id:'reader',role,task}),deadline=Date.now()+15000;
  for(;;){const run=await adapter.read(handle.ref);if(['completed','failed','stopped','cancelled'].includes(run.phase)){assert.equal(run.phase,'completed');break;}assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,5));}
  if(index===0){await refreshCodingSavedHistory(f.databases[0]!.db,p,id=>adapter.savedHistory.read(id,owner,authorize),authorize,readSavedAgentHistory);f.send(++revision);assert.equal(f.replicas[0]!.counts().pending,0);}else{f.stores[0]!.setState(p,'conversation','done','2026-10-19T00:02:00Z');assert.ok(f.replicas[0]!.counts().pending>0,'a newly completed SDK round protects the project until exported and acknowledged');}
 }
 await refreshCodingSavedHistory(f.databases[0]!.db,p,id=>adapter.savedHistory.read(id,owner,authorize),authorize,readSavedAgentHistory);
 assert.equal(calls,2,'exporting saved history must not call the model');
 const event=f.send(++revision),wire=JSON.stringify(event.value);assert.match(wire,/Original first request/);assert.match(wire,/后续问题/);assert.match(wire,/Actual SDK reply 2/);
 const target=f.stores[1]!.get(p,'conversation');assert.equal(target.runtime_session_id,null);assert.equal(target.state,'idle');
 const saved=f.stores[1]!.savedHistory(p,'conversation');assert.equal(saved.length,1);const view=savedAgentHistoryView(saved[0]!);assert.equal(view.runs.length,2);assert.match(JSON.stringify(view),/完整中文结尾/);
 const received=f.replicas[1]!.next();assert.equal(received,null,'archive adoption does not echo or start a new SDK session');
 assert.throws(()=>readSavedAgentHistory(saved[0]!.replace('Actual SDK reply 2','tampered reply')),{code:'agent.history_invalid'});
 await assert.rejects(()=>adapter.savedHistory.read(runtime.session_id,{...owner,project_id:'foreign'},authorize),{code:'agent.history_scope'});
 await assert.rejects(()=>adapter.savedHistory.read(runtime.session_id,owner,()=>{throw new Error('REVOKED');}),/REVOKED/);
 const before=f.databases[1]!.db.prepare('SELECT archive_json FROM coding_saved_history').get();
 const bad=structuredClone(event),facts=(bad.value as {facts:Record<string,Record<string,import('@molis-ai/molis-work-contracts/platform/sync-transport').ProjectReplicaRow[]>>}).facts.coding_content!.coding_saved_history!;facts[0].archive_json=facts[0].archive_json.replace('Actual SDK reply 2','damaged reply');
 f.replicas[1]!.receive({...bad,operationId:'damaged-history',base:event.revision,revision:event.revision+1});assert.deepEqual(f.databases[1]!.db.prepare('SELECT archive_json FROM coding_saved_history').get(),before);assert.ok(f.replicas[1]!.conflicts().length);
 assert.equal(calls,2,'validation and target reads remain passive');
});
