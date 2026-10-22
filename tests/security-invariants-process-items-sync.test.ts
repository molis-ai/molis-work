import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import {
  ArtifactsModule, ProcessItemsModule, createArtifactsSchema, createProcessItemsSchema,
  createProcessItemReplication, validateProcessItemReplication, installProcessItemReplicationJournal, type ArtifactsSqliteDatabase, type PortableProcessItem,
} from '@molis-ai/molis-work-module-artifacts';
import {
  createSqliteReplica, initializeReplica, namespacedReplicaDatabase, replicaMarkSql, replicaSchemaSql, queueReplicaChange,
  type ReplicaDatabase, type ReplicaInputValue, type ReplicaOutputValue,
} from '@molis-ai/molis-work-storage';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';

function fixture(t: TestContext, projectId = 'project-shared') {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE project_root(project_id TEXT PRIMARY KEY); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT);');
  db.prepare('INSERT INTO project_root VALUES (?)').run(projectId);
  const borrowed = db as ArtifactsSqliteDatabase;
  createArtifactsSchema(borrowed); createProcessItemsSchema(borrowed);
  let active = true;
  const options = {
    eventCursor: () => Number((db.prepare('SELECT COALESCE(MAX(seq),0) AS cursor FROM events').get() as { cursor: number }).cursor),
    appendEvent: () => Number(db.prepare('INSERT INTO events(project_id) VALUES (?)').run(projectId).lastInsertRowid),
    now: () => '2026-10-18T00:00:00.000Z',
  };
  const owner = new ProcessItemsModule({ db: borrowed, ...options });
  const context = { spaceId: 'space-alice', projectId, authorize() { if (!active) throw new Error('REVOKED'); } };
  const replication = createProcessItemReplication(borrowed, context, options);
  const publish = (version = 1, text = 'Fixed plan', id = 'coding-plan:session:1') => owner.commands.registerVersion({
    project_id: projectId, artifact_id: id, version, actor_id: 'plugin:coding', artifact_type_id: 'coding.plan.v1', schema_version: 1,
    producer: { plugin_id: 'io.molis.work.coding', plugin_version: '0.3.0', binding_signature: 'official-coding-binding' },
    content: { kind: 'inline', payload: { text } }, ...(version > 1 ? { supersedes_version: version - 1 } : {}),
  });
  return { db, borrowed, owner, context, options, replication, publish, revoke: () => { active = false; } };
}

test('S-56 PCSYNC-22 process items preserve complete fixed versions without entering the library or executing their producer', t => {
  const a = fixture(t), b = fixture(t);
  a.publish(1, 'full-body:'.repeat(40000)); a.publish(2, 'Second fixed version');
  a.owner.commands.archiveVersion({ project_id: a.context.projectId, artifact_id: 'coding-plan:session:1', version: 1, actor_id: 'plugin:coding' });
  const original = a.replication.read('coding-plan:session:1')!;
  assert.deepEqual(original.versions[0]!.payload, { text: 'full-body:'.repeat(40000) });
  assert.ok(original.versions.every(version => !Object.hasOwn(version, 'origin') && !Object.hasOwn(version, 'title') && !Object.hasOwn(version, 'trace')));
  b.replication.apply(structuredClone(original)); b.replication.apply(original);
  assert.deepEqual(b.replication.read('coding-plan:session:1'), original);
  assert.equal(new ArtifactsModule({ db: b.borrowed, ...b.options }).query.listArtifacts(b.context.projectId).length, 0);
  const names = b.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
  assert.equal(names.some(row => /runtime|installs|approval|coding_sessions/.test(row.name)), false, 'content restore needs no runtime, install or approval tables');
});

test('process identity remains independent from a library identity with the same id', t => {
  const a = fixture(t), b = fixture(t); a.publish();
  const library = new ArtifactsModule({ db: b.borrowed, ...b.options });
  library.commands.registerVersion({ project_id: b.context.projectId, artifact_id: 'coding-plan:session:1', version: 1,
    actor_id: 'alice', artifact_type_id: 'io.example.report', schema_version: 1, origin: { kind: 'imported', file_name: 'report.json' }, title: 'Unrelated report', media_type: 'application/json',
    producer: { plugin_id: 'io.example.report', plugin_version: '1.0.0', binding_signature: 'report-signature' }, content: { kind: 'inline', payload: { report: true } } });
  b.replication.apply(a.replication.read('coding-plan:session:1'));
  assert.deepEqual(library.query.getArtifactVersion(b.context.projectId, { artifact_id: 'coding-plan:session:1', version: 1 })!.payload, { report: true });
  assert.deepEqual(b.owner.query.getArtifactVersion(b.context.projectId, { artifact_id: 'coding-plan:session:1', version: 1 })!.payload, { text: 'Fixed plan' });
});

