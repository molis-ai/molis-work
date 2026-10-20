import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createPersonalSync,openWorkSessionRegistry,LocalProjectDatabase,GoalProjectApplication} from '@molis-ai/molis-work-app-local-host';
import {modulesPrivateWorkContextContract} from '@molis-ai/molis-work-module-private-work-context';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-11/12/15/22/23 actual Work Session history crosses Host/Rust/D1/R2 with local sealing and no runtime authority or echo',async t=>{
  const cloud=await cloudFixture(t),root=mkdtempSync(join(tmpdir(),'molis-work-owner-cloud-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const env={MOLIS_WORK_SYNC_ORIGIN:'https://sync.example.test',MOLIS_WORK_SYNC_LOCAL:undefined,MOLIS_WORK_SECRET_BACKEND:'file',MOLIS_WORK_ENCRYPTION_KEY:''};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  t.mock.method(globalThis,'fetch',cloud.transport);
  const space=personalStorageSpace('https://auth.example.test','work','alice'),homes=['a','b'].map(id=>join(root,id));homes.forEach(home=>ensureStorageSpace(home,space));
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Private work history',actor_id:'alice'}));
  const store=new LocalProjectDatabase(project.database_path);t.after(()=>store.close());
  new GoalProjectApplication(store).goalEvents.createIntent({project_id:project.project_id,goal_id:'work-goal',title:'A real Goal owner',actor_id:'runtime:synthetic',actor_kind:'runtime',idempotency_key:'work-goal'});
  const source=await openWorkSessionRegistry({homeDirectory:homes[0]});t.after(()=>source.close());
  const marker='PRIVATE-CLOUD-WORK-CONTENT-',text=marker.repeat(14000);
  const session=source.createSession({runtime_id:'synthetic',native_runtime_session_id:'source-only-native-handle',surface_id:'source-only-surface',workspace_path:'/synthetic/source-only-workspace',metadata:{work_context_id:'source-only-context'},actor_id:'alice',user_confirmed:true,project_id:project.project_id,current_goal_id:'work-goal',title:'Portable Session'});
  source.appendEvent({session_id:session.session_id,source:'molis_work',kind:'user_message',source_id:'saved-input',content:text,metadata:{partial_terminal_history:true,panel_id:'source-only-panel'}});
  const draft=source.createHandoffDraft({source_session_id:session.session_id,source_project_id:project.project_id,source_goal_id:'work-goal',target_runtime_id:'destination',target_project_id:project.project_id,target_workspace_path:'/synthetic/source-only-workspace',content:text,actor_id:'alice'});
  const sending=source.createHandoffDraft({source_session_id:session.session_id,source_project_id:project.project_id,source_goal_id:'work-goal',target_runtime_id:'destination',target_project_id:project.project_id,content:text,actor_id:'alice'});source.markHandoffSending(sending.package_id);
  const authorize=()=>{},lease={userId:'alice',applicationId:'work',authOrigin:'https://auth.example.test',signal:new AbortController().signal,assertCurrent:authorize,accessToken:async()=>'alice'};
  const clients=await Promise.all(homes.map(home=>createPersonalSync(home,space,lease,withMolisWorkProjectCatalog,authorize)));t.after(()=>clients.forEach(client=>client.close()));
  const work=clients[0].status().collections.find(row=>row.selection.plugin_id===modulesPrivateWorkContextContract.contractId&&row.selection.collection_id==='sessions');assert.ok(work);
  assert.equal(clients[0].policy().selections.length,0,'neither Work nor Goals is silently enabled');
  const goals=clients[0].status().collections.find(row=>row.selection.collection_id==='project_goals');assert.ok(goals);
  await clients[0].save({...clients[0].policy(),selections:[goals.selection,work.selection]});await clients[0].run();await clients[1].run();clients.forEach(client=>assert.equal(client.status().error,null));
  const restored=await openWorkSessionRegistry({homeDirectory:homes[1]});t.after(()=>restored.close());
  const observed=restored.get(session.session_id);assert.equal(observed.project_id,project.project_id);assert.equal(observed.current_goal_id,'work-goal');assert.equal(observed.native_runtime_session_id,null);assert.equal(observed.surface_id,null);assert.equal(observed.workspace_path,null);assert.deepEqual(observed.metadata,{});
  assert.equal(restored.events(session.session_id)[0].content,text);assert.deepEqual(restored.events(session.session_id)[0].metadata,{partial_terminal_history:true});
  assert.equal(restored.getHandoff(draft.package_id).content,text);assert.equal(restored.getHandoff(sending.package_id).state,'sending');assert.equal(restored.latestPendingHandoff(session.session_id),null);
  assert.throws(()=>restored.markHandoffSending(draft.package_id),{code:'work.session.handoff_invalid_state'});
  const namespace=JSON.stringify([work.selection.plugin_id,work.selection.publisher_id,work.selection.publisher_signature,work.selection.collection_id,work.selection.schema_version]);
  const saved=await cloud.db.prepare('SELECT value FROM sync_events WHERE namespace=? ORDER BY revision DESC LIMIT 1').bind(namespace).first();
  const wire=JSON.parse(saved.value);assert.equal(wire.sync_content,1);assert.ok(wire.size>1024*1024,'the full real event and handoff bodies, not a synthetic preview, required R2');
  assert.ok((await cloud.bucket.list()).objects.length>0);
  for(const object of (await cloud.bucket.list()).objects){const bytes=Buffer.from(await(await cloud.bucket.get(object.key)).arrayBuffer());assert.doesNotMatch(bytes.toString('utf8'),/source-only-native-handle|source-only-surface|source-only-workspace|source-only-context|source-only-panel|content\.key|private-work-context:payload/);}
  const before=(await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;await clients[0].run();await clients[1].run();assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n,before);
  source.appendEvent({session_id:session.session_id,source:'molis_work',kind:'runtime_message',source_id:'later-turn',content:'A later accepted observation'});
  await clients[0].run();await clients[1].run();clients.forEach(client=>assert.equal(client.status().error,null));
  assert.deepEqual(restored.events(session.session_id).map(event=>event.content),[text,'A later accepted observation']);assert.equal(restored.getHandoff(sending.package_id).state,'sending');
  assert.equal(readFileSync(join(homes[0],'sessions','content','content.key')).equals(readFileSync(join(homes[1],'sessions','content','content.key'))),false);
  for(const home of homes){for(const entry of readdirSync(join(home,'sessions'),{recursive:true,encoding:'utf8'})){const path=join(home,'sessions',entry);if(statSync(path).isFile())assert.equal(readFileSync(path).includes(Buffer.from(marker)),false);}
    for(const suffix of ['','-wal']){try{assert.equal(readFileSync(join(home,'sync','sync.db'+suffix)).includes(Buffer.from(marker)),false);}catch(error){if(error.code!=='ENOENT')throw error;}}}
});
