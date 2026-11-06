import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalSync,syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import {createSqliteReplica,initializeReplica,replicaSchemaSql,queueReplicaChange,ensureStorageSpace,personalStorageSpace,openBaselineHomeSqlite} from '@molis-ai/molis-work-storage';
import {ActionError} from '@molis-ai/molis-work-plugin-sdk';
import type {SyncEvent,SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';

import {createSyncItemFixture as fixture} from './fixtures/sync-items.js';

test('PCSYNC-14 bad incoming content is durable and does not block another asset; retry revisits only its head',async t=>{
 const f=fixture(t);f.events.push({operationId:'a:1',key:'broken',base:0,revision:1,value:'recovered'},{operationId:'a:2',key:'healthy',base:0,revision:2,value:'good'});
 await f.client.run();assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('healthy')?.value,'good');assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken'),undefined);
 assert.deepEqual(f.prepared,[{key:'healthy',retry:false}]);
 assert.equal(f.replica.cursor(),2);assert.equal(f.client.status().collections[0]!.failures.length,1);assert.match(f.client.status().error??'',/1 项需要处理/);
 f.restart();await f.client.run();assert.equal(f.client.status().collections[0]!.failures.length,1,'restart retains the exact quarantined item');
 f.repair();await f.client.retryItem(syncNamespace(f.selection),'broken','download');assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'recovered');assert.equal(f.replica.cursor(),2);assert.equal(f.client.status().collections[0]!.failures.length,0);assert.equal(f.replica.next(),null,'recovery never echoes');
 assert.ok(f.prepared.some(p=>p.key==='broken'&&p.retry),'explicit retry passes retry semantics to owner preparation');
 f.replica.receive({operationId:'a:3',key:'broken',base:1,revision:3,value:'newest'});f.replica.receive(f.events[0]!,{retry:true});assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'newest','a stale retry cannot overwrite a newer head');
});

test('PCSYNC-14 a broken local export keeps its source and queue while healthy uploads continue',async t=>{
 const f=fixture(t);f.setBadRead(true);f.edit('broken','unique original');f.edit('healthy','new content');
 await f.client.run();assert.ok(f.events.some(e=>e.key==='healthy'));assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'unique original');assert.equal(f.replica.counts().pending,1);
 const failures=f.client.status().collections[0]!.failures;assert.equal(failures.length,1);assert.equal(failures[0]!.direction,'upload');
 f.repair();await f.client.retryItem(syncNamespace(f.selection),'broken','upload');assert.ok(f.events.some(e=>e.key==='broken'));assert.equal(f.replica.counts().pending,0);
});
test('PCSYNC-14 temporary owner unavailability waits only this cycle; healthy items upload without permanent quarantine',async t=>{
 const f=fixture(t);f.repair();f.setUnavailable(true);f.edit('broken','waiting for local work');f.edit('healthy','ready');
 await f.client.run();assert.ok(f.events.some(e=>e.key==='healthy'));assert.equal(f.replica.counts().pending,1);assert.equal(f.client.status().collections[0]!.failures.length,0);assert.match(f.client.status().error??'',/本机处理/);
 f.setUnavailable(false);await f.client.run();assert.ok(f.events.some(e=>e.key==='broken'));assert.equal(f.replica.counts().pending,0);assert.equal(f.client.status().error,null);
});
test('PCSYNC-14 temporarily unavailable incoming items persist across restart and recover without blocking healthy downloads',async t=>{
 const f=fixture(t);f.repair();f.setUnavailable(true);f.events.push({operationId:'a:1',key:'broken',base:0,revision:1,value:'later'},{operationId:'a:2',key:'healthy',base:0,revision:2,value:'ready'});
 await f.client.run();assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('healthy')?.value,'ready');assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken'),undefined);
 assert.equal(f.client.status().collections[0]!.failures[0]!.automatic,true);assert.equal(f.replica.cursor(),2);
 f.restart();f.events.push({operationId:'a:3',key:'healthy',base:2,revision:3,value:'newer healthy'});await f.client.run();assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('healthy')?.value,'newer healthy');assert.equal(f.client.status().collections[0]!.failures.length,1);
 f.setUnavailable(false);await f.client.run();assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'later');assert.equal(f.replica.cursor(),3);assert.equal(f.client.status().collections[0]!.failures.length,0);assert.equal(f.client.status().error,null);assert.equal(f.replica.next(),null);
 assert.ok(f.prepared.some(p=>p.key==='broken'&&p.retry),'automatic deferred replay passes retry semantics to owner preparation');
});

