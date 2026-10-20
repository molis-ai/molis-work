import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createSyncDocument, defineErrorCodes, type SyncDocumentStorage } from '@molis-ai/molis-work-plugin-sdk';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';

type Data = { items: { id: string; body: string }[] };
const errors = defineErrorCodes('fixture', { invalid: 'invalid', waiting: 'conflict', revoked: 'forbidden', unavailable: 'unavailable' });
function fixture(storage?: SyncDocumentStorage) {
  let text: string | null = null, active = true, missing = false, bad = false, unavailable = false;
  const port = storage ?? { read: () => text, compareAndSet(expected, value) { if (expected !== text) return false; text = value; return true; } };
  const open = () => createSyncDocument<Data>({ spaceId: 'personal:alice', storage: port,
    authorize() { if (!active) throw errors.revoked('revoked'); }, initial: () => ({ items: [] }),
    validate(value) {
      if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
        || value.items.some(row => !row || typeof row.id !== 'string' || typeof row.body !== 'string')
        || new Set(value.items.map(row => row.id)).size !== value.items.length) throw errors.invalid('invalid facts');
      return value as Data;
    },
    locate(data,key){return data.items.some(row=>row.id===key)?'/?openPlugin=sample&openItem='+encodeURIComponent(key):null;},
    observe: data => new Map(data.items.map(row => [row.id, createHash('sha256').update(row.body).digest('hex')])),
    read(data, key) { if (bad) throw new SyntaxError('PRIVATE_DOCUMENT_SENTINEL'); if(unavailable&&key==='one')throw errors.unavailable('PRIVATE_ORIGINAL_PATH'); return data.items.find(row => row.id === key)?.body ?? null; },
    apply(data, key, value) {
      if (missing) throw errors.waiting('missing', { sync_waiting: true });
      if (value !== null && typeof value !== 'string') { data.items.length = 0; throw errors.invalid('PRIVATE_DOCUMENT_SENTINEL'); }
      data.items = data.items.filter(row => row.id !== key);
      if (typeof value === 'string') data.items.push({ id: key, body: value });
    },
  });
  const doc = open();
  const edit = (key: string, body: string | null) => doc.update(data => { data.items = data.items.filter(row => row.id !== key); if (body !== null) data.items.push({ id: key, body }); });
  return { doc, open, edit, port, raw: () => text, setRaw: (value: string) => { text = value; }, revoke: () => { active = false; }, missing: (value: boolean) => { missing = value; }, bad: () => { bad = true; }, unavailable(value:boolean){unavailable=value;} };
}

test('PCSYNC-05/15 document commits journal additions/deletions atomically and ACK only the frozen prefix', () => {
  const f = fixture(); f.edit('__proto__', 'first'); const frozen = f.doc.replica.next()!;
  f.edit('__proto__', 'second'); assert.deepEqual(f.open().replica.next(), frozen);
  assert.throws(() => f.doc.replica.receive({ ...frozen, value: 'forged receipt', revision: 1 }), { code: 'plugin.sync_invalid' });
  assert.throws(() => f.doc.replica.acknowledge(frozen.key, 'wrong operation', 1));
  f.doc.replica.acknowledge(frozen.key, frozen.operationId, 1);
  assert.equal(f.doc.replica.cursor(), 0); assert.equal(f.doc.replica.counts().pending, 1);
  const second = f.doc.replica.next()!; assert.equal(second.value, 'second'); assert.equal(second.base, 1);
  f.doc.replica.receive({ ...second, revision: 2 }); assert.deepEqual(f.doc.replica.counts(), { pending: 0, conflicts: 0 });
  f.edit('healthy', 'new'); f.edit('__proto__', null);
  const deletion = f.doc.replica.next({ deletionsOnly: true })!; assert.equal(deletion.key, '__proto__'); assert.equal(deletion.value, null);
  f.doc.replica.acknowledge(deletion.key, deletion.operationId, 3); assert.equal(f.doc.replica.counts().pending, 1);
  assert.equal(f.open().read().items.length, 1);
});

