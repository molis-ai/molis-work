import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSyncDocument, createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { createAtomicFileDocument, createSqliteReplica, initializeReplica, replicaSchemaSql } from '@molis-ai/molis-work-storage';
import {PersonalSync, syncNamespace, partitionedReplica, type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';

test('sync status lists unselected collections without reading their business adapter', t => {
  const home=mkdtempSync(join(tmpdir(),'sync-status-'));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example','test','alice');
  ensureStorageSpace(home,space);
  let reads=0;
  const registration:SyncRegistration={selection:{plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'sig',collection_id:'items',schema_version:1},title:'Items',async refresh(){},async prepare(){},withReplica(){reads++;throw new Error('unselected');}};
  const sync=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example',registrations:[registration],authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){throw new Error('no network');}}});
  t.after(()=>sync.close());
  const status=sync.status();
  assert.equal(status.collections.length,1);
  assert.equal(status.collections[0]!.pending,0);
  assert.equal(reads,0);
});

test('QRF-03: one decision after 100 waiting items stays visible through each adapter, partitions and pagination', async t => {
  const home = mkdtempSync(join(tmpdir(), 'sync-status-pages-'));
  t.after(() => rmSync(home, {recursive:true, force:true}));
  const space = personalStorageSpace('https://auth.example','test','alice');
  ensureStorageSpace(home, space);
  const selection = {plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'sig',collection_id:'items',schema_version:1};
  const namespace = syncNamespace(selection);
  const policy = {spaceId:space.spaceId,revision:1,selections:[selection]};
  for (const mode of ['document', 'sqlite', 'partitioned']) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.exec(replicaSchemaSql()); initializeReplica(db);
    let restricted = false;
    const authorize = () => {};
    const scope = (_key: string, value?: unknown) => {
      if (restricted && value === 'private') throw Object.assign(new Error('other scope'), {kind:'forbidden'});
    };
    let promote: string | undefined;
    const apply = (key: string) => {
      if (key.startsWith('a') && key !== promote) throw Object.assign(new Error('waiting for input'), {details:{sync_waiting:true}});
      throw new Error('decision required');
    };
    const file = createSyncDocument({spaceId:space.spaceId, storage:createAtomicFileDocument(join(home,mode+'.json'),authorize),
      authorize, authorizeKey:(_data,key,value)=>scope(key,value), initial:()=>({}), validate:()=>({}), observe:()=>new Map(),
      read:()=>null, apply:(_data,key)=>apply(key)}).replica;
    const sqlite = createSqliteReplica(db,{authorize, authorizeKey:scope, conflictState:createSyncConflictState, read:()=>null, apply});
    const partitions = partitionedReplica({home, namespace, authorize, partitions:()=>['docs','db'],
      partition:key=>key.startsWith('a')?'docs':'db', withPartition:(id,fn)=>fn(id==='docs'?file:sqlite)});
    const replica = mode === 'document' ? file : mode === 'sqlite' ? sqlite : partitions;
    const registration: SyncRegistration = {selection, title:'Notes', async refresh(){}, async prepare(){}, withReplica:fn=>fn(replica)};
    const client = new PersonalSync({home, spaceId:space.spaceId, endpoint:'https://sync.example', registrations:[registration],
      authority:{signal:new AbortController().signal, assertCurrent:authorize, async accessToken(){return 'fixture';}}, fetch:async()=>Response.json(policy)});
    try {
      if (!client.status().policy.selections.length) await client.save({...policy,revision:0});
      let revision = 0;
      for (const key of [...Array.from({length:100},(_,i)=>'a'+i),'z-action','y-private']) {
        replica.receive({key, operationId:'other:'+ ++revision, base:0, revision, value:key==='y-private'?'private':'remote'});
      }
      restricted = true;
      const status = client.status();
      const first = status.collections[0]!;
      assert.equal(first.conflicts[0]?.key, 'z-action', mode);
      assert.equal(first.conflicts.length, 100);
      assert.ok(first.nextConflict);
      const last = client.listConflicts(namespace,first.nextConflict);
      assert.equal(last.nextConflict,null);
      const keys = [...first.conflicts,...last.conflicts].map(item=>item.key);
      assert.deepEqual([status.progress.conflicts,status.progress.waiting,keys.length,new Set(keys).size],[1,100,101,101],mode);
      assert.ok(!keys.includes('y-private'));
      promote = last.conflicts[0]!.key;
      replica.receive({key: promote, operationId: 'new:'+ ++revision, base:0, revision, value:'updated'});
      const moved = client.listConflicts(namespace, first.nextConflict);
      assert.equal(moved.restarted,true);
      assert.deepEqual([moved.decisionCount,moved.waitingCount], [2,99]);
      assert.ok(moved.conflicts.slice(0,2).some(item=>item.key === promote && !item.waiting));
    } finally { client.close(); }
  }
});
