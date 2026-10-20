import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonalSync, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { createSyncDocument, defineErrorCodes } from '@molis-ai/molis-work-plugin-sdk';

const errors=defineErrorCodes('fixture_sync',{unavailable:'unavailable'});

function fixture(t: import('node:test').TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'sync-dynamic-')), space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(home, space); t.after(() => rmSync(home, { recursive: true, force: true }));
  let raw: string | null = null, active = true, enabled = true, version = 1, discoveryCalls = 0, networkCalls = 0, reads = 0, revision = 0, mutations = 0, unavailable=false;
  let beforeToken = async () => {};
  const selection = () => ({ plugin_id: 'io.example.runtime-notes', publisher_id: 'author', publisher_signature: 'author-binding', collection_id: 'notes', schema_version: version });
  const authorize = () => { if (!active) throw new Error('ACCOUNT_REVOKED'); };
  const document = createSyncDocument<Record<string, string>>({ spaceId: space.spaceId, storage: {
    read: () => raw, compareAndSet(expected, value) { if (expected !== raw) return false; raw = value; return true; },
  }, authorize, initial: () => ({}), validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) throw new Error('INVALID_NOTES');
    return value as Record<string, string>;
  }, observe: data => new Map(Object.entries(data)), read(data,key){if(unavailable&&key==='note')throw errors.unavailable('PRIVATE_ORIGINAL_PATH');return data[key]??null;},
  apply(data, key, value) { if (value === null) delete data[key]; else if (typeof value === 'string') data[key] = value; else throw new Error('INVALID_NOTE'); } });
  document.update(data => { data.note = 'local original'; });
  const registration = (): SyncRegistration => ({ selection: selection(), title: '运行实例笔记', available: () => enabled,
    refresh: async () => authorize(), prepare: async () => authorize(), withReplica(run) { authorize(); reads++; return run(document.replica); } });
  let policy = { spaceId: space.spaceId, revision: 0, selections: [] as ReturnType<typeof selection>[] }, provider = async (): Promise<readonly SyncRegistration[]> => [registration()];
  const service = new PersonalSync({ home, spaceId: space.spaceId, endpoint: 'https://sync.example.test', registrations: [],
    authority: { signal: new AbortController().signal, assertCurrent: authorize, accessToken: async () => { await beforeToken(); return 'synthetic-dynamic'; } },
    discover: async () => { discoveryCalls++; return provider(); }, fetch: async (input, init) => {
      networkCalls++; const url = new URL(String(input));
      if (url.pathname === '/v1/round') return syncRoundResponse(policy, mutations);
      if (url.pathname === '/v1/policy') { if (init?.method === 'PUT') policy = { ...JSON.parse(String(init.body)), revision: policy.revision + 1 }; return Response.json(policy); }
      if (url.pathname === '/v1/quota') return Response.json({ limitBytes: 100000000, usedBytes: 0 });
      if (url.pathname === '/v1/changes' && init?.method === 'POST') { mutations++; return Response.json({ accepted: true, revision: ++revision }); }
      return Response.json({ events: [], more: false });
    } });
  t.after(() => service.close());
  return { service, selection, registration, raw: () => raw, readCount: () => reads, calls: () => ({ discoveryCalls, networkCalls, mutations }), tokenGate(value: typeof beforeToken) { beforeToken = value; },
    enabled(value: boolean) { enabled = value; }, version(value: number) { version = value; }, revoke() { active = false; }, provider(value: typeof provider) { provider = value; },
    unavailable(value:boolean){unavailable=value;},healthy(){document.update(data=>{data.healthy='another complete original';});} };
}

test('S-72 PCSYNC-14 SDK original-byte unavailability does not quarantine or starve another dynamically registered asset',async t=>{
 const f=fixture(t);f.unavailable(true);f.healthy();await f.service.save({...f.service.policy(),selections:[f.selection()]});await f.service.run();
 assert.equal(f.calls().mutations,1);const status=f.service.status();assert.equal(status.collections[0]!.pending,1);assert.deepEqual(status.collections[0]!.failures,[]);
 assert.match(status.error!,/暂时不可用/);assert.doesNotMatch(status.error!,/PRIVATE_ORIGINAL_PATH/);assert.equal(JSON.parse(f.raw()!).data.note,'local original');
 f.unavailable(false);await f.service.run();assert.equal(f.calls().mutations,2);assert.equal(f.service.status().error,null);assert.equal(f.service.status().collections[0]!.pending,0);
});

