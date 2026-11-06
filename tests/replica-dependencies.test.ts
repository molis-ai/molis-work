import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {partitionedReplica} from '@molis-ai/molis-work-module-sync-replication';
import {createSqliteReplica,replicaSchemaSql,initializeReplica,namespacedReplicaDatabase,replicaMarkSql,queueReplicaChange} from '@molis-ai/molis-work-storage';

test('missing dependencies persist, retry atomically, and never echo or overwrite a local edit',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER content_change AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
  let ready=false;
  const owner={authorize(){},read(key:string){return db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null;},apply(key:string,value:unknown){
    db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value);
    if(!ready)throw Object.assign(new Error('关联成果版本尚未到达'),{code:'example.sync_dependencies',details:{sync_waiting:true}});
  }};
  let r=createSqliteReplica(db,owner);
  r.receive({key:'doc',operationId:'a:1',base:0,revision:1,value:'old'});
  r.receive({key:'doc',operationId:'a:2',base:1,revision:2,value:'latest'});
  assert.equal(owner.read('doc'),null,'failed owner apply rolls back partial writes');assert.equal(r.cursor(),2);
  assert.equal(r.conflicts()[0].waiting,true);
  r=createSqliteReplica(db,owner);ready=true;r.retryWaiting!();assert.equal(owner.read('doc'),'latest');assert.equal(r.conflicts().length,0);assert.equal(r.next(),null);
  ready=false;r.receive({key:'second',operationId:'a:3',base:0,revision:3,value:'remote'});
  db.prepare('INSERT INTO content VALUES (?,?)').run('second','local');ready=true;r.retryWaiting!();
  assert.equal(owner.read('second'),'local');assert.equal(r.conflicts()[0].waiting,false);assert.equal(r.next(),null);
});

test('namespaced current replicas keep independent receipts and cursors',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const a=namespacedReplicaDatabase(db,'artifacts'),b=namespacedReplicaDatabase(db,'pages');
  a.exec(replicaSchemaSql());b.exec(replicaSchemaSql());
  initializeReplica(a);initializeReplica(a);initializeReplica(b);
  const owner={authorize(){},read(){return null;},apply(){}};
  const ra=createSqliteReplica(a,owner),rb=createSqliteReplica(b,owner);
  ra.receive({key:'one',operationId:'remote',base:0,revision:5,value:null});assert.equal(ra.cursor(),5);assert.equal(rb.cursor(),0);
  assert.equal(a.prepare('PRAGMA table_info(replica_conflicts)').all().filter(r=>r.name==='waiting').length,1);
  assert.throws(()=>namespacedReplicaDatabase(db,'unsafe;DROP'),/INVALID/);
});

test('partition receipt survives a crash before shared cursor advancement without applying twice',t=>{
  const home=mkdtempSync(join(tmpdir(),'partition-sync-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);let applied=0,fail=false;
  const local=createSqliteReplica(db,{authorize(){},read(){return null;},apply(){applied++;}});
  const options={home,namespace:'artifacts',authorize(){if(fail)throw new Error('CRASH_AFTER_RECEIPT');},partitions:()=>['project'],partition:()=> 'project',withPartition<T>(_id:string,run:(adapter:typeof local)=>T){const result=run(local);if(local.cursor()===4)fail=true;return result;}};
  const event={key:'version',operationId:'remote:1',base:0,revision:4,value:{text:'fixed'}};
  assert.throws(()=>partitionedReplica(options).receive(event),/CRASH/);assert.equal(local.cursor(),4);assert.equal(applied,1);
  fail=false;const restored=partitionedReplica({...options,withPartition<T>(_id:string,run:(adapter:typeof local)=>T){return run(local);}});
  assert.equal(restored.cursor(),0);restored.receive(event);assert.equal(restored.cursor(),4);assert.equal(applied,1);
});

test('PERSAF-03 old journal shapes are refused untouched, never patched at runtime',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec("CREATE TABLE replica_conflicts(key TEXT PRIMARY KEY,event TEXT NOT NULL,reason TEXT NOT NULL); INSERT INTO replica_conflicts VALUES ('key','{}','preserve');");
 const before=db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
 assert.throws(()=>initializeReplica(db));
 assert.deepEqual(db.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),before);
 assert.equal(db.prepare('SELECT reason FROM replica_conflicts').get()?.reason,'preserve');
});

