import {createHash} from 'node:crypto';
import { syncRoundResponse } from './fixtures/sync-round.js';
import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate} from 'node:timers/promises';
import {PersonalSync,SYNC_STORE_BASELINE,syncNamespace,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,homeSqlitePath,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {DatabaseSync} from 'node:sqlite';

function fixture(t:TestContext){
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const root=mkdtempSync(join(tmpdir(),'sync-device-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const clients:PersonalSync[]=[],paths:string[]=[];let requests=0,online=true,limited=false;
  const create=(user='alice')=>{
    const space=personalStorageSpace('http://127.0.0.1:8787','work',user),home=join(root,user);
    ensureStorageSpace(home,space);const authority=new AbortController();
    let delay:Promise<void>|null=null;
    const sync=new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',registrations:[],authority:{signal:authority.signal,assertCurrent(){authority.signal.throwIfAborted();},accessToken:async()=>'synthetic-only'},fetch:async(input)=>{
      requests++;paths.push(new URL(String(input)).pathname);if(!online)throw new Error('offline');if(delay)await delay;
      if(limited)return Response.json({error:'SYNC_RATE_LIMITED'},{status:429,headers:{'Retry-After':'60'}});
      if(new URL(String(input)).pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[]},0);
      return Response.json(new URL(String(input)).pathname==='/v1/quota'?{limitBytes:100000000,usedBytes:0}:{spaceId:space.spaceId,revision:1,selections:[]});
    }});
    clients.push(sync);return {sync,authority,home,delay(value:Promise<void>){delay=value;}};
  };
  t.after(()=>clients.forEach(sync=>sync.close()));
  return {create,paths,requests:()=>requests,offline:()=>online=false,online:()=>online=true,limit:(value:boolean)=>limited=value};
}

test('PCSYNC-02/03/04 a new device is silent; policy save and manual sync never start a timer',async t=>{
  const f=fixture(t),{sync}=f.create();
  assert.deepEqual(sync.status().device,{automatic:null});sync.start();assert.equal(f.requests(),0);
  assert.equal(sync.status().progress.complete,false,'PCSYNC-27 an unconfigured new device never claims complete');
  await sync.save(sync.policy());assert.equal(f.requests(),1);
  t.mock.timers.tick(60000);assert.equal(f.requests(),1,'saving collections does not enable auto sync');
  await sync.run();assert.equal(f.requests(),2);assert.deepEqual(f.paths,['/v1/policy','/v1/round'],'one idle cycle authenticates once and reads its complete round summary');
  t.mock.timers.tick(60000);assert.equal(f.requests(),2,'manual run is one cycle');
  await sync.setDevice(false);sync.start();t.mock.timers.tick(60000);
  assert.equal(f.requests(),2);assert.deepEqual(sync.status().device,{automatic:false});
});

test('PCSYNC-02/05 choices persist independently per account and resume after restart/reconnect',async t=>{
  const f=fixture(t),a=f.create();await a.sync.setDevice(true);await a.sync.run();
  assert.deepEqual(a.sync.status().device,{automatic:true});
  const b=f.create('bob');assert.deepEqual(b.sync.status().device,{automatic:null});
  await b.sync.setDevice(false);assert.deepEqual(a.sync.status().device,{automatic:true});
  a.sync.close();const restarted=f.create();assert.deepEqual(restarted.sync.status().device,{automatic:true});
  const before=f.requests();restarted.sync.start();await restarted.sync.run();assert.equal(f.requests(),before+1);assert.deepEqual(f.paths.slice(before),['/v1/round']);
  f.offline();t.mock.timers.tick(30000);await restarted.sync.run();assert.match(restarted.sync.status().error??'',/offline/);
  f.online();t.mock.timers.tick(20000);await restarted.sync.run();assert.equal(restarted.sync.status().error,null);
  await restarted.sync.setDevice(false);const disabled=f.requests();t.mock.timers.tick(60000);
  assert.equal(f.requests(),disabled);assert.deepEqual(f.create().sync.status().device,{automatic:false});
});