test('PCSYNC-14/15/16 document conflicts preserve both bodies, validate CAS choices, and never echo remote writes', () => {
  const f = fixture(); f.edit('item', 'local'); const operation = f.doc.replica.next()!;
  f.doc.replica.receive({ ...operation, operationId: 'other:1', value: 'remote', revision: 2 });
  assert.equal(f.doc.replica.inspectConflict!('item')!.local, 'local');
  assert.throws(() => f.doc.replica.resolve('item', 'remote', 1));
  f.doc.replica.resolve('item', 'remote', 2); assert.equal(f.doc.read().items[0]!.body, 'remote'); assert.equal(f.doc.replica.next(), null);
  const history = f.doc.replica.recoveries!()[0]!;
  assert.equal(f.doc.replica.inspectRecovery!(history.id)!.local, 'local');
  f.doc.replica.restoreRecovery!(history.id, 'local', 2); assert.equal(f.doc.read().items[0]!.body, 'local');
  assert.throws(() => f.doc.replica.restoreRecovery!(history.id, 'remote', 2));
  assert.ok(f.doc.replica.next());
  const other = fixture(); other.doc.replica.receive({ operationId: 'remote:1', key: 'item', base: 0, revision: 1, value: 'first' });
  other.doc.replica.receive({ operationId: 'remote:2', key: 'item', base: 1, revision: 2, value: { invalid: true } });
  assert.equal(other.doc.read().items[0]!.body, 'first'); assert.doesNotMatch(JSON.stringify(other.doc.replica.conflicts()), /PRIVATE_DOCUMENT/);
  other.doc.replica.receive({ operationId: 'remote:1', key: 'item', base: 0, revision: 1, value: 'older' }, { retry: true });
  assert.equal(other.doc.replica.inspectConflict!('item')!.revision, 2);
});

test('PCSYNC-14 document isolates unavailable reads, waits for dependencies and keeps malformed source byte intact', () => {
  const f = fixture(); f.edit('one', 'unique'); const source = f.raw(); f.bad();
  assert.throws(() => f.doc.replica.next(), error => !!error && typeof error === 'object' && 'details' in error && JSON.stringify(error.details).includes('one') && !String(error).includes('PRIVATE_DOCUMENT'));
  assert.equal(f.raw(), source);
  const waiting = fixture(); waiting.missing(true);
  const event = { operationId: 'remote:1', key: 'one', base: 0, revision: 1, value: 'saved' };
  waiting.doc.replica.receive(event); assert.equal(waiting.doc.replica.conflicts()[0]!.waiting, true);
  waiting.missing(false); waiting.doc.replica.retryWaiting!(); assert.equal(waiting.doc.read().items[0]!.body, 'saved'); assert.equal(waiting.doc.replica.next(), null);
  const invalid = fixture(); invalid.setRaw('{PRIVATE_DOCUMENT_SENTINEL');
  assert.throws(() => invalid.doc.read(), { code: 'plugin.sync_invalid' }); assert.equal(invalid.raw(), '{PRIVATE_DOCUMENT_SENTINEL');
  const scope = JSON.parse(waiting.raw()!); scope.spaceId = 'personal:bob'; waiting.setRaw(JSON.stringify(scope));
  assert.throws(() => waiting.doc.read(), { code: 'plugin.sync_scope' });
  const before = f.raw();
  assert.throws(() => f.doc.update(data => { data.items.push({ id: 'one', body: 'duplicate' }); }), { code: 'fixture.invalid' });
  assert.equal(f.raw(), before);
});

