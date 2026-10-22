import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PersonalSync,syncNamespace,SYNC_STORE_BASELINE,hasProtectedSyncPayloads,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace,createLazyFileSecretStore,createLocalPayloadProtection,openBaselineHomeSqlite} from '@molis-ai/molis-work-storage';
import type {SyncLocalProtection} from '@molis-ai/molis-work-contracts/platform/sync-transport';

function fixture(t:TestContext,two=false){
  const home=mkdtempSync(join(tmpdir(),'sync-private-cache-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const body=Buffer.from('private-session-DO-NOT-PERSIST-PLAINTEXT'.repeat(3000)),digest=createHash('sha256').update(body).digest('hex'),reference={digest,size:body.length};
  const selections=Array.from({length:two?2:1},(_,i)=>({plugin_id:'io.example.private',publisher_id:'example',publisher_signature:'synthetic',collection_id:'sessions'+i,schema_version:1}));
  let selected=[...selections],fail=true,active=true,chunks=0,commits=0;
  const cursors=new Map<string,number>(),secrets=createLazyFileSecretStore(home),keyRef='system:test:private-sync-cache';
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const protection=createLocalPayloadProtection({secrets,keyRef,scope:space.spaceId,authorize,hasProtectedData:()=>selections.some(s=>hasProtectedSyncPayloads(home,syncNamespace(s)))});
  const db=<T>(run:(c:ReturnType<typeof openBaselineHomeSqlite>)=>T)=>{const c=openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE);try{return run(c);}finally{c.close();}};
  const create=(local:SyncLocalProtection|null=protection)=>{
    const registrations:SyncRegistration[]=selections.map(selection=>{
      const namespace=syncNamespace(selection);
      return {selection,title:'Private sessions',protection:local??undefined,refresh:async()=>{},prepare:async()=>{},
        content:{encode:value=>({value,blobs:[]}),async decode(_key,value,read){assert.deepEqual(Buffer.from(await read(reference)),body);return value;}},
        withReplica:run=>run({cursor:()=>cursors.get(namespace)??0,next:()=>null,acknowledge(){throw new Error('unexpected upload');},
          receive(event){if(fail)throw Object.assign(new Error(body.toString()),{kind:'unavailable'});authorize();commits++;cursors.set(namespace,event.revision);},
          counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}}),
      };
    });
    const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent:authorize,accessToken:async()=>'synthetic'},registrations,fetch:async input=>{
      const url=new URL(String(input));
      if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:selected},1,body.length);
      if(url.pathname==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:selected});
      if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:body.length});
      if(url.pathname==='/v1/changes')return Response.json({events:Number(url.searchParams.get('after'))<1?[{operationId:'remote',key:'session',base:0,revision:1,value:{text:body.toString()},attachments:[reference]}]:[],more:false});
      if(url.pathname==='/v1/blobs/status')return Response.json({...reference,ready:true,parts:[{part:0,checksum:digest}]});
      assert.equal(url.pathname,'/v1/blobs/chunk');chunks++;return new Response(body);
    }});t.after(()=>client.close());return client;
  };
  const snapshot=()=>db(c=>({parts:c.prepare('SELECT * FROM sync_blob_parts ORDER BY namespace,part').all(),failures:c.prepare('SELECT * FROM sync_failures ORDER BY namespace,key').all(),cursors:c.prepare('SELECT * FROM sync_stream_cursors ORDER BY namespace').all()}));
  return {home,body,selections,protection,secrets,keyRef,create,db,snapshot,healthy:()=>{fail=false;},selectFirst:()=>{selected=selections.slice(0,1);},get chunks(){return chunks;},get commits(){return commits;},revoke:()=>{active=false;}};
}

test('S-58 PCSYNC-23 private download parts and deferred events stay sealed and resume after coordinator restart',async t=>{
  const f=fixture(t),a=f.create();await a.run();a.close();
  assert.equal(f.chunks,1);assert.equal(f.commits,0);
  const saved=f.snapshot();assert.equal(saved.parts.length,1);assert.equal(saved.failures.length,1);
  assert.equal(hasProtectedSyncPayloads(f.home,syncNamespace(f.selections[0]!)),true);
  assert.notEqual(Buffer.from(saved.parts[0]!.bytes as Uint8Array).toString(),f.body.toString());
  assert.ok(String(saved.failures[0]!.event).startsWith('sealed-sync:1:'));
  assert.equal(String(saved.failures[0]!.reason).includes('private-session'),false);
  for(const suffix of ['','-wal']){const path=join(f.home,'sync','sync.db'+suffix);if(existsSync(path))assert.equal(readFileSync(path).includes(Buffer.from('private-session-DO-NOT-PERSIST-PLAINTEXT')),false);}
  f.healthy();const b=f.create();await b.run();assert.equal(b.status().error,null);
  assert.equal(f.commits,1);assert.equal(f.chunks,1,'restart decodes authenticated cached bytes without another download');
  assert.deepEqual(f.snapshot().parts,[]);assert.deepEqual(f.snapshot().failures,[]);
});