test('S-72 PCSYNC-21/25 discovering a Runtime collection never selects it; disabled and upgraded formats preserve unavailable policy', async t => {
  const f = fixture(t); assert.equal(f.calls().discoveryCalls, 0, 'construction does not discover or run code');
  await f.service.refreshCatalog();assert.equal(f.calls().networkCalls,0,'opening a collection directory does not contact Auth/transport or transfer assets');assert.deepEqual(f.service.policy().selections,[]);assert.equal(f.service.status().collections.length,1);
  await f.service.run(); assert.equal(f.service.status().collections.length, 1); assert.deepEqual(f.service.policy().selections, []);
  assert.equal(f.service.status().collections[0]!.pending, 1);
  const selected = f.selection(); await f.service.save({ ...f.service.policy(), selections: [selected] });
  await f.service.run(); assert.equal(f.service.status().collections[0]!.pending, 0);
  const lastSuccess=f.service.status().lastSuccess;assert.ok(lastSuccess);
  const reads = f.readCount(); f.enabled(false);
  assert.deepEqual(f.service.status().unavailable, [selected]); assert.deepEqual(f.service.status().collections, []); assert.equal(f.readCount(), reads);
  await f.service.run(); assert.deepEqual(f.service.policy().selections, [selected]); assert.equal(f.readCount(), reads, 'disabled owner is not opened');
  assert.match(f.service.status().error!,/已选同步集合不可用/);assert.equal(f.service.status().lastSuccess,lastSuccess,'an unavailable selection does not claim a new successful run');
  f.enabled(true); f.version(2); await f.service.run();
  assert.deepEqual(f.service.policy().selections, [selected], 'discovery cannot approve a new schema');
  assert.deepEqual(f.service.status().unavailable, [selected]); assert.equal(f.service.status().collections[0]!.selection.schema_version, 2);
  assert.notEqual(syncNamespace(f.selection()), syncNamespace(selected));
  assert.match(f.service.status().error!,/已选同步集合不可用/);assert.equal(f.service.status().lastSuccess,lastSuccess);
});

test('S-72 PCSYNC-14/27 an unavailable selected owner prevents false success without blocking a healthy collection',async t=>{
 const f=fixture(t);let raw:string|null=null,enabled=true,opens=0;
 const selection={...f.selection(),collection_id:'other_notes'};
 const document=createSyncDocument<Record<string,string>>({spaceId:personalStorageSpace('https://auth.example.test','work','alice').spaceId,
  storage:{read:()=>raw,compareAndSet(expected,value){if(expected!==raw)return false;raw=value;return true;}},authorize:()=>{},initial:()=>({}),
  validate(value){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,string>;},
  observe:data=>new Map(Object.entries(data)),read:(data,key)=>data[key]??null,apply(data,key,value){if(value===null)delete data[key];else{assert.equal(typeof value,'string');data[key]=String(value);}}});
 const other:SyncRegistration={selection,title:'Unavailable notes',available:()=>enabled,refresh:async()=>{},prepare:async()=>{},withReplica(run){opens++;return run(document.replica);}};
 f.provider(async()=>[f.registration(),other]);await f.service.save({...f.service.policy(),selections:[f.selection(),selection]});
 const before=opens;enabled=false;await f.service.run();
 const status=f.service.status();assert.equal(f.calls().mutations,1);assert.equal(status.collections[0]!.pending,0);assert.equal(opens,before);
 assert.deepEqual(status.unavailable,[selection]);assert.match(status.error!,/已选同步集合不可用/);assert.equal(status.lastSuccess,null);
 enabled=true;await f.service.run();assert.equal(f.service.status().error,null);assert.ok(f.service.status().lastSuccess);
});

test('S-72 PCSYNC-06/25 cancelled discovery publishes nothing and sends no requests; malformed replacement retains the checked directory', async t => {
  const f = fixture(t); await f.service.run(); const before = f.raw(), calls = f.calls().networkCalls;
  f.provider(async () => [f.registration(), f.registration()]); await f.service.run();
  assert.match(f.service.status().error!, /重复集合/); assert.equal(f.service.status().collections.length, 1); assert.equal(f.calls().networkCalls, calls); assert.equal(f.raw(), before);
  const revoked = fixture(t); let resume!: () => void;
  const wait = new Promise<void>(resolve => { resume = resolve; }); revoked.provider(async () => { await wait; return [revoked.registration()]; });
  const original = revoked.raw(), run = revoked.service.run(); revoked.revoke(); resume(); await run;
  assert.equal(revoked.raw(), original); assert.equal(revoked.calls().networkCalls, 0);
  assert.throws(() => revoked.service.status(), /ACCOUNT_REVOKED/);
});

test('S-72 PCSYNC-06/25 stopping a plugin while awaiting a token cannot dispatch the old frozen upload or clear its queue', { timeout: 10000 }, async t => {
  const f = fixture(t); await f.service.save({ spaceId: personalStorageSpace('https://auth.example.test', 'work', 'alice').spaceId, revision: 0, selections: [f.selection()] });
  let resume!: () => void, arrived!: () => void;
  const wait = new Promise<void>(resolve => { resume = resolve; }), reached = new Promise<void>(resolve => { arrived = resolve; });
  const before = f.calls().networkCalls;
  f.tokenGate(async () => { if (JSON.parse(f.raw()!).outbox.length > 0) { arrived(); await wait; } });
  const run = f.service.run(); await reached;
  assert.equal(f.calls().networkCalls, before + 1, 'only the authenticated summary was sent; the frozen upload is still waiting for its token');
  const frozen = JSON.parse(f.raw()!).outbox[0].operation.operationId;
  f.enabled(false); resume(); await run;
  assert.equal(f.calls().mutations, 0, 'lifecycle is checked again after token refresh, before network dispatch');
  assert.equal(JSON.parse(f.raw()!).outbox[0].operation.operationId, frozen); assert.equal(JSON.parse(f.raw()!).data.note, 'local original');
  assert.match(f.service.status().error!, /实例或授权已变化/); assert.equal(f.service.status().unavailable.length, 1);
  f.tokenGate(async () => {}); f.enabled(true); await f.service.run(); assert.equal(f.calls().mutations, 1); assert.equal(f.service.status().collections[0]!.pending, 0);
});