test('S-40 PCSYNC-14 explicit temporary byte unavailability keeps the original queue and never exposes private diagnostics', () => {
  const f=fixture();f.edit('one','original');f.edit('healthy','another item');f.unavailable(true);const before=f.raw();
  assert.throws(()=>f.doc.replica.next(),error=>{
    assert.ok(error&&typeof error==='object'&&'code' in error&&'kind' in error&&'details' in error);
    assert.equal(error.code,'plugin.sync_unavailable');assert.equal(error.kind,'unavailable');assert.deepEqual(error.details,{sync_key:'one',sync_waiting:false});
    assert.doesNotMatch(String(error),/PRIVATE_ORIGINAL_PATH/);return true;
  });
  assert.equal(f.raw(),before);const healthy=f.doc.replica.next({excludeKeys:['one']})!;assert.equal(healthy.key,'healthy');
  f.doc.replica.acknowledge(healthy.key,healthy.operationId,1);f.unavailable(false);assert.equal(f.open().replica.next()!.value,'original');
});

test('S-40 PCSYNC-15/16 JSON comparison rejects newer local text even when the remote revision is unchanged', () => {
  const f=fixture();f.edit('one','before');f.doc.replica.receive({operationId:'remote',key:'one',base:0,revision:1,value:'remote'});
  const shown=f.doc.replica.inspectConflict!('one')!;f.edit('one','new local');
  assert.throws(()=>f.doc.replica.resolve('one','remote',shown.revision,shown.state),/比较内容已变化/);
  assert.equal(f.doc.read().items[0]!.body,'new local');assert.equal(f.doc.replica.recoveries!().length,0);
  const current=f.doc.replica.inspectConflict!('one')!;f.doc.replica.resolve('one','remote',current.revision,current.state);
  assert.equal(f.doc.replica.inspectRecovery!(f.doc.replica.recoveries!()[0]!.id)!.local,'new local');
});

test('S-40 PCSYNC-06/25 public document uses real private-KV CAS and rejects revoked and contended writes without replay', () => {
  const db = new DatabaseSync(':memory:');
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: 'example.notes', name: 'Notes', version: '1.0.0', kind: 'app',
    publisher: { publisher_id: 'example', signature: 'signed-notes' }, entrypoints: [{ deployment: 'local', entrypoint: './index.js' }], permissions: [{ permission: 'storage:private', required: true, reason: 'notes' }] };
  let active = true;
  const context = { plugin_id: manifest.plugin_id, version: manifest.version, install_id: 'notes-install', deployment: 'local' as const, grants: ['storage:private'], requireGrant() { if (!active) throw errors.revoked('revoked'); } };
  try {
    const absent = { read: () => null } as SyncDocumentStorage;
    assert.throws(() => createSyncDocument({ spaceId: 'personal:alice', storage: absent, authorize() {}, initial: () => ({}), validate: value => value,
      observe: () => new Map(), read: () => null, apply() {} }), { code: 'plugin.sync_unsupported' });
    const kv = new SqlitePluginPrivateStorage(db).forPlugin(context, manifest);
    const f = fixture({ read: () => kv.get('notes'), compareAndSet: (before, after) => kv.compareAndSet!('notes', before, after) });
    f.edit('one', 'persisted'); assert.equal(f.open().read().items[0]!.body, 'persisted');
    let count = 0;
    const contested = fixture({ read: () => kv.get('notes'), compareAndSet: (before, after) => { count++; kv.set('notes', kv.get('notes')! + ' '); return kv.compareAndSet!('notes', before, after); } });
    assert.throws(() => contested.doc.update(data => { data.items[0]!.body = 'stale'; }), { code: 'plugin.sync_conflict' });
    assert.equal(count, 1); assert.equal(f.doc.read().items[0]!.body, 'persisted');
    const before = kv.get('notes'); active = false;
    assert.throws(() => f.doc.replica.next(), { code: 'fixture.revoked' }); active = true; assert.equal(kv.get('notes'), before);
    assert.throws(() => f.doc.update(async data => { data.items[0]!.body = 'async must refuse'; }), { code: 'plugin.sync_invalid' });
    assert.equal(kv.get('notes'), before);
  } finally { db.close(); }
});