test('PCSYNC-14 unavailable original bytes skip only that frozen upload; another asset progresses and retry keeps its receipt',async t=>{
 const f=fixture(t);f.repair();f.edit('broken','unique original');f.edit('healthy','ready');const frozen=f.replica.next()!;f.setUnavailableEncode(true);
 await f.client.run();assert.ok(f.events.some(e=>e.key==='healthy'));assert.equal(f.replica.counts().pending,1);assert.equal(f.replica.next()!.operationId,frozen.operationId);assert.equal(f.client.status().collections[0]!.failures.length,0);assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'unique original');
 f.setUnavailableEncode(false);await f.client.run();assert.ok(f.events.some(e=>e.key==='broken'&&e.operationId===frozen.operationId));assert.equal(f.replica.counts().pending,0);assert.equal(f.client.status().error,null);
});
test('PCSYNC-14 a newer head retires a deferred download rather than reviving stale content',async t=>{
 const f=fixture(t);f.repair();f.setUnavailable(true);f.events.push({operationId:'a:1',key:'broken',base:0,revision:1,value:'stale'});await f.client.run();
 assert.equal(f.client.status().collections[0]!.failures.length,1);f.events.push({operationId:'a:2',key:'broken',base:1,revision:2,value:'current'});f.setUnavailable(false);f.replica.receive(f.events[1]!);await f.client.run();
 assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'current');assert.equal(f.client.status().collections[0]!.failures.length,0);assert.equal(f.replica.next(),null);
});
test('PCSYNC-12 deferred-replay schema refuses an old v3 sync library intact',t=>{
 const home=mkdtempSync(join(tmpdir(),'molis-sync-v3-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const db=openBaselineHomeSqlite(home,'sync',{version:3,schema:readFileSync(new URL('./fixtures/home-store-schemas/sync-v3.sql',import.meta.url),'utf8')});db.close();const file=join(home,'sync','sync.db'),before=readFileSync(file);
 assert.throws(()=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',registrations:[],authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){throw new Error('Must not authenticate');}},fetch:async()=>{throw new Error('Must not connect');}}),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(file),before);
});


test('PCSYNC-20 asynchronous mutation admission rechecks local edits before receive and encloses retry paths',async t=>{
 const seen:string[]=[];let editDuringWait=()=>{};
 const f=fixture(t,async(scope,commit)=>{seen.push(scope.kind);if(scope.kind==='receive'){await Promise.resolve();editDuringWait();}return commit();});f.repair();
 f.events.push({operationId:'remote',key:'healthy',base:0,revision:1,value:'remote body'});
 editDuringWait=()=>f.edit('healthy','new local edit');await f.client.run();
 assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('healthy')?.value,'new local edit');
 assert.equal(f.replica.conflicts().length,1,'final receive must detect edits made during lifecycle admission');
 assert.ok(seen.includes('retry-waiting'));assert.ok(seen.includes('receive'));
});

test('PCSYNC-20 an abandoned mutation admission cannot invoke its saved commit after returning',async t=>{
 let saved:(()=>unknown)|undefined;
 const f=fixture(t,async(_scope,commit)=>{saved=commit;return undefined as never;});f.repair();
 f.events.push({operationId:'remote',key:'healthy',base:0,revision:1,value:'must not apply'});
 await f.client.run();assert.ok(saved);assert.throws(()=>saved!(),/SCOPE_CLOSED/);
 assert.equal(f.replica.cursor(),0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM items').get()!.n,0);
 assert.ok(f.client.status().error,'not committing must not be reported as successful synchronization');
});
