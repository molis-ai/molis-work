import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createPersonalSync,LocalProjectDatabase,bindSavedHistory,openPluginProjectLibrary} from '@molis-ai/molis-work-app-local-host';
import {CodingSessionStore,codingManifest} from '@molis-ai/molis-work-plugin-coding';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createPrologueNodeAdapter,savedAgentHistoryView} from '@molis-ai/molis-work-service-agent-host';
import {cloudFixture} from './testing.mjs';

test('S-64 PCSYNC-15/22/23 actual Coding sessions and complete saved plans cross Host/Rust/D1/R2 without native authority or echo',async t=>{
 const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'coding-owner-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const env={MOLIS_WORK_SYNC_ORIGIN:'https://sync.example.test',MOLIS_WORK_SYNC_LOCAL:undefined,MOLIS_WORK_SECRET_BACKEND:'file',MOLIS_WORK_ENCRYPTION_KEY:''};
 const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;
 t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
 let modelCalls=0;
 t.mock.method(globalThis,'fetch',(url,options)=>String(url).startsWith('https://1.1.1.1/')?Promise.resolve(modelResponse('Real SDK saved reply '+(++modelCalls)+' — 完整原始答复')):cloud.transport(url,options));
 const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(id=>join(root,id));homes.forEach(home=>ensureStorageSpace(home,space));
 const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},async catalog=>{
  const p=await catalog.createProject({display_name:'Real Coding content',actor_id:'alice'});catalog.addProjectPlugin({project_id:p.project_id,plugin_id:'coding',actor_id:'alice'});return p;
 });
 const database=new LocalProjectDatabase(project.database_path);t.after(()=>database.close());const source=sessions(database);
 const task='COMPLETE-CODING-REQUEST-'.repeat(4000),content={title:'A complete saved plan',steps:[{title:'Inspect source',acceptance:'Keep every saved character'}],blockers:'',change_reason:''};
 for(let index=0;index<16;index++){
  const id='saved-session-'+index;await source.create(noEffect,{project_id:project.project_id,session_id:id,title:'Saved session '+index,runtime_id:'prologue',at:'2026-10-19T00:00:00Z'});
  await source.savePlan(noEffect,project.project_id,id,0,{revision:1,content,source:{session_id:id,run_id:'source-planner-'+index,task,workspace_path:'/source-only-native-directory'},confirmed:null});
  await source.inputs.write(noEffect,project.project_id,id,0,{draft:task,question_drafts:{question:'Full unsent answer '+index}});
 }
 const identity={project_id:project.project_id,plugin_id:codingManifest.plugin_id,install_id:'coding-source',actor_id:'web-user'};
 const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.cloud-history-test',appVersion:'1.0.0'},storageRoot:join(homes[0],'prologue'),modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'fixture-only'});
 t.after(()=>adapter.close());const unbind=bindSavedHistory(homes[0],adapter.savedHistory);t.after(unbind);
 const runtime=await adapter.createSession({...identity,workspace:'business',title:'Actual saved SDK conversation'});
 await source.setRuntimeSession(noEffect,project.project_id,'saved-session-0',runtime.session_id,'2026-10-19T00:01:00Z');
 const role={role_id:'reader',version:1,workspace:'business',execution:'read-only',prompts:[],host_tools:[]};
 for(const task of ['Original complete request','Follow-up — 后续问题']){
  const handle=await adapter.start({...identity,workspace:'business',session:runtime,role_id:'reader',role,task}),deadline=Date.now()+15000;
  for(;;){const run=await adapter.read(handle.ref);if(['completed','failed','stopped','cancelled'].includes(run.phase)){assert.equal(run.phase,'completed');break;}assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,5));}
 }
 await source.setState(noEffect,project.project_id,'saved-session-0','done','2026-10-19T00:02:00Z');
 const check=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:check,accessToken:async()=>'alice'};
 const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,check)));t.after(()=>clients.forEach(client=>client.close()));
 const coding=clients[0].status().collections.find(row=>row.selection.plugin_id===codingManifest.plugin_id&&row.selection.collection_id==='sessions');assert.ok(coding);assert.equal(clients[0].policy().selections.length,0);
 await clients[0].save({...clients[0].policy(),selections:[coding.selection]});await clients[0].run();await clients[1].run();clients.forEach(client=>assert.equal(client.status().error,null));
 const targetProject=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects().find(p=>p.project_id===project.project_id));assert.ok(targetProject);
 const targetDatabase=new LocalProjectDatabase(targetProject.database_path);t.after(()=>targetDatabase.close());const target=sessions(targetDatabase);
 assert.equal(target.list(project.project_id).length,16);
 for(let index=0;index<16;index++){
  const id='saved-session-'+index,session=target.get(project.project_id,id),plan=target.plan(project.project_id,id);
  assert.equal(session.title,'Saved session '+index);assert.equal(session.state,'idle');assert.equal(session.runtime_session_id,null);
  assert.equal(target.backgroundOf(project.project_id,id),null);assert.equal(target.stepsOf(project.project_id,id),null);
  assert.deepEqual(plan.content,content);assert.equal(plan.source.task,task);assert.equal(plan.source.workspace_path,'');assert.equal(plan.confirmed,null);assert.equal(plan.revision,1);
  assert.deepEqual(target.inputs.read(project.project_id,id),{draft:task,question_drafts:{question:'Full unsent answer '+index},revision:1});
 }
 const namespace=JSON.stringify([coding.selection.plugin_id,coding.selection.publisher_id,coding.selection.publisher_signature,coding.selection.collection_id,coding.selection.schema_version]);
 const saved=await cloud.db.prepare('SELECT value FROM sync_events WHERE namespace=? ORDER BY revision DESC LIMIT 1').bind(namespace).first();
 const wire=JSON.parse(saved.value);assert.equal(wire.sync_content,1);assert.ok(wire.size>1024*1024,'complete real owner content, not a synthetic preview, uses R2');
 const objects=(await cloud.bucket.list()).objects;assert.ok(objects.length>0);
 for(const object of objects){const bytes=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer());assert.doesNotMatch(bytes.toString('utf8'),/source-only-native-directory|source-only-sdk-session|source-only-command|never dispatch/);}
 const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before);
 await source.rename(noEffect,project.project_id,'saved-session-0','A later saved title','2026-10-19T00:03:00Z');await clients[0].run();await clients[1].run();clients.forEach(client=>assert.equal(client.status().error,null));
 assert.equal(target.get(project.project_id,'saved-session-0').title,'A later saved title');assert.equal(target.plan(project.project_id,'saved-session-0').source.task,task);assert.equal(target.plan(project.project_id,'saved-session-0').revision,2);
 assert.deepEqual(target.inputs.read(project.project_id,'saved-session-0'),{draft:task,question_drafts:{question:'Full unsent answer 0'},revision:2});
 assert.equal(source.get(project.project_id,'saved-session-0').runtime_session_id,runtime.session_id);
 const history=target.savedHistory(project.project_id,'saved-session-0');assert.equal(history.length,1);const view=savedAgentHistoryView(history[0]);assert.equal(view.runs.length,2);assert.match(JSON.stringify(view),/后续问题/);assert.match(JSON.stringify(view),/完整原始答复/);assert.equal(modelCalls,2,'receiver and preparation read saved events without any model execution');
});

function modelResponse(text){
 const events=[],emit=(type,value)=>events.push('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n');
 emit('message_start',{message:{id:'saved',type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,usage:{input_tokens:10,output_tokens:0}}});
 emit('content_block_start',{index:0,content_block:{type:'text',text:''}});emit('content_block_delta',{index:0,delta:{type:'text_delta',text}});emit('content_block_stop',{index:0});emit('message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit('message_stop',{});
 return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
}

const noEffect=async()=>{};
const sessions=store=>new CodingSessionStore(openPluginProjectLibrary({db:store.db,path:store.path},codingManifest,()=>{},'coding-cloud-test').client);