test('PCSYNC-16/25 owner location is read-only, unavailable for deleted content and rechecks authorization',()=>{
 const f=fixture();f.edit('one','local body');const before=f.raw();
 assert.equal(f.doc.replica.locate!('one'),'/?openPlugin=sample&openItem=one');assert.equal(f.raw(),before,'locating must not freeze or acknowledge content');
 f.edit('one',null);assert.equal(f.doc.replica.locate!('one'),null);f.revoke();assert.throws(()=>f.doc.replica.locate!('one'),{code:'fixture.revoked'});
});


test('PCSYNC-20/25 document project inspection includes retained old ownership and deleted current ownership until ACK',()=>{
 type ScopeData={items:Record<string,{project:string}>;deleted:Record<string,string>};let raw:string|null=null;
 const doc=createSyncDocument<ScopeData>({spaceId:'personal:alice',authorize(){},storage:{read:()=>raw,compareAndSet(expected,next){if(expected!==raw)return false;raw=next;return true;}},initial:()=>({items:{},deleted:{}}),validate:value=>value as ScopeData,
  observe:data=>new Map(Object.entries(data.items).map(([id,value])=>[id,JSON.stringify(value)])),read:(data,key)=>data.items[key]??null,
  apply(data,key,value){if(value===null)delete data.items[key];else data.items[key]=value as {project:string};},
  belongsToProject(data,key,projectId,retained){return (data.items[key]?.project??data.deleted[key])===projectId||retained.some(row=>!!row.value&&(row.value as {project:string}).project===projectId);}
 });
 doc.update(data=>{data.items.one={project:'a'};});const frozen=doc.replica.next()!;
 doc.update(data=>{data.items.one={project:'b'};});doc.update(data=>{delete data.items.one;data.deleted.one='b';});
 const before=raw;assert.equal(doc.replica.hasProjectChanges!('a'),true);assert.equal(doc.replica.hasProjectChanges!('b'),true);assert.equal(raw,before);
 doc.replica.acknowledge(frozen.key,frozen.operationId,1);assert.equal(doc.replica.hasProjectChanges!('a'),false);assert.equal(doc.replica.hasProjectChanges!('b'),true);
 const deletion=doc.replica.next()!;assert.equal(deletion.value,null);doc.replica.acknowledge(deletion.key,deletion.operationId,2);assert.equal(doc.replica.hasProjectChanges!('b'),false);
});


test('local document deletion retains an unfrozen original atomically and can undo offline without a cloud revision',()=>{
 const f=fixture();f.edit('unuploaded','unique original');f.edit('unuploaded',null);
 assert.equal(f.doc.read().items.length,0);const saved=f.doc.replica.recoveries!()[0]!;assert.equal(saved.choice,'local_delete');assert.equal(saved.revision,0);assert.equal(f.doc.replica.inspectRecovery!(saved.id)!.local,'unique original');
 f.doc.replica.restoreRecovery!(saved.id,'local',0);assert.equal(f.doc.read().items[0]!.body,'unique original');assert.equal(f.doc.replica.cursor(),0);assert.equal(f.doc.replica.next()!.base,0);
 const stale=fixture();stale.edit('one','original');stale.edit('one',null);const prior=stale.doc.replica.recoveries!()[0]!;stale.edit('one','later edit');assert.throws(()=>stale.doc.replica.restoreRecovery!(prior.id,'local',0));assert.equal(stale.doc.read().items[0]!.body,'later edit');
 const missing=fixture();missing.edit('one','irreplaceable');missing.unavailable(true);const before=missing.raw();assert.throws(()=>missing.edit('one',null));assert.equal(missing.raw(),before,'failure to freeze unique bytes must roll back deletion');
});

test('actual prior SDK document v1 is refused without rewriting its original bytes',()=>{
 const bytes=readFileSync(new URL('./fixtures/sync-document-v1.json',import.meta.url),'utf8');const f=fixture();f.setRaw(bytes);assert.throws(()=>f.doc.read(),{code:'plugin.sync_invalid'});assert.equal(f.raw(),bytes);
});