test('PCSYNC-OPT-06 empty rounds slow down, and Retry-After applies to automatic and manual requests',async t=>{
  const f=fixture(t),{sync}=f.create();
  await sync.setDevice(true);await sync.run();
  for(const [index,interval] of [30000,60000,120000,120000].entries()){
    const before=f.requests();
    t.mock.timers.tick(interval-1);assert.equal(f.requests(),before,'no premature polling');
    t.mock.timers.tick(1);await setImmediate();assert.equal(f.requests(),before+1,'timer starts the next round');
    assert.equal(f.requests(),index+2);
  }
  f.limit(true);await sync.run();
  const rejected=f.requests();
  f.limit(false);
  t.mock.timers.tick(59999);await sync.run();assert.equal(f.requests(),rejected,'manual sync respects Retry-After');
  t.mock.timers.tick(1);await setImmediate();assert.equal(f.requests(),rejected+1,'sync resumes when the deadline has passed');
});

test('PCSYNC-06 disabling cancels a delayed response before applying policy; revocation cannot revive a timer',async t=>{
  const f=fixture(t),a=f.create();let release!:()=>void;
  a.delay(new Promise<void>(resolve=>release=resolve));
  await a.sync.setDevice(true);await Promise.resolve();
  const stopping=a.sync.setDevice(false);release();await stopping;
  assert.equal(a.sync.policy().revision,0,'the delayed response cannot write the policy cache');
  assert.equal(a.sync.status().running,false);assert.deepEqual(a.sync.status().device,{automatic:false});
  const before=f.requests();t.mock.timers.tick(60000);assert.equal(f.requests(),before);
  const b=f.create('bob');await b.sync.setDevice(true);await b.sync.run();b.authority.abort();b.sync.close();
  const revoked=f.requests();t.mock.timers.tick(60000);assert.equal(f.requests(),revoked);
  await assert.rejects(()=>b.sync.setDevice(true));
});

test('PCSYNC-OPT-06 local writes coalesce into one opt-in round and cannot wake a disabled device',async t=>{
  const f=fixture(t),{sync}=f.create();
  sync.notifyLocalChange();
  t.mock.timers.tick(3000);assert.equal(f.requests(),0);
  await sync.setDevice(true);await sync.run();
  sync.notifyLocalChange();sync.notifyLocalChange();
  t.mock.timers.tick(1499);assert.equal(f.requests(),1);
  t.mock.timers.tick(1);await setImmediate();assert.equal(f.requests(),2);
  sync.notifyLocalChange();
  await sync.setDevice(false);
  t.mock.timers.tick(3000);await setImmediate();assert.equal(f.requests(),2);
});

test('PCSYNC-02 a copied or malformed preference is rejected instead of enabling another account',async t=>{
  const f=fixture(t),a=f.create();await a.sync.setDevice(true);await a.sync.run();a.sync.close();
  const b=f.create('bob');b.sync.close();
  writeFileSync(join(b.home,'sync','device.json'),readFileSync(join(a.home,'sync','device.json')));
  assert.throws(()=>f.create('bob'),/本机同步设置无效/);
  writeFileSync(join(a.home,'sync','device.json'),JSON.stringify({version:1,spaceId:'wrong',automatic:true}));
  assert.throws(()=>f.create(),/本机同步设置无效/);
});

// V7 (batch 106, user 2026-11-24): sync.db's one step was reset; its v1 structure has the retry columns, so the event is written into it directly.
test('PCSYNC-OPT-13 a stored deferred event survives reopening the store and retry deadlines survive it too',async t=>{
  const f=fixture(t),{home,sync}=f.create();
  const selection={plugin_id:'io.example.details',publisher_id:'example',publisher_signature:'example-key',collection_id:'docs',schema_version:1};
  const namespace=syncNamespace(selection),spaceId=sync.policy().spaceId;
  const path=homeSqlitePath(home,'sync');
  sync.close();
  const db=new DatabaseSync(path);
  const event={operationId:'original',key:'pending',base:0,value:{title:'Original'},revision:3};
  try{
    db.prepare('INSERT INTO sync_failures VALUES (?,?,?,?,?,?,?,0,0)').run(namespace,event.key,'download',JSON.stringify(event),'waiting',event.revision,1);
    db.prepare('INSERT INTO sync_stream_cursors VALUES (?,?)').run(namespace,event.revision);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,SYNC_STORE_BASELINE.version);
  }finally{db.close();}
  let attempts=0,dependencyReady=false;
  const coordinator=new PersonalSync({home,spaceId,endpoint:'http://127.0.0.1:8788',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},
    fetch:async()=>syncRoundResponse({spaceId,revision:1,selections:[selection]},3),
    registrations:[{selection,title:'Documents',async refresh(){},
      async prepare(){attempts++;if(!dependencyReady)throw new Error('Waiting for dependency');},
      withReplica:run=>run({cursor:()=>3,next:()=>null,receive(){},acknowledge(){},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}})}]});
  t.after(()=>coordinator.close());
  await coordinator.run();assert.equal(attempts,1,'the stored event still replays');
  await coordinator.run();assert.equal(attempts,1,'retry cooldown is honored by every round');
  t.mock.timers.tick(15_000);
  await coordinator.run();assert.equal(attempts,2);
  t.mock.timers.tick(59_999);
  await coordinator.run();assert.equal(attempts,2,'the second failure schedules a longer interval');
  dependencyReady=true;
  await coordinator.retryItem(namespace,event.key,'download');
  assert.equal(attempts,3,'an explicit retry can apply the event during cooldown');
  assert.deepEqual(coordinator.status().collections[0]?.failures,[]);
});

