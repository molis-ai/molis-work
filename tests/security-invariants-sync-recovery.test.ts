import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { createSqliteReplica, initializeReplica, replicaSchemaSql, replicaMarkSql } from '@molis-ai/molis-work-storage';
import { createSyncConflictState, defineErrorCodes } from '@molis-ai/molis-work-plugin-sdk';
import { createSyncItemFixture } from './fixtures/sync-items.js';
function replica(db:Parameters<typeof createSqliteReplica>[0],owner:Parameters<typeof createSqliteReplica>[1]){return createSqliteReplica(db,{...owner,conflictState:createSyncConflictState});}

test('S-127 PCSYNC-15 missing comparison port refuses user confirmation and preserves all original content',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);let applied=0;
 queueLocal();function queueLocal(){db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run('asset');}
 const r=createSqliteReplica(db,{authorize(){},read:()=>({body:'unique local'}),apply(){applied++;}});
 r.receive({key:'asset',operationId:'remote',base:0,revision:1,value:{body:'remote'}});
 assert.throws(()=>r.inspectConflict!('asset'),/未接入内容比较指纹/);
 assert.throws(()=>r.resolve('asset','remote',1,'a'.repeat(64)),/未接入内容比较指纹/);
 assert.equal(applied,0);assert.equal(r.counts().pending,1);assert.equal(r.conflicts().length,1);assert.deepEqual(r.recoveries!(),[]);
});

test('S-127 PCSYNC-16 conflict decisions bind the inspected revision; unchosen content stays recoverable',t=>{
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
test('S-127 PCSYNC-06/16 a revoked restore rolls back content, applying flag, history and upload queue',t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);db.exec('CREATE TABLE content(key TEXT PRIMARY KEY,value TEXT);CREATE TRIGGER dirty AFTER INSERT ON content BEGIN '+replicaMarkSql('NEW.key')+' END;');
 let active=true,revoke=false;
 const r=replica(db,{authorize(){if(!active)throw new Error('REVOKED');},read:key=>db.prepare('SELECT value FROM content WHERE key=?').get(key)?.value??null,apply(key,value){db.prepare('INSERT OR REPLACE INTO content VALUES (?,?)').run(key,value as string);if(revoke)active=false;}});
 db.prepare('INSERT INTO content VALUES (?,?)').run('asset','local');r.receive({key:'asset',operationId:'r:1',base:0,revision:1,value:'remote'});r.resolve('asset','remote',1);
 const saved=r.recoveries!()[0]!,count=db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n;revoke=true;
 assert.throws(()=>r.restoreRecovery!(saved.id,'local',1),/REVOKED/);assert.equal(db.prepare('SELECT value FROM content').get()!.value,'remote');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n,count);assert.equal(db.prepare('SELECT applying FROM replica_state').get()!.applying,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,0);
});

