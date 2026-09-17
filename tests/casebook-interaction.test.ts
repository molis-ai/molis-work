/** Authorization/storage invariants against the current event workflow. Legacy v1 execution cases stay at 225d419. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createMolisWorkLocalHost,molisWorkHostProjectReference,initializeBoardCapability,createGoalIntentCapability,MolisWorkCasebookIntegration} from '@molis-ai/molis-work-app-local-host';
import {PURPOSE,CONTEXT_PURPOSE,VERSION,type AuthorizationRequest} from '../apps/local-host/src/casebook/contract.js';
import {createCasebookUserActionSigner,createCasebookUserActionVerifier} from '../apps/local-host/src/casebook/user-action.js';

async function fixture(t:test.TestContext){
 const dir=mkdtempSync(join(tmpdir(),'casebook-invariants-'));const host=createMolisWorkLocalHost();const ref=molisWorkHostProjectReference({databasePath:join(dir,'test.db'),boardId:'board'});const client=host.client(ref);
 await client.invoke(initializeBoardCapability,{board_id:'board',title:'隔离',actor_id:'user',idempotency_key:'init'});
 const config={secret:randomBytes(32).toString('hex'),audience:'owner'};const sign=createCasebookUserActionSigner(config);
 const api=new MolisWorkCasebookIntegration({client,verifyUserAction:createCasebookUserActionVerifier(config)});
 const request=(action:AuthorizationRequest['action'],key:string):AuthorizationRequest=>{const r={project_ref:'board',purpose:PURPOSE,action,include_goal_context:true as const,actor_ref:'github:1',user_confirmed:true as const,idempotency_key:key};return{...r,user_action_ref:sign(r)};};
 const auth=async()=>await api.readInteractionAuthorization({project_ref:'board',purpose:PURPOSE}) as {authorization_epoch:string;state:string};
 const read=async()=>api.readInteractionFacts({project_ref:'board',schema_version:VERSION,authorization_epoch:(await auth()).authorization_epoch,after_cursor:0,limit:100});
 const create=(id:string,title='目标')=>client.invoke(createGoalIntentCapability,{board_id:'board',goal_id:id,title,actor_id:'user',idempotency_key:'create-'+id});
 t.after(async()=>{await host.close();rmSync(dir,{recursive:true,force:true});});return{dir,host,ref,client,api,request,auth,read,create};
}
test('signed dual-purpose authorization replays remain durable across restart and cannot undo newer intent',async t=>{
 const f=await fixture(t);const initial=f.request('join','join');const receipt=await f.api.setInteractionAuthorization(initial);
 assert.deepEqual(await f.api.setInteractionAuthorization(initial),receipt);await f.create('first');const facts=(await f.read()).facts;
 await f.host.closeProject(f.ref);await f.host.restoreExistingProject(f.ref);assert.deepEqual((await f.read()).facts,facts);
 await f.api.setInteractionAuthorization(f.request('pause','pause'));await f.api.setInteractionAuthorization(initial);assert.equal((await f.auth()).state,'paused');
 const remove=f.request('remove','remove');await f.api.setInteractionAuthorization(remove);await f.api.setInteractionAuthorization(f.request('join','rejoin'));const epoch=(await f.auth()).authorization_epoch;
 await f.api.setInteractionAuthorization(remove);assert.equal((await f.auth()).authorization_epoch,epoch);assert.equal((await f.auth()).state,'active');assert.equal((await f.read()).facts.length,0);
 const context=await f.api.readInteractionAuthorization({project_ref:'board',purpose:CONTEXT_PURPOSE}) as {state:string};assert.equal(context.state,'active');
 await assert.rejects(f.api.setInteractionAuthorization({...f.request('pause','bad'),actor_ref:'forged'}),{code:'not_authorized'});
 const denied=new MolisWorkCasebookIntegration({client:f.client});await assert.rejects(denied.setInteractionAuthorization(f.request('pause','denied')),{code:'not_authorized'});
});
test('recorder failures do not replace business success or rejection; partial operation remains visible',async t=>{
 const f=await fixture(t);await f.api.setInteractionAuthorization(f.request('join','join'));
 await f.host.withProject(f.ref,r=>r.store.db.exec("CREATE TRIGGER fail_result BEFORE INSERT ON casebook_interaction_facts WHEN json_extract(NEW.body,'$.kind')='result' BEGIN SELECT RAISE(FAIL,'isolated'); END"));
 await f.create('committed');await assert.rejects(f.create('invalid',''),{code:'goal.title_required'});
 const batch=await f.read();assert.equal(batch.facts.length,2);assert.equal(batch.coverage.incomplete_operations,2);assert.ok(batch.coverage.unpersisted_failures>=2);
 assert.ok(await f.host.withProject(f.ref,r=>r.store.goalsQuery.getGoal('board','committed')));
});
test('source rejects unknown fields/version/cursors and detects tampered immutable facts',async t=>{
 const f=await fixture(t);await f.api.setInteractionAuthorization(f.request('join','join'));await f.create('record');const batch=await f.read();
 const request={project_ref:'board',schema_version:VERSION,authorization_epoch:batch.authorization_epoch,after_cursor:0,limit:100};
 await assert.rejects(f.api.readInteractionFacts({...request,schema_version:'1.0.0' as typeof VERSION}),{code:'unsupported_schema_version'});
 await assert.rejects(f.api.readInteractionFacts({...request,secret:'x'} as typeof request),{code:'unknown_field'});
 await assert.rejects(f.api.readInteractionFacts({...request,after_cursor:9999}),{code:'cursor_gap'});
 await f.host.withProject(f.ref,r=>r.store.db.prepare("UPDATE casebook_interaction_facts SET body=json_set(body,'$.outcome','threw') WHERE seq=1").run());
 await assert.rejects(f.read(),{code:'source_projection_invalid'});
});
test('both purpose grants are atomic, background revocation deletes text without changing source facts',async t=>{
 const f=await fixture(t);await f.api.setInteractionAuthorization(f.request('join','join'));await f.create('context','历史目标标题');const batch=await f.read();
 const context=await f.api.readInteractionAuthorization({project_ref:'board',purpose:CONTEXT_PURPOSE}) as {authorization_epoch:string};
 const query={project_ref:'board',schema_version:VERSION,authorization_epoch:batch.authorization_epoch,context_authorization_epoch:context.authorization_epoch,operation_ids:batch.facts.map(x=>x.operation_id)};
 assert.equal((await f.api.readGoalContexts(query)).contexts[0]?.goal_title,'历史目标标题');
 await f.api.setInteractionAuthorization(f.request('remove','remove'));
 await assert.rejects(f.api.readGoalContexts(query),{code:'not_authorized'});
 const count=await f.host.withProject(f.ref,r=>r.store.db.prepare('SELECT COUNT(*) n FROM casebook_goal_contexts').get() as {n:number});assert.equal(count.n,0);
});
test('recovery refuses missing files, old/future schemas and missing unnumbered upgrades without changing them',async t=>{
 const f=await fixture(t);const missing=molisWorkHostProjectReference({databasePath:join(f.dir,'absent.db'),boardId:'missing'});
 await assert.rejects(f.host.restoreExistingProject(missing),{code:'project_recovery_missing'});assert.equal(existsSync(missing.storage_key),false);
 const {LocalSqliteStorage}=await import('@molis-ai/molis-work-storage');
 for(const [sql,code] of [["DELETE FROM schema_migrations WHERE migration_id=36",'project_recovery_requires_migration'],["INSERT INTO schema_migrations VALUES(39,'future')",'project_recovery_unsupported_schema'],["ALTER TABLE goal_event_requirements DROP COLUMN source_json",'project_recovery_requires_migration']] as const){
  const ref=molisWorkHostProjectReference({databasePath:join(f.dir,randomBytes(6).toString('hex')+'.db'),boardId:'bad'});
  await f.host.client(ref).invoke(initializeBoardCapability,{board_id:'bad',title:'坏夹具',actor_id:'user',idempotency_key:'init'});
  await f.host.withProject(ref,r=>r.store.db.exec(sql));await f.host.closeProject(ref);
  await assert.rejects(f.host.restoreExistingProject(ref),{code});assert.equal(f.host.status().projects.some(x=>x.storage_key===ref.storage_key),false);
  const check=new LocalSqliteStorage(ref.storage_key,{readonly:true});assert.ok(check.db.open);check.close();
  await f.create(randomBytes(4).toString('hex'));
 }
});
test('legacy planning remains explicit delegation, not inferred from the current workflow',async t=>{
 const f=await fixture(t);assert.throws(()=>f.api.readPlanningEvents({}),{code:'legacy_planning_provider_required'});
});

test('an older Molis owner is rejected without sending an empty legacy migration checklist',async t=>{
 const f=await fixture(t);
 await f.host.withProject(f.ref,r=>r.store.db.exec('DELETE FROM schema_migrations WHERE migration_id=38'));
 await f.host.closeProject(f.ref);
 await assert.rejects(f.host.restoreExistingProject(f.ref),error=>{
  assert.equal((error as {code:string}).code,'project_recovery_requires_migration');
  assert.equal((error as {details?:unknown}).details,undefined);
  return true;
 });
});