test('PCSYNC-OPT-07 independent collections sync in bounded parallel layers while respecting dependencies',async t=>{
  t.mock.timers.reset();
  const root=mkdtempSync(join(tmpdir(),'molis-sync-parallel-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  ensureStorageSpace(root,space);
  const selections=Array.from({length:7},(_,i)=>({plugin_id:i===0?'io.molis.work.module.projects.v1':`io.example.col${i}`,publisher_id:i===0?'molis':'example',publisher_signature:i===0?'official-project-catalog-binding':'example-key',collection_id:i===0?'projects':`items-${i}`,schema_version:1}));
  const completed=new Set<string>(), waves:string[][]=[];
  let pending:Promise<void>|null=null, active=0, peak=0;
  // Every request started in this turn can finish in one network round trip.
  const roundTrip=(ns:string)=>{
    if(!pending){
      waves.push([]);
      pending=setImmediate().then(()=>{pending=null;});
    }
    waves.at(-1)!.push(ns);
    return pending;
  };
  const registrations=selections.map((selection,i)=>({
    selection,title:`Col ${i}`,
    ...(i===0?{restoreTier:'catalog' as const}:{}),
    ...(i===6?{dependencies:[selections[1]!]}:{}),
    async refresh(){},
    async prepare(){},
    withReplica:run=>run({cursor:()=>0,next:()=>null,receive(){completed.add(syncNamespace(selection));},acknowledge(){},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}}),
  }));
  const sync=new PersonalSync({home:root,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},
    registrations,
    fetch:async input=>{
      const url=new URL(String(input));
      if(url.pathname==='/v1/round')return Response.json({format:1,policy:{spaceId:space.spaceId,revision:1,selections},quota:{limitBytes:100000000,usedBytes:0},heads:selections.map(s=>({namespace:syncNamespace(s),revision:1}))});
      const ns=url.searchParams.get('namespace')!;
      if(ns!==syncNamespace(selections[0]!))assert.ok(completed.has(syncNamespace(selections[0]!)),'projects catalog settles before dependent layers');
      if(ns===syncNamespace(selections[6]!))assert.ok(completed.has(syncNamespace(selections[1]!)),'declared dependency has been applied before the consumer starts');
      active++;peak=Math.max(peak,active);
      await roundTrip(ns);
      active--;
      return Response.json({events:[{operationId:'op-'+ns,key:'k',base:0,revision:1,value:{ok:true}}],more:false});
    }});
  t.after(()=>sync.close());
  await sync.run();
  assert.equal(sync.status().error,null);
  assert.equal(peak,3,'bounded concurrency runs 3 independent collections at once');
  assert.deepEqual(waves.map(wave=>wave.length),[1,3,2,1],'seven downloads take four network round trips');
  assert.equal(completed.size,7,'all collections applied their remote changes');
});