test('PCSYNC-10 deletion-only filtering preserves uncertain frozen uploads and forwards through partitions',t=>{
  const home=mkdtempSync(join(tmpdir(),'quota-replica-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  const content=new Map<string,unknown>([['positive',{text:'first'}]]);
  const local=createSqliteReplica(db,{authorize(){},read:key=>content.get(key)??null,apply(){}});
  queueReplicaChange(db,'positive');const frozen=local.next()!;
  content.set('positive',{text:'newer'});queueReplicaChange(db,'positive');queueReplicaChange(db,'deleted');
  const wrapped=partitionedReplica({home,namespace:'quota',authorize(){},partitions:()=>['p'],partition:()=> 'p',withPartition<T>(_id:string,run:(adapter:typeof local)=>T){return run(local);}});
  const deletion=wrapped.next({deletionsOnly:true})!;assert.equal(deletion.key,'deleted');assert.equal(deletion.value,null);
  assert.deepEqual(wrapped.next({deletionsOnly:true}),deletion,'delete receipt remains stable');
  local.receive({...deletion,revision:1});assert.equal(wrapped.next({deletionsOnly:true}),null);
  assert.deepEqual(local.next(),frozen,'pending positive body was not replaced or discarded');
  local.receive({...frozen,revision:2});const newer=local.next()!;
  assert.deepEqual(newer.value,{text:'newer'});assert.equal(newer.base,2);assert.notEqual(newer.operationId,frozen.operationId);
});

test('PCSYNC-20 receive inspection has no effects and cannot authorize a stale lifecycle application',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER content_change AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
  let allowed=true,applied=0;
  const replica=createSqliteReplica(db,{authorize(){if(!allowed)throw new Error('REVOKED');},
    read:key=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,
    apply(key,value){applied++;db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value);}});
  const snapshot=()=>['replica_state','replica_heads','replica_changes','replica_outbox','replica_conflicts','content'].map(table=>db.prepare('SELECT * FROM '+table).all());
  const deletion={key:'project',operationId:'remote:1',base:0,revision:1,value:null};
  const before=snapshot();assert.equal(replica.inspectReceive(deletion),'apply');assert.deepEqual(snapshot(),before);assert.equal(applied,0);
  // Runtime release yields. An edit committed meanwhile must turn the actual receive into a conflict.
  await Promise.resolve();db.prepare('INSERT INTO content VALUES (?,?)').run('project','new local edit');
  assert.equal(replica.inspectReceive(deletion),'conflict');replica.receive(deletion);
  assert.equal(applied,0);assert.equal(db.prepare('SELECT value FROM content').get()?.value,'new local edit');assert.equal(replica.conflicts().length,1);
  const conflicted=snapshot();assert.equal(replica.inspectReceive(deletion),'ignore');assert.deepEqual(snapshot(),conflicted);
  const other={key:'other',operationId:'remote:2',base:0,revision:2,value:'remote'};
  assert.equal(replica.inspectReceive(other),'apply');allowed=false;
  assert.throws(()=>replica.receive(other),/REVOKED/);assert.throws(()=>replica.inspectReceive(other),/REVOKED/);
  assert.deepEqual(snapshot(),conflicted);
});

test('PCSYNC-20 receive inspection preserves frozen receipts and rechecks newer heads',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  let applied=0;const replica=createSqliteReplica(db,{authorize(){},read:()=>({text:'frozen'}),apply(){applied++;}});
  queueReplicaChange(db,'project');const pending=replica.next()!;const event={...pending,revision:3};
  const before=db.prepare('SELECT * FROM replica_outbox').all();
  assert.equal(replica.inspectReceive(event),'acknowledge');assert.deepEqual(db.prepare('SELECT * FROM replica_outbox').all(),before);assert.equal(replica.cursor(),0);
  assert.throws(()=>replica.inspectReceive({...event,value:{text:'forged'}}),/回执/);assert.deepEqual(db.prepare('SELECT * FROM replica_outbox').all(),before);
  replica.acknowledge(event.key,event.operationId,event.revision);
  assert.equal(replica.inspectReceive(event),'cursor');assert.equal(replica.cursor(),0);
  replica.receive(event);assert.equal(replica.cursor(),3);assert.equal(applied,0);
  const old={key:'second',operationId:'remote:old',base:0,revision:4,value:'old'};
  assert.equal(replica.inspectReceive(old),'apply');replica.receive({...old,operationId:'remote:new',revision:5,value:'new'});
  assert.equal(replica.inspectReceive(old,{retry:true}),'ignore');replica.receive(old,{retry:true});assert.equal(applied,1);
  const missing={key:'third',operationId:'remote:missing',base:0,revision:2,value:'missed'};
  assert.equal(replica.inspectReceive(missing),'ignore');assert.equal(replica.inspectReceive(missing,{retry:true}),'apply');
});

test('PCSYNC-20 project change inspection includes deleted keys, frozen uploads and waiting conflicts without settling them',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
 let allowed=true;const authorize=()=>{if(!allowed)throw new Error('REVOKED');};
 const replica=createSqliteReplica(db,{authorize,belongsToProject:(key,project)=>key.split(':')[0]===project,read:()=>null,
  apply(){throw Object.assign(new Error('dependency pending'),{details:{sync_waiting:true}});}});
 assert.equal(replica.hasProjectChanges!('a'),false);
 queueReplicaChange(db,'a:deleted');const frozen=replica.next()!;
 const before=db.prepare('SELECT * FROM replica_outbox').all();
 assert.equal(replica.hasProjectChanges!('a'),true);assert.equal(replica.hasProjectChanges!('b'),false);
 assert.deepEqual(db.prepare('SELECT * FROM replica_outbox').all(),before);assert.equal(replica.cursor(),0);
 // An uncertain upload alone remains evidence even if its old journal prefix is absent.
 db.prepare('DELETE FROM replica_changes').run();assert.equal(replica.hasProjectChanges!('a'),true);
 replica.acknowledge(frozen.key,frozen.operationId,1);assert.equal(replica.hasProjectChanges!('a'),false);
 replica.receive({key:'b:waiting',operationId:'remote',base:0,revision:2,value:null});
 assert.equal(replica.hasProjectChanges!('b'),true);assert.equal(replica.hasProjectChanges!('a'),false);
 assert.equal(replica.conflicts()[0].waiting,true);
 allowed=false;assert.throws(()=>replica.hasProjectChanges!('b'),/REVOKED/);
 const unknown=createSqliteReplica(db,{authorize(){},read:()=>null,apply(){}});
 assert.throws(()=>unknown.hasProjectChanges!('empty'),/尚未提供项目变更判断/,'unsupported scope is never treated as clean');
});