test('S-56 PCSYNC-01 tampered, foreign, library-shaped and incomplete process bundles leave original versions unchanged', t => {
  const a = fixture(t), b = fixture(t); a.publish(); a.publish(2); const snapshot = a.replication.read('coding-plan:session:1')!;
  const corrupt: ((bundle: PortableProcessItem) => void)[] = [
    value => { value.spaceId = 'space-bob'; }, value => { value.projectId = 'another-project'; },
    value => { value.versions[1]!.payload = { overwritten: true }; },
    value => { value.versions[1]!.supersedes_version = 9000; },
    value => { Reflect.set(value.versions[0]!, 'origin', { kind: 'imported', file_name: 'forged' }); },
    value => { Reflect.set(value.versions[0]!, 'content_kind', 'reference'); },
    value => { Reflect.set(value.versions[0]!, 'availability', ['available']); },
    value => { Reflect.set(value.versions[0]!, 'lifecycle_state', ['active']); },
  ];
  for (const mutate of corrupt) {
    const value = structuredClone(snapshot); mutate(value);
    assert.throws(() => b.replication.apply(value)); assert.equal(b.replication.read('coding-plan:session:1'), null);
  }
  b.replication.apply(snapshot);
  const before = b.replication.read('coding-plan:session:1');
  const short = structuredClone(snapshot); short.versions.pop();
  assert.throws(() => b.replication.apply(short), /缺少本机已有版本/); assert.deepEqual(b.replication.read('coding-plan:session:1'), before);
  const other = fixture(t); other.publish(1, 'different');
  assert.throws(() => other.replication.apply(snapshot), /不同内容/);
  assert.deepEqual(other.replication.read('coding-plan:session:1')!.versions[0]!.payload, { text: 'different' });
});

test('S-56 PCSYNC-06 late revocation rolls back imported process versions and their project events', t => {
  const a = fixture(t), b = fixture(t); a.publish();
  let calls = 0;
  const denied = createProcessItemReplication(b.borrowed, { ...b.context, authorize() { if (++calls === 4) throw new Error('REVOKED'); } }, b.options);
  assert.throws(() => denied.apply(a.replication.read('coding-plan:session:1')), /REVOKED/);
  assert.equal(b.replication.read('coding-plan:session:1'), null); assert.equal(b.options.eventCursor(), 0);
  a.revoke(); assert.throws(() => a.replication.read('coding-plan:session:1'), /REVOKED/);
});

test('process journal freezes a per-item prefix and cascading deletion has no null-project keys', t => {
  const f = fixture(t);
  const db: ReplicaDatabase = { exec: sql => f.db.exec(sql), prepare: sql => f.db.prepare<ReplicaInputValue[], Record<string, ReplicaOutputValue>>(sql) };
  f.db.exec(replicaSchemaSql('process_items'));
  const ledger = namespacedReplicaDatabase(db, 'process_items'); initializeReplica(ledger);
  const install = () => installProcessItemReplicationJournal(f.borrowed, key => replicaMarkSql(key).replace(/\breplica_/g, 'process_items_replica_'), (project, id) => queueReplicaChange(ledger, JSON.stringify([project, 'process_item', id])));
  install(); install(); f.publish();
  const key = JSON.stringify([f.context.projectId, 'process_item', 'coding-plan:session:1']);
  const replica = createSqliteReplica(ledger, { authorize: f.context.authorize, conflictState: createSyncConflictState,
    read(input) { assert.equal(input, key); return f.replication.read('coding-plan:session:1'); },
    apply() { assert.fail('this source-only journal test never restores incoming content'); },
  });
  const first = replica.next()!; assert.equal(first.key, key); f.publish(2);
  assert.deepEqual(replica.next(), first, 'editing after freeze cannot change the pending body');
  replica.acknowledge(key, first.operationId, 1);
  const second = replica.next()!; assert.equal(second.key, key);
  replica.acknowledge(key, second.operationId, 2);
  f.db.prepare('DELETE FROM project_root WHERE project_id=?').run(f.context.projectId);
  const deleted = replica.next()!; assert.equal(deleted.key, key); assert.equal(deleted.value, null);
  replica.acknowledge(key, deleted.operationId, 3); assert.equal(replica.next(), null);
  assert.deepEqual(replica.counts(), { pending: 0, conflicts: 0 });
});

test('S-56 PCSYNC-01 a process id owned by another project cannot be rebound', t => {
  const a = fixture(t), b = fixture(t); a.publish();
  b.db.prepare('INSERT INTO project_root VALUES (?)').run('another-project');
  b.owner.commands.registerVersion({ project_id: 'another-project', artifact_id: 'coding-plan:session:1', version: 1,
    artifact_type_id: 'coding.plan.v1', schema_version: 1, actor_id: 'plugin:coding',
    producer: { plugin_id: 'io.molis.work.coding', plugin_version: '0.3.0', binding_signature: 'official-coding-binding' },
    content: { kind: 'inline', payload: { text: 'belongs to another project' } } });
  const before = b.owner.query.getArtifactVersion('another-project', { artifact_id: 'coding-plan:session:1', version: 1 });
  assert.throws(() => b.replication.apply(a.replication.read('coding-plan:session:1')), /身份冲突/);
  assert.equal(b.replication.read('coding-plan:session:1'), null);
  assert.deepEqual(b.owner.query.getArtifactVersion('another-project', { artifact_id: 'coding-plan:session:1', version: 1 }), before);
});

test('S-56 PCSYNC-14 pure validation rejects incomplete bodies before any target project can be created', t => {
  const source = fixture(t); source.publish(); const snapshot = source.replication.read('coding-plan:session:1')!;
  assert.deepEqual(validateProcessItemReplication(snapshot, source.context), snapshot);
  const bad = structuredClone(snapshot); bad.versions[0]!.payload = { tampered: true };
  assert.throws(() => validateProcessItemReplication(bad, source.context), /校验失败/);
  source.revoke(); assert.throws(() => validateProcessItemReplication(snapshot, source.context), /REVOKED/);
});
