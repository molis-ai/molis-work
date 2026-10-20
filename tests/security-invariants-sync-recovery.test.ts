import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createSqliteReplica,initializeReplica,replicaSchemaSql,replicaMarkSql} from '@molis-ai/molis-work-storage';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
function replica(db:Parameters<typeof createSqliteReplica>[0],owner:Parameters<typeof createSqliteReplica>[1]){return createSqliteReplica(db,{...owner,conflictState:createSyncConflictState});}

test('S-63 PCSYNC-15 missing comparison port refuses user confirmation and preserves all original content',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);let applied=0;
 queueLocal();function queueLocal(){db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run('asset');}
 const r=createSqliteReplica(db,{authorize(){},read:()=>({body:'unique local'}),apply(){applied++;}});
 r.receive({key:'asset',operationId:'remote',base:0,revision:1,value:{body:'remote'}});
 assert.throws(()=>r.inspectConflict!('asset'),/未接入内容比较指纹/);
 assert.throws(()=>r.resolve('asset','remote',1,'a'.repeat(64)),/未接入内容比较指纹/);
 assert.equal(applied,0);assert.equal(r.counts().pending,1);assert.equal(r.conflicts().length,1);assert.deepEqual(r.recoveries!(),[]);
});

test('S-63 PCSYNC-16 conflict decisions bind the inspected revision; unchosen content stays recoverable',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
 db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER dirty AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
 const owner={authorize(){},read:(key:string)=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,apply(key:string,value:unknown){db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value as string);}};
 const r=replica(db,owner);db.prepare('INSERT INTO content VALUES (?,?)').run('asset','unique local');
 r.receive({key:'asset',operationId:'remote:1',base:0,revision:1,value:'remote'});
 const {state,...view}=r.inspectConflict!('asset')!;assert.match(state,/^[a-f0-9]{64}$/);assert.deepEqual(view,{key:'asset',revision:1,reason:'两台设备修改了同一项，双方内容均已保留',local:'unique local',remote:'remote'});
 r.receive({key:'asset',operationId:'remote:2',base:1,revision:2,value:'newer remote'});
 assert.throws(()=>r.resolve('asset','remote',1),/冲突版本已变化/);assert.equal(owner.read('asset'),'unique local');assert.equal(r.conflicts().length,1);
 r.resolve('asset','remote',2);assert.equal(owner.read('asset'),'newer remote');
 const retained=r.recoveries!()[0]!;assert.equal(r.inspectRecovery!(retained.id)!.local,'unique local');
 r.restoreRecovery!(retained.id,'local',retained.revision);assert.equal(owner.read('asset'),'unique local');
 const mutation=r.next()!;assert.equal(mutation.value,'unique local');assert.equal(mutation.base,2);r.receive({...mutation,revision:3});
 assert.throws(()=>r.restoreRecovery!(retained.id,'local',2),/已有新修改/);assert.equal(owner.read('asset'),'unique local');assert.equal(r.counts().pending,0);
});
test('S-63 PCSYNC-06/16 a revoked restore rolls back content, applying flag, history and upload queue',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER dirty AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
 let active=true,revoke=false;
 const r=replica(db,{authorize(){if(!active)throw new Error('REVOKED');},read:key=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,apply(key,value){db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value as string);if(revoke)active=false;}});
 db.prepare('INSERT INTO content VALUES (?,?)').run('asset','local');r.receive({key:'asset',operationId:'r:1',base:0,revision:1,value:'remote'});r.resolve('asset','remote',1);
 const saved=r.recoveries!()[0]!,count=db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n;revoke=true;
 assert.throws(()=>r.restoreRecovery!(saved.id,'local',1),/REVOKED/);assert.equal(db.prepare('SELECT value FROM content').get()!.value,'remote');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n,count);assert.equal(db.prepare('SELECT applying FROM replica_state').get()!.applying,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,0);
});

test('S-63 PCSYNC-19/26 receipt acknowledgement never drops a later local edit or skips a remote download',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER dirty AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
 let active=true,applies=0;const owner={authorize(){if(!active)throw new Error('REVOKED');},read:(key:string)=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,apply(key:string,value:unknown){applies++;db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value as string);}};
 const r=replica(db,owner);db.prepare('INSERT INTO content VALUES (?,?)').run('asset','first');const frozen=r.next()!;
 db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run('asset','later edit');
 assert.throws(()=>r.acknowledge('asset','foreign operation',7),/不一致/);assert.equal(r.next()!.operationId,frozen.operationId);assert.equal(r.cursor(),0);
 active=false;assert.throws(()=>r.acknowledge('asset',frozen.operationId,7),/REVOKED/);active=true;
 r.acknowledge('asset',frozen.operationId,7);assert.equal(r.cursor(),0);assert.equal(owner.read('asset'),'later edit');assert.equal(r.counts().pending,1);
 r.receive({...frozen,revision:7});assert.equal(owner.read('asset'),'later edit');assert.equal(applies,0,'a replay of the acknowledged head is not an edit or a conflict');assert.equal(r.conflicts().length,0);
 const next=r.next()!;assert.equal(next.base,7);assert.equal(next.value,'later edit');r.acknowledge(next.key,next.operationId,8);assert.equal(r.counts().pending,0);r.acknowledge(next.key,next.operationId,8);
 r.receive({key:'other',operationId:'remote-other',base:0,revision:8,value:'downloaded'});assert.equal(owner.read('other'),'downloaded','per-key head does not skip other assets');assert.equal(r.cursor(),8);
});

test('S-63 PCSYNC-15/16 a comparison confirmed after a later local edit is refused atomically',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
 db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER dirty AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
 const owner={authorize(){},read:(key:string)=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,apply(key:string,value:unknown){db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value as string);}};
 const r=replica(db,owner);db.prepare('INSERT INTO content VALUES (?,?)').run('asset','before comparison');
 r.receive({key:'asset',operationId:'remote',base:0,revision:1,value:'remote content'});const shown=r.inspectConflict!('asset')!;
 db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run('asset','new unique local edit');
 assert.throws(()=>r.resolve('asset','remote',shown.revision,shown.state),/比较内容已变化/);
 assert.equal(owner.read('asset'),'new unique local edit');assert.equal(r.conflicts().length,1);assert.deepEqual(r.recoveries!(),[]);
 const current=r.inspectConflict!('asset')!;r.resolve('asset','remote',current.revision,current.state);
 assert.equal(owner.read('asset'),'remote content');assert.equal(r.inspectRecovery!(r.recoveries!()[0]!.id)!.local,'new unique local edit');
});