test('CORE-13 declarative restoreTier orders catalog -> version-store -> reference-owner -> default without hardcoded plugin IDs', async t => {
  t.mock.timers.reset();
  const root = mkdtempSync(join(tmpdir(), 'molis-sync-tiers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(root, space);
  const makeSel = (id: string) => ({ plugin_id: `com.example.${id}`, publisher_id: 'example', publisher_signature: 'sig', collection_id: 'items', schema_version: 1 });
  const sDefault = makeSel('consumer');
  const sRef = makeSel('owner');
  const sVersion = makeSel('versions');
  const sCatalog = makeSel('directory');
  const order: string[] = [];
  const makeReg = (selection: ReturnType<typeof makeSel>, extra: Partial<SyncRegistration> = {}): SyncRegistration => ({
    selection, title: selection.plugin_id, ...extra,
    async refresh() {}, async prepare() {},
    withReplica: run => run({
      cursor: () => 0, next: () => null, acknowledge() {}, counts: () => ({ pending: 0, conflicts: 0 }), conflicts: () => [], resolve() {},
      receive() { order.push(selection.plugin_id); },
    }),
  });
  const selections = [sDefault, sRef, sVersion, sCatalog];
  const sync = new PersonalSync({
    home: root, spaceId: space.spaceId, endpoint: 'http://127.0.0.1:8788',
    authority: { signal: new AbortController().signal, assertCurrent() {}, async accessToken() { return 'synthetic'; } },
    registrations: [
      makeReg(sDefault),
      makeReg(sRef, { hasReference: () => true }),
      makeReg(sVersion, { restoreTier: 'version-store' }),
      makeReg(sCatalog, { restoreTier: 'catalog' }),
    ],
    fetch: async input => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/round') {
        return Response.json({ format: 1, policy: { spaceId: space.spaceId, revision: 1, selections }, quota: { limitBytes: 100000000, usedBytes: 0 },
          heads: selections.map(s => ({ namespace: syncNamespace(s), revision: 1 })) });
      }
      const ns = url.searchParams.get('namespace')!;
      return Response.json({ events: [{ operationId: 'op-' + ns, key: 'k', base: 0, revision: 1, value: { ok: true } }], more: false });
    },
  });
  t.after(() => sync.close());
  await sync.run();
  assert.equal(sync.status().error, null);
  assert.deepEqual(order, ['com.example.directory', 'com.example.versions', 'com.example.owner', 'com.example.consumer']);
});

test('PCSYNC-OPT-09 indicatorStatus reflects local edits when automatic sync is off without refreshCatalog scans',async t=>{
  const f=fixture(t),{home,sync}=f.create();
  let pending=0,refreshes=0;
  const selection={plugin_id:'io.example.ind',publisher_id:'example',publisher_signature:'example-key',collection_id:'docs',schema_version:1};
  const spaceId=sync.policy().spaceId;
  sync.close();
  const client=new PersonalSync({home,spaceId,endpoint:'http://127.0.0.1:8788',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},
    discover:async()=>{refreshes++;return [];},
    registrations:[{selection,title:'Docs',async refresh(){},async prepare(){},
      withReplica:run=>run({cursor:()=>0,next:()=>null,receive(){},acknowledge(){},counts:()=>({pending,conflicts:0}),conflicts:()=>[],resolve(){}})}],
    fetch:async()=>syncRoundResponse({spaceId,revision:1,selections:[selection]},0)});
  t.after(()=>client.close());
  await client.run();
  const afterRun=refreshes;
  assert.equal(client.indicatorStatus().progress.pending,0);
  assert.equal(client.indicatorStatus().progress.complete,true);
  // Idle 60s indicator checks do not trigger discover/refreshCatalog
  for(let i=0;i<30;i++){client.indicatorStatus();}
  assert.equal(refreshes,afterRun,'indicator reads never invoke catalog discovery');
  // Local edit with automatic sync disabled updates indicatorStatus on next read
  pending=2;
  client.notifyLocalChange();
  const updated=client.indicatorStatus();
  assert.equal(updated.progress.pending,2);
  assert.equal(updated.progress.complete,false);
  assert.equal(refreshes,afterRun,'local change refresh still avoids full catalog discovery');
});