test('S-127 PCSYNC-19/26 receipt acknowledgement never drops a later local edit or skips a remote download',t=>{
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

test('S-127 PCSYNC-15/16 a comparison confirmed after a later local edit is refused atomically',t=>{
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

const retainedScopeErrors = defineErrorCodes('retained_owner', { hidden: 'forbidden' });

test('retained bodies keep their original scope after the current row disappears or moves', t => {
  const db = new DatabaseSync(':memory:');
  db.exec(replicaSchemaSql());
  initializeReplica(db);
  t.after(() => db.close());
  const key = 'moved-item';
  const event = { key, value: { project: 'hidden', body: 'private remote history' }, base: 0, revision: 1, operationId: 'remote' };
  let active = true;
  let applies = 0;
  const owner = {
    authorize() {
      if (!active) throw new ActionError('actions.forbidden', 'account stopped');
    },
    authorizeKey(_key: string, value?: unknown) {
      if (value && typeof value === 'object' && 'project' in value && value.project === 'hidden') {
        throw retainedScopeErrors.hidden('hidden project');
      }
    },
    read: () => null,
    apply() {
      applies++;
    },
    canUpload: () => true,
  };
  const r = createSqliteReplica(db, owner);
  db.prepare('INSERT INTO replica_conflicts(key,event,reason,waiting) VALUES (?,?,?,0)').run(key, JSON.stringify(event), 'retained');
  db.prepare('INSERT INTO replica_resolutions(key,choice,local_json,remote_json) VALUES (?,?,?,?)').run(key, 'remote', JSON.stringify({ project: 'visible', body: 'local' }), JSON.stringify(event));
  assert.deepEqual(r.conflicts(), [], 'a visible current key does not expose an inaccessible retained remote conflict');
  assert.deepEqual(r.recoveries!(), [], 'recovery metadata requires access to both saved branches, not only the current key');
  db.prepare('UPDATE replica_resolutions SET local_json=?,remote_json=? WHERE id=1').run(JSON.stringify(event.value), JSON.stringify({ ...event, value: { project: 'visible', body: 'remote' } }));
  assert.deepEqual(r.recoveries!(), [], 'an inaccessible retained local branch is filtered even when its remote branch is visible');
  db.prepare('UPDATE replica_resolutions SET local_json=?,remote_json=? WHERE id=1').run(JSON.stringify({ project: 'visible', body: 'local' }), JSON.stringify(event));
  assert.throws(() => r.inspectConflict!(key), /hidden project/, 'a missing local row cannot authorize a retained remote body');
  assert.throws(() => r.inspectRecovery!('1'), /hidden project/, 'both historical branches are checked, even when the key now belongs to a visible project');
  assert.throws(() => r.resolve(key, 'local', 1), /hidden project/, 'choosing local cannot settle an inaccessible remote branch');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_conflicts').get()!.n, 1);
  db.prepare('DELETE FROM replica_conflicts').run();
  for (const choice of ['local', 'remote'] as const) assert.throws(() => r.restoreRecovery!('1', choice, 0), /hidden project/);
  assert.equal(applies, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_resolutions').get()!.n, 1);
  db.prepare('INSERT INTO replica_changes(key) VALUES (?)').run(key);
  const frozen = { key, value: event.value, operationId: 'frozen', base: 0 };
  db.prepare('INSERT INTO replica_outbox(key,through_seq,operation) VALUES (?,?,?)').run(key, 1, JSON.stringify(frozen));
  assert.throws(() => r.next(), /hidden project/, 'a frozen upload cannot borrow the moved current row scope');
  assert.throws(() => r.acknowledge(key, 'frozen', 2), /hidden project/, 'a late receipt cannot settle the revoked original scope');
  assert.throws(() => r.receive(event), /hidden project/);
  assert.equal(r.cursor(), 0);
  assert.equal(r.counts().pending, 1);
  active = false;
  assert.throws(() => r.recoveries!(), /account stopped/, 'list filtering must not swallow account revocation');
  active = true;
  owner.authorizeKey = () => {
    active = false;
    throw new ActionError('actions.forbidden', 'hidden project');
  };
  assert.throws(() => r.recoveries!(), /account stopped/, 'revocation during a failed key check must propagate instead of becoming an empty list');
  active = true;
  owner.authorizeKey = () => {
    throw new Error('owner check failed');
  };
  assert.throws(() => r.recoveries!(), /owner check failed/, 'only a current owner scope refusal is filtered');
});

test('S-134 PCSYNC-14/26 malformed JSON diagnostics never copy asset snippets into failure or conflict reasons', async t => {
  const f = createSyncItemFixture(t);
  f.repair();
  f.edit('broken', 'unique original');
  f.setSyntax(true);
  await f.client.run();
  assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value, 'unique original');
  assert.equal(f.replica.counts().pending, 1);
  assert.doesNotMatch(JSON.stringify(f.client.status()), /PRIVATE_DIAGNOSTIC/);
  const incoming = createSyncItemFixture(t);
  incoming.repair();
  incoming.setSyntax(true);
  incoming.replica.receive({ operationId: 'remote:1', key: 'broken', base: 0, revision: 1, value: 'PRIVATE_DIAGNOSTIC_SENTINEL' });
  assert.equal(incoming.db.prepare('SELECT value FROM items WHERE key=?').get('broken'), undefined);
  assert.equal(incoming.replica.counts().conflicts, 1);
  assert.doesNotMatch(JSON.stringify(incoming.replica.conflicts()), /PRIVATE_DIAGNOSTIC/);
  const download = createSyncItemFixture(t);
  download.repair();
  download.setSyntax(true);
  download.events.push({ operationId: 'remote:1', key: 'broken', base: 0, revision: 1, value: 'PRIVATE_DIAGNOSTIC_SENTINEL' });
  await download.client.run();
  assert.equal(download.client.status().collections[0]!.failures.length, 1);
  assert.doesNotMatch(JSON.stringify(download.client.status()), /PRIVATE_DIAGNOSTIC/);
});