test('S-58 PCSYNC-12 missing private-cache key cannot replace data or advance the rejected event',async t=>{
  const f=fixture(t),a=f.create();await a.run();a.close();const before=f.snapshot();
  f.secrets.delete(f.keyRef);const sealedSecrets=readFileSync(join(f.home,'feed','secrets.json'));
  f.healthy();const b=f.create();await b.run();assert.match(b.status().error??'',/密钥不可用/);
  assert.equal(f.commits,0);assert.equal(f.chunks,1);assert.deepEqual(f.snapshot(),before);
  assert.deepEqual(readFileSync(join(f.home,'feed','secrets.json')),sealedSecrets);
});

test('S-58 PCSYNC-01 dropping the trusted protection port cannot silently reopen the same namespace in plaintext mode',async t=>{
  const f=fixture(t),a=f.create();await a.run();a.close();const before=f.snapshot();
  const selection=f.selections[0]!,namespace=syncNamespace(selection);
  const c=f.create(null);await c.run();assert.match(c.status().error??'',/保护配置已变化/);assert.deepEqual(f.snapshot(),before);
  assert.equal(f.db(db=>db.prepare('SELECT protected FROM sync_payload_modes WHERE namespace=?').get(namespace)!.protected),1);
});

test('S-58 PCSYNC-01 identical blob digests in separate namespaces retain independent protected caches and release only the accepted owner',async t=>{
  const f=fixture(t,true),a=f.create();await a.run();a.close();const before=f.snapshot();
  assert.equal(before.parts.length,2);assert.equal(f.chunks,2);
  assert.notDeepEqual(before.parts[0]!.bytes,before.parts[1]!.bytes);
  f.selectFirst();f.healthy();const b=f.create();await b.run();assert.equal(b.status().error,null);
  assert.equal(f.commits,1);const after=f.snapshot();assert.equal(after.parts.length,1);
  const other=syncNamespace(f.selections[1]!);assert.equal(after.parts[0]!.namespace,other);
  assert.deepEqual(after.parts[0],before.parts.find(row=>row.namespace===other));
});

test('S-58 PCSYNC-01 cross-namespace cached ciphertext is rejected without redownload or owner writes',async t=>{
  const f=fixture(t,true),a=f.create();await a.run();a.close();const saved=f.snapshot();
  f.db(c=>c.prepare('UPDATE sync_blob_parts SET bytes=? WHERE namespace=?').run(saved.parts[0]!.bytes,saved.parts[1]!.namespace));
  const before=f.snapshot();f.healthy();const b=f.create();await b.run();assert.match(b.status().error??'',/需要处理/);
  assert.equal(f.commits,1,'only the untampered namespace may commit');assert.equal(f.chunks,2,'corrupted protected parts do not fall back to a fresh plaintext download');
  const other=String(saved.parts[1]!.namespace);assert.deepEqual(f.snapshot().parts,before.parts.filter(row=>row.namespace===other));
});

test('S-58 PCSYNC-01 transplanted deferred event ciphertext cannot be replayed under another collection',async t=>{
  const f=fixture(t,true),a=f.create();await a.run();a.close();const saved=f.snapshot();
  const other=String(saved.failures[1]!.namespace);
  f.db(c=>c.prepare('UPDATE sync_failures SET event=? WHERE namespace=?').run(saved.failures[0]!.event,other));
  const before=f.snapshot();f.healthy();const b=f.create();await b.run();assert.match(b.status().error??'',/AEAD/);
  assert.equal(f.commits,1);assert.equal(f.chunks,2);
  assert.deepEqual(f.snapshot().failures,before.failures.filter(row=>row.namespace===other));
  assert.deepEqual(f.snapshot().parts,before.parts.filter(row=>row.namespace===other));
});

test('S-58 PCSYNC-23 the protected-data predicate is read-only and does not initialize a new Home',t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-protection-predicate-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  assert.equal(hasProtectedSyncPayloads(home,'private'),false);assert.equal(existsSync(join(home,'sync')),false);
});