test('PCSYNC-20 project partition inspection uses trusted mapping and refuses unavailable partitions without opening another owner',t=>{
 const home=mkdtempSync(join(tmpdir(),'partition-project-changes-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
 const replica=createSqliteReplica(db,{authorize(){},read:()=>null,apply(){}});queueReplicaChange(db,'opaque-owner-key');
 let available=true;const opened:string[]=[];
 const options={home,namespace:'scope-observation',authorize(){},partitions:()=>available?['trusted:a','trusted:b']:[],partition:()=> 'trusted:a',projectPartition:(id:string)=>'trusted:'+id,
  withPartition<T>(id:string,run:(r:typeof replica)=>T){opened.push(id);assert.equal(id,'trusted:a');return run(replica);}};
 const scoped=partitionedReplica(options);
 assert.equal(scoped.hasProjectChanges!('a'),true);assert.deepEqual(opened,['trusted:a']);
 const mutation=replica.next()!;db.prepare('DELETE FROM replica_changes').run();
 assert.equal(scoped.hasProjectChanges!('a'),true,'frozen upload alone remains pending in its project partition');
 replica.acknowledge(mutation.key,mutation.operationId,1);
 assert.equal(scoped.hasProjectChanges!('a'),false);assert.deepEqual(opened,['trusted:a','trusted:a','trusted:a']);
 available=false;assert.throws(()=>scoped.hasProjectChanges!('a'),/暂不可用/);assert.equal(opened.length,3);
 assert.throws(()=>partitionedReplica({...options,projectPartition:undefined}).hasProjectChanges!('a'),/尚未提供项目分区判断/);
});

test('PCSYNC-20 retained project inspection honors sealed bindings and revocation without changing receipts',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
 let revoked=false,revokeOnOpen=false,opens=0;
 const protection={seal(bytes:Uint8Array,binding:string){return Buffer.from(JSON.stringify([binding,Buffer.from(bytes).toString('base64')]));},open(bytes:Uint8Array,binding:string){
  opens++;const [stored,body]=JSON.parse(Buffer.from(bytes).toString());assert.equal(stored,binding);if(revokeOnOpen)revoked=true;return Buffer.from(body,'base64');
 }};
 const owner={authorize(){if(revoked)throw new Error('REVOKED');},protection,read(){return {project:'old'};},apply(){},belongsToProject(_key:string,projectId:string,retained:()=>readonly {value:unknown}[]){
  if(projectId==='current')return true;return retained().some(record=>(record.value as {project:string})?.project===projectId);
 }};
 queueReplicaChange(db,'item');const replica=createSqliteReplica(db,owner),frozen=replica.next()!;
 const before=db.prepare('SELECT * FROM replica_outbox').all();
 assert.equal(replica.hasProjectChanges!('current'),true);assert.equal(opens,0,'current owner scope needs no protected body');
 assert.equal(replica.hasProjectChanges!('old'),true);assert.equal(opens,1);
 revokeOnOpen=true;assert.throws(()=>replica.hasProjectChanges!('old'),/REVOKED/);assert.deepEqual(db.prepare('SELECT * FROM replica_outbox').all(),before);
 revoked=false;revokeOnOpen=false;db.prepare('UPDATE replica_outbox SET operation=?').run(JSON.stringify(frozen));
 assert.throws(()=>replica.hasProjectChanges!('old'),/未使用当前本机保护/,'protected inspection must refuse plaintext fallback');
});

test('PCSYNC-20 passive project inspection reads retained partitions without enabling upload or receive',t=>{
 const home=mkdtempSync(join(tmpdir(),'passive-partition-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const calls:{id:string;passive:boolean}[]=[];
 const local={counts:()=>({pending:1,conflicts:0})} as import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncReplicaAdapter;
 const replica=partitionedReplica({home,namespace:'passive',authorize(){},partitions:()=>[],projectPartitions:()=>['archived'],partition:()=> 'archived',projectPartition:p=>p,
  withPartition(id,run,passive){calls.push({id,passive:!!passive});if(!passive)throw new Error('DISABLED');return run(local);}});
 assert.equal(replica.next(),null);assert.equal(replica.hasProjectChanges!('archived'),true);assert.deepEqual(calls,[{id:'archived',passive:true}]);
 assert.throws(()=>replica.receive({key:'asset',operationId:'remote',base:0,revision:1,value:null}),/DISABLED/);
});
