import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {partitionedReplica} from '../modules/sync-replication/src/index.js';
import {createSqliteReplica,initializeReplica,namespacedReplicaDatabase,replicaMarkSql} from '@molis-ai/molis-work-storage';

test('missing dependencies persist, retry atomically, and never echo or overwrite a local edit',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());initializeReplica(db);
  db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER content_change AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
  let ready=false;
  const owner={authorize(){},read(key:string){return db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null;},apply(key:string,value:any){
    db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value);
    if(!ready)throw Object.assign(new Error('关联成果版本尚未到达'),{code:'sync.dependencies'});
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

test('namespaced replica migration keeps existing receipts and independent cursors',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const a=namespacedReplicaDatabase(db,'artifacts'),b=namespacedReplicaDatabase(db,'pages');
  a.exec('CREATE TABLE replica_conflicts(key TEXT PRIMARY KEY,event TEXT NOT NULL,reason TEXT NOT NULL)');
  initializeReplica(a);initializeReplica(a);initializeReplica(b);
  const owner={authorize(){},read(){return null;},apply(){}};
  const ra=createSqliteReplica(a,owner),rb=createSqliteReplica(b,owner);
  ra.receive({key:'one',operationId:'remote',base:0,revision:5,value:null});assert.equal(ra.cursor(),5);assert.equal(rb.cursor(),0);
  assert.equal(a.prepare('PRAGMA table_info(replica_conflicts)').all().filter(r=>r.name==='waiting').length,1);
  assert.throws(()=>namespacedReplicaDatabase(db,'unsafe;DROP'),/INVALID/);
});

test('partition receipt survives a crash before shared cursor advancement without applying twice',t=>{
  const home=mkdtempSync(join(tmpdir(),'partition-sync-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());initializeReplica(db);let applied=0,fail=false;
  const local=createSqliteReplica(db,{authorize(){},read(){return null;},apply(){applied++;}});
  const options={home,namespace:'artifacts',authorize(){if(fail)throw new Error('CRASH_AFTER_RECEIPT');},partitions:()=>['project'],partition:()=> 'project',withPartition<T>(_id:string,run:(adapter:typeof local)=>T){const result=run(local);if(local.cursor()===4)fail=true;return result;}};
  const event={key:'version',operationId:'remote:1',base:0,revision:4,value:{text:'fixed'}};
  assert.throws(()=>partitionedReplica(options).receive(event),/CRASH/);assert.equal(local.cursor(),4);assert.equal(applied,1);
  fail=false;const restored=partitionedReplica({...options,withPartition<T>(_id:string,run:(adapter:typeof local)=>T){return run(local);}});
  assert.equal(restored.cursor(),0);restored.receive(event);assert.equal(restored.cursor(),4);assert.equal(applied,1);
});