test('PCSYNC-OPT-07 transport_backoff aborts concurrent sibling requests in the same layer instead of hammering the server', async t => {
  t.mock.timers.reset();
  const root = mkdtempSync(join(tmpdir(), 'molis-sync-backoff-abort-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(root, space);
  const selections = Array.from({ length: 5 }, (_, i) => ({
    plugin_id: `io.example.backoff${i}`,
    publisher_id: 'example',
    publisher_signature: 'example-key',
    collection_id: i === 0 ? 'projects' : `items-${i}`,
    schema_version: 1,
  }));
  const registrations = selections.map((selection, i) => ({
    selection,
    title: `Backoff ${i}`,
    async refresh() {},
    async prepare() {},
    withReplica: <T>(run: (replica: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncReplicaAdapter) => T) => run({
      cursor: () => 0,
      next: () => null,
      receive() {},
      acknowledge() {},
      counts: () => ({ pending: 0, conflicts: 0 }),
      conflicts: () => [],
      resolve() {},
    }),
  }));
  let changeCalls = 0;
  let abortedSiblings = 0;
  const sync = new PersonalSync({
    home: root,
    spaceId: space.spaceId,
    endpoint: 'http://127.0.0.1:8788',
    authority: { signal: new AbortController().signal, assertCurrent() {}, async accessToken() { return 'synthetic'; } },
    registrations,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/round') {
        return Response.json({
          format: 1,
          policy: { spaceId: space.spaceId, revision: 1, selections },
          quota: { limitBytes: 100000000, usedBytes: 0 },
          heads: selections.map(s => ({ namespace: syncNamespace(s), revision: 1 })),
        });
      }
      changeCalls++;
      if (changeCalls === 1) {
        return Response.json({ error: 'SYNC_RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } });
      }
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          abortedSiblings++;
          reject(new Error('aborted'));
          return;
        }
        signal?.addEventListener('abort', () => {
          abortedSiblings++;
          reject(new Error('aborted'));
        }, { once: true });
      });
    },
  });
  t.after(() => sync.close());
  await sync.run();
  assert.ok(sync.status().error !== null);
  // Non-platform collection_id='projects' must run in parallel with siblings (not isolated as platform catalog),
  // and when one sibling hits 429, remaining in-flight siblings abort without starting collections 4 & 5.
  assert.ok(changeCalls <= 3, `expected <= 3 requests before backoff abort, got ${changeCalls}`);
  assert.ok(abortedSiblings >= 1, 'in-flight sibling requests must be aborted on transport_backoff');
});

