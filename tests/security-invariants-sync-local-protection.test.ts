import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { createSqliteReplica, initializeReplica, queueReplicaChange, replicaSchemaSql, createLazyFileSecretStore, createLocalPayloadProtection } from '@molis-ai/molis-work-storage';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';

// A real AEAD provider exercises the technical port. This fixture is not product key management.
function protection(key: Uint8Array, afterSeal = () => {}): SyncLocalProtection {
  return {
    seal(bytes, binding) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(binding));
      const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
      afterSeal(); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    open(bytes, binding) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    },
  };
}

test('S-57 PCSYNC-23 protected outbox, conflicts and recovery bodies round-trip without persisting plaintext', t => {
  const root = mkdtempSync(join(tmpdir(), 'protected-replica-'));t.after(() => rmSync(root, {recursive:true,force:true}));
  const file = join(root, 'owner.db');let db = new DatabaseSync(file);t.after(() => db.close());
  db.exec(replicaSchemaSql());initializeReplica(db);
  let value: unknown = 'private-local-sentence-🙂';
  const owner = () => ({ authorize() {}, protection:createLocalPayloadProtection({
    secrets:createLazyFileSecretStore(root),keyRef:'system:test:protected-replica',scope:'alice:work:history',authorize(){},
    hasProtectedData:()=>!!db.prepare('SELECT 1 FROM replica_outbox UNION ALL SELECT 1 FROM replica_conflicts UNION ALL SELECT 1 FROM replica_resolutions LIMIT 1').get(),
  }), conflictState:createSyncConflictState,
    read:() => value, apply(_key:string,next:unknown) {value=next;} });
  let replica = createSqliteReplica(db, owner());queueReplicaChange(db, 'asset');
  const frozen = replica.next()!;value='a-later-private-sentence';queueReplicaChange(db,'asset');
  db.close();db=new DatabaseSync(file);replica=createSqliteReplica(db,owner());
  assert.deepEqual(replica.next(),frozen,'reopening preserves the exact frozen request');
  replica.acknowledge('asset',frozen.operationId,1);
  assert.equal(replica.counts().pending,1,'the later local edit is still pending');
  replica.receive({key:'asset',operationId:'remote',base:1,revision:2,value:'remote-private-sentence'});
  const view=replica.inspectConflict!('asset')!;
  assert.equal(view.local,'a-later-private-sentence');assert.equal(view.remote,'remote-private-sentence');
  replica.resolve('asset','remote',view.revision,view.state);
  const retained=replica.recoveries!()[0]!;
  assert.equal(replica.inspectRecovery!(retained.id)!.local,'a-later-private-sentence');
  replica.restoreRecovery!(retained.id,'local',retained.revision);assert.equal(value,'a-later-private-sentence');
  const restored=replica.next()!;replica.receive({...restored,revision:3});
  assert.equal(replica.counts().pending,0);
  const disk=readFileSync(file);
  for(const phrase of ['private-local-sentence','a-later-private-sentence','remote-private-sentence']) assert.equal(disk.includes(Buffer.from(phrase)),false,phrase);
  for(const row of db.prepare('SELECT local_json,remote_json FROM replica_resolutions').all()) {
    assert.match(String(row.local_json),/^sealed-sync:1:/);assert.match(String(row.remote_json),/^sealed-sync:1:/);
  }
});

test('S-57 PCSYNC-01 a protected owner refuses plaintext, wrong keys and cross-asset ciphertext', t => {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  const key=randomBytes(32),owner={authorize(){},protection:protection(key),read:(id:string)=>'private-'+id,apply(){assert.fail('this test never applies content')}};
  const replica=createSqliteReplica(db,owner);queueReplicaChange(db,'first');const first=replica.next()!;
  const sealed=db.prepare('SELECT operation FROM replica_outbox WHERE key=?').get('first')!.operation;
  assert.throws(()=>createSqliteReplica(db,{...owner,protection:protection(randomBytes(32))}).next());
  replica.acknowledge('first',first.operationId,1);queueReplicaChange(db,'second');replica.next();
  db.prepare('UPDATE replica_outbox SET operation=? WHERE key=?').run(sealed,'second');
  assert.throws(()=>replica.next(),'ciphertext is bound to the original asset');
  db.prepare('UPDATE replica_outbox SET operation=? WHERE key=?').run(JSON.stringify({operationId:'forged',key:'second',base:0,value:'plaintext'}),'second');
  assert.throws(()=>replica.next(),/未使用当前本机保护/);
  assert.equal(replica.counts().pending,1);assert.equal(replica.cursor(),0);
});

test('S-57 PCSYNC-06 revocation during protection rolls back technical writes and keeps the original queue',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(replicaSchemaSql());initializeReplica(db);
  let active=true;
  const replica=createSqliteReplica(db,{authorize(){if(!active)throw new Error('REVOKED');},
    protection:protection(randomBytes(32),()=>{active=false;}),read:()=>({text:'private original'}),apply(){assert.fail('not applied')}});
  queueReplicaChange(db,'asset');assert.throws(()=>replica.next(),/REVOKED/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_outbox').get()!.n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM replica_changes').get()!.n,1);
});
