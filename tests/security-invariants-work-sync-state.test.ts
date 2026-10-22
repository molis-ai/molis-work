import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {openWorkSessionRegistry} from '@molis-ai/molis-work-app-local-host';
import {SESSION_REGISTRY_OWNER} from '@molis-ai/molis-work-module-private-work-context';
import {ensureStorageSpace,personalStorageSpace,borrowedReplicaDatabase,namespacedReplicaDatabase,createSqliteReplica,type ReplicaInputValue} from '@molis-ai/molis-work-storage';

const connection=(db:Database.Database)=>namespacedReplicaDatabase(borrowedReplicaDatabase({exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[]>(sql)}),'work_sessions');

function home(t:TestContext,personal=true){
  const directory=mkdtempSync(join(tmpdir(),'work-sync-state-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  ensureStorageSpace(directory,personal?personalStorageSpace('https://auth.example.test','work','alice'):undefined);return directory;
}
test('S-60 PCSYNC-12 a frozen complete v7 Session database is refused before WAL or content initialization',async t=>{
  const root=home(t),directory=join(root,'sessions');mkdirSync(directory);const path=join(directory,'sessions.db'),db=new Database(path);
  db.exec(readFileSync(new URL('./fixtures/home-store-schemas/sessions-v7.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO session_meta VALUES (?,?)').run('owner',SESSION_REGISTRY_OWNER);
  db.prepare('INSERT INTO session_meta VALUES (?,?)').run('schema_version','7');db.close();const before=readFileSync(path);
  await assert.rejects(openWorkSessionRegistry({homeDirectory:root}),{code:'work.session.registry_reader_too_old'});
  assert.deepEqual(readFileSync(path),before);assert.deepEqual(readdirSync(directory),['sessions.db']);
});

test('S-60 PCSYNC-23 personal Session changes use the normal owner transaction; a rejected event leaves no queued change',async t=>{
  const root=home(t),registry=await openWorkSessionRegistry({homeDirectory:root});t.after(()=>registry.close());
  const session=registry.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true});
  const db=new Database(registry.databasePath);t.after(()=>db.close());
  const replica=createSqliteReplica(connection(db),{authorize(){},read:key=>({key}),apply(){assert.fail('not receiving in this test');}});
  assert.equal(replica.counts().pending,1);const pending=replica.next()!;assert.equal(pending.key,session.session_id);
  replica.acknowledge(pending.key,pending.operationId,1);assert.equal(replica.counts().pending,0);
  db.exec("CREATE TRIGGER refuse_test_event AFTER INSERT ON session_events BEGIN SELECT RAISE(ABORT,'EVENT_REJECTED'); END;");
  assert.throws(()=>registry.appendEvent({session_id:session.session_id,source:'molis_work',kind:'user_message',source_id:'rejected',content:'private text'}),/EVENT_REJECTED/);
  assert.equal(registry.eventCount(session.session_id),0);assert.equal(replica.counts().pending,0,'no sidecar log can survive a rolled-back owner event');
  db.exec('DROP TRIGGER refuse_test_event');registry.appendEvent({session_id:session.session_id,source:'molis_work',kind:'user_message',source_id:'accepted',content:'private text'});
  assert.equal(replica.counts().pending,1);assert.equal(replica.next()!.key,session.session_id);
});

test('S-60 PCSYNC-01 ordinary local-space Session changes do not enqueue personal uploads',async t=>{
  const root=home(t,false),registry=await openWorkSessionRegistry({homeDirectory:root});t.after(()=>registry.close());
  const session=registry.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true});
  registry.appendEvent({session_id:session.session_id,source:'molis_work',kind:'user_message',source_id:'local',content:'local text'});
  const db=new Database(registry.databasePath);try{
    const replica=createSqliteReplica(connection(db),{authorize(){},read:()=>null,apply(){}});
    assert.equal(replica.counts().pending,0);
  }finally{db.close();}
});

test('S-60 PCSYNC-23 passive imported Handoffs preserve observed states but cannot resume, edit, dispatch or cancel',async t=>{
  const root=home(t),registry=await openWorkSessionRegistry({homeDirectory:root});let closed=false;t.after(()=>{if(!closed)registry.close();});
  const session=registry.createSession({runtime_id:'source',actor_id:'person',user_confirmed:true,project_id:'project',current_goal_id:'goal'});
  const draft=registry.createHandoffDraft({source_session_id:session.session_id,source_project_id:'project',source_goal_id:'goal',target_runtime_id:'destination',target_project_id:'project',content:'retained history',actor_id:'person'});
  registry.markHandoffSending(draft.package_id);
  const db=new Database(registry.databasePath);db.prepare("UPDATE session_handoffs SET sync_passive=1,sync_destination_session_id='historical-destination',updated_at='2000-01-01T00:00:00.000Z' WHERE package_id=?").run(draft.package_id);db.close();
  registry.close();closed=true;const reopened=await openWorkSessionRegistry({homeDirectory:root});t.after(()=>reopened.close());
  const before=reopened.getHandoff(draft.package_id);assert.equal(before.state,'sending');assert.equal(before.retryable,false);
  assert.equal(before.destination_session_id,'historical-destination');assert.equal(reopened.latestPendingHandoff(session.session_id),null);
  const actions=[()=>reopened.markHandoffSending(draft.package_id),()=>reopened.cancelHandoff(draft.package_id),
    ()=>reopened.updateHandoffDraft({package_id:draft.package_id,target_runtime_id:'destination',target_project_id:'project',content:'edited',actor_id:'person'}),
    ()=>reopened.attachHandoffDestination({package_id:draft.package_id,destination_session_id:session.session_id,delivery_mode:'native'}),
    ()=>reopened.markHandoffFailed({package_id:draft.package_id,error_code:'synthetic.failure',error_message:'not allowed',retryable:true}),
    ()=>reopened.markHandoffSent({package_id:draft.package_id,destination_session_id:session.session_id,delivery_mode:'native'})];
  for(const action of actions){assert.throws(action,{code:'work.session.handoff_invalid_state'});assert.deepEqual(reopened.getHandoff(draft.package_id),before);}
});

for(const [name,statement,expected] of [
  ['journal-state','DELETE FROM work_sessions_replica_state',/日志状态缺失/],
  ['event-table','DROP TABLE session_events',/no such table: session_events/],
  ['ledger-table','DROP TABLE context_edges',/no such table: context_edges/],
  ['space-binding','DELETE FROM molis_storage_space',/空间记录缺失/],
] as const)test(`S-60 PCSYNC-12 an existing v8 ${name} loss is refused without recreating tables, device identity or binding`,async t=>{
  const root=home(t),registry=await openWorkSessionRegistry({homeDirectory:root}),file=registry.databasePath;registry.close();
  const db=new Database(file);db.exec(statement);db.close();const before=readFileSync(file);
  await assert.rejects(openWorkSessionRegistry({homeDirectory:root}),expected);
  assert.deepEqual(readFileSync(file),before);
});