test('P2-9 transport_backoff immediately aborts concurrent blob chunks within a single collection', async t => {
  t.mock.timers.reset();
  const root = mkdtempSync(join(tmpdir(), 'molis-sync-blob-backoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(root, space);
  const selection = {
    plugin_id: 'io.example.blobbackoff',
    publisher_id: 'example',
    publisher_signature: 'example-key',
    collection_id: 'files',
    schema_version: 1,
  };
  // > 4 MiB so blob-transfer splits into 2 concurrent chunks uploaded together in transferParts().
  const payload = Buffer.alloc(4 * 1024 * 1024 + 1024, 0x42);
  const digest = createHash('sha256').update(payload).digest('hex');
  let chunkCalls = 0;
  let siblingChunkAborted = false;
  let resolveSiblingStarted!: () => void;
  const siblingStarted = new Promise<void>(resolve => { resolveSiblingStarted = resolve; });
  const sync = new PersonalSync({
    home: root,
    spaceId: space.spaceId,
    endpoint: 'http://127.0.0.1:8788',
    authority: { signal: new AbortController().signal, assertCurrent() {}, async accessToken() { return 'synthetic'; } },
    registrations: [{
      selection,
      title: 'Blob Backoff',
      async refresh() {},
      async prepare() {},
      content: {
        encode: (_key, value) => ({ value, blobs: [{ digest, size: payload.byteLength, bytes: payload }] }),
        decode: async (_key, value) => value,
      },
      withReplica: <T>(run: (replica: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncReplicaAdapter) => T) => run({
        cursor: () => 0,
        next: () => ({ key: 'big-file', operationId: 'op-big-1', base: 0, value: { name: 'big.bin' } }),
        receive() {},
        acknowledge() {},
        counts: () => ({ pending: 1, conflicts: 0 }),
        conflicts: () => [],
        resolve() {},
      }),
    }],
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/round') {
        return Response.json({
          format: 1,
          policy: { spaceId: space.spaceId, revision: 1, selections: [selection] },
          quota: { limitBytes: 100000000, usedBytes: 0 },
          heads: [{ namespace: syncNamespace(selection), revision: 0 }],
        });
      }
      if (url.pathname === '/v1/blobs/reserve') {
        return Response.json({ digest, size: payload.byteLength, ready: false, parts: [] });
      }
      if (url.pathname === '/v1/blobs/chunk') {
        const part = url.searchParams.get('part');
        chunkCalls++;
        if (part === '0') {
          await siblingStarted;
          return Response.json({ error: 'SYNC_RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } });
        }
        return new Promise<Response>((_, reject) => {
          resolveSiblingStarted();
          const signal = init?.signal;
          if (signal?.aborted) {
            siblingChunkAborted = true;
            reject(new Error('aborted'));
            return;
          }
          signal?.addEventListener('abort', () => {
            siblingChunkAborted = true;
            reject(new Error('aborted'));
          }, { once: true });
        });
      }
      return Response.json({ events: [], more: false });
    },
  });
  t.after(() => sync.close());
  const startedAt = Date.now();
  await sync.run();
  const elapsed = Date.now() - startedAt;
  assert.equal(chunkCalls, 2);
  assert.equal(siblingChunkAborted, true, 'sibling blob chunk must be aborted immediately on transport_backoff');
  assert.ok(elapsed < 5_000, `expected immediate abort instead of waiting for 45s chunk timeout, took ${elapsed}ms`);
  assert.ok(sync.status().error !== null);
});

test('F-modules-server-20 revoked setDevice does not persist device.json and retryItem enforces dependencies and 4 MiB chunk limit', async t => {
  t.mock.timers.reset();
  const root = mkdtempSync(join(tmpdir(), 'molis-sync-f20-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(root, space);
  const authority = new AbortController();
  let releaseRound!: () => void;
  const roundGate = new Promise<void>(resolve => { releaseRound = resolve; });
  let roundEntered!: () => void;
  const entered = new Promise<void>(resolve => { roundEntered = resolve; });
  const sync = new PersonalSync({
    home: root, spaceId: space.spaceId, endpoint: 'http://127.0.0.1:8788',
    registrations: [],
    authority: { signal: authority.signal, assertCurrent() { authority.signal.throwIfAborted(); }, accessToken: async () => 'synthetic' },
    fetch: async (input) => {
      if (new URL(String(input)).pathname === '/v1/round') {
        roundEntered();
        await roundGate;
        return syncRoundResponse({ spaceId: space.spaceId, revision: 1, selections: [] }, 0);
      }
      return Response.json({ spaceId: space.spaceId, revision: 1, selections: [] });
    },
  });
  t.after(() => sync.close());
  await sync.setDevice(true);
  await entered;
  const pendingToggle = sync.setDevice(false);
  authority.abort(new Error('revoked'));
  releaseRound();
  await assert.rejects(pendingToggle);
  const persisted = JSON.parse(readFileSync(join(root, 'sync', 'device.json'), 'utf8')) as { automatic: boolean };
  assert.equal(persisted.automatic, true, 'revoked setDevice must not dirty device.json before draining and re-authenticating');

  // retryItem must enforce declared sync dependencies before retrying a download.
  const dep = { plugin_id: 'io.example.dep', publisher_id: 'example', publisher_signature: 'sig', collection_id: 'base', schema_version: 1 };
  const child = { plugin_id: 'io.example.child', publisher_id: 'example', publisher_signature: 'sig', collection_id: 'items', schema_version: 1 };
  const childNs = syncNamespace(child);
  const home2 = join(root, 'retry-dep');
  ensureStorageSpace(home2, space);
  const sync2 = new PersonalSync({
    home: home2, spaceId: space.spaceId, endpoint: 'http://127.0.0.1:8788',
    authority: { signal: new AbortController().signal, assertCurrent() {}, accessToken: async () => 'synthetic' },
    registrations: [
      { selection: dep, title: 'Dep', available: () => false, async refresh() {}, async prepare() {},
        withReplica: run => run({ cursor: () => 0, next: () => null, receive() {}, acknowledge() {}, counts: () => ({ pending: 0, conflicts: 0 }), conflicts: () => [], resolve() {} }) },
      { selection: child, title: 'Child', dependencies: [dep], async refresh() {}, async prepare() {},
        withReplica: run => run({ cursor: () => 0, next: () => null, receive() {}, acknowledge() {}, counts: () => ({ pending: 0, conflicts: 0 }), conflicts: () => [], resolve() {} }) },
    ],
    fetch: async () => syncRoundResponse({ spaceId: space.spaceId, revision: 1, selections: [child] }, 0),
  });
  t.after(() => sync2.close());
  await sync2.run();
  await assert.rejects(() => sync2.retryItem(childNs, 'k1', 'download'), /依赖|开启|可用/);
});
