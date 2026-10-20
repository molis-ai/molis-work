import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createArtifactSyncContent} from '@molis-ai/molis-work-module-artifacts';
import {PersonalSync,syncNamespace} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {openBaselineHomeSqlite} from '@molis-ai/molis-work-storage';
import {SYNC_STORE_BASELINE} from '@molis-ai/molis-work-module-sync-replication';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const key=JSON.stringify(['project','artifact','file']);
const value=(payload:unknown)=>({project:{id:'project',title:'File'},artifact:{format:1,spaceId:'space-alice',projectId:'project',identity:{artifact_id:'file'},versions:[{version:1,artifact_type_id:'io.molis.work.document',payload}]}});
test('S-62 PCSYNC-11/13 owner projects raw file bytes and large bodies without changing immutable payloads',async()=>{
  const codec=createArtifactSyncContent('space-alice'),file=Buffer.alloc(700000,31),original=value({content:'正文'.repeat(100000),original_file:{filename:'image.jpg',mime:'image/jpeg',data_base64:file.toString('base64')}});
  const encoded=codec.encode(key,original);assert.equal(encoded.blobs.length,2);assert.ok(encoded.blobs.some(b=>Buffer.from(b.bytes).equals(file)));assert.ok(Buffer.byteLength(JSON.stringify(encoded.value))<512*1024);
  const restored=await codec.decode(key,encoded.value,async ref=>{const source=encoded.blobs.find(b=>b.digest===ref.digest&&b.size===ref.size);assert.ok(source);return source.bytes;});
  assert.deepEqual(restored,original);assert.equal(original.artifact.format,1,'no mutation of the owner snapshot');
  const empty=value({original_file:{filename:'empty.bin',mime:'application/octet-stream',data_base64:''}}),projected=codec.encode(key,empty);
  assert.deepEqual(await codec.decode(key,projected.value,async ref=>projected.blobs.find(b=>b.digest===ref.digest)!.bytes),empty,'an empty imported file remains portable without a zero-byte reservation');
  await assert.rejects(()=>codec.decode(key,encoded.value,async()=>Buffer.from('corrupt')),/校验失败/);
});

for(const version of [1,2,3,4])test(`S-62 PCSYNC-12 the current sync store refuses and preserves an existing v${version} file`,t=>{
  const home=mkdtempSync(join(tmpdir(),'molis-sync-v1-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice'));
  const schema=readFileSync(new URL(version===1?'./fixtures/home-store-schemas/sync.sql':`./fixtures/home-store-schemas/sync-v${version}.sql`,import.meta.url),'utf8'),old=openBaselineHomeSqlite(home,'sync',{version,schema});
  old.prepare('INSERT INTO sync_policy VALUES(1,?)').run('{"preserved":true}');old.close();
  const path=join(home,'sync','sync.db'),before=readFileSync(path);
  assert.throws(()=>openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE),/version|版本/i);assert.deepEqual(readFileSync(path),before);
});

test('S-62 PCSYNC-06/12 revocation during a file download prevents late cache and owner writes',async t=>{
  const home=mkdtempSync(join(tmpdir(),'molis-blob-revoke-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const bytes=Buffer.from('private content'),digest=createHash('sha256').update(bytes).digest('hex'),reference={digest,size:bytes.length};let active=true,commits=0;
  const selection={plugin_id:'io.example.files',publisher_id:'example',publisher_signature:'synthetic',collection_id:'files',schema_version:1};
  const replica={cursor:()=>0,next:()=>null,receive:()=>{commits++;},acknowledge(){throw new Error('no upload expected');},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}};
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){if(!active)throw new Error('REVOKED');},async accessToken(){return 'synthetic';}},registrations:[{selection,title:'Files',content:{encode:value=>({value,blobs:[]}),async decode(_key,value,read){await read(reference);return value;}},async refresh(){},async prepare(){},withReplica:run=>run(replica)}],fetch:async input=>{
    const path=new URL(String(input)).pathname;
    if(path==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},1);
    if(path==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:[selection]});
    if(path==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
    if(path==='/v1/changes')return Response.json({events:[{operationId:'saved',key:'file',base:0,revision:1,value:{},attachments:[reference]}],more:false});
    if(path==='/v1/blobs/status')return Response.json({...reference,ready:true,parts:[{part:0,checksum:digest}]});
    assert.equal(path,'/v1/blobs/chunk');active=false;return new Response(bytes);
  }});t.after(()=>client.close());await client.run();assert.throws(()=>client.status(),/REVOKED/);
  assert.equal(commits,0);const db=openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE);try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync_blob_parts').get()!.n,0);}finally{db.close();}
});
test('S-62 PCSYNC-01/11 owner rejects foreign space, project or identity before reading bytes',async()=>{
  const codec=createArtifactSyncContent('space-alice'),encoded=codec.encode(key,value({original_file:{data_base64:Buffer.from('bytes').toString('base64'),filename:'x',mime:'application/octet-stream'}}));
  for(const change of [(v:ReturnType<typeof value>)=>v.artifact.spaceId='space-bob',(v:ReturnType<typeof value>)=>v.project.id='other',(v:ReturnType<typeof value>)=>v.artifact.identity.artifact_id='other']){
    const input=structuredClone(encoded.value) as ReturnType<typeof value>;change(input);let reads=0;
    await assert.rejects(()=>codec.decode(key,input,async()=>{reads++;return new Uint8Array();}),/不匹配/);assert.equal(reads,0);
  }
  assert.throws(()=>codec.encode(key,value({original_file:{data_base64:'not base64',filename:'x',mime:'x'}})),/编码无效/);
});
test('S-62 PCSYNC-11 common coordinator rejects an undeclared body reference before network or owner commit',async t=>{
  const home=mkdtempSync(join(tmpdir(),'molis-blob-scope-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selection={plugin_id:'io.example.files',publisher_id:'example',publisher_signature:'synthetic',collection_id:'files',schema_version:1},namespace=syncNamespace(selection),codec=createArtifactSyncContent('space-alice');
  const encoded=codec.encode(key,value({original_file:{filename:'x',mime:'x',data_base64:Buffer.from('saved').toString('base64')}}));let commits=0,blobRequests=0;
  const replica={cursor:()=>0,next:()=>null,receive:()=>{commits++;},acknowledge(){throw new Error('no upload expected');},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}};
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},registrations:[{selection,title:'Files',content:codec,async refresh(){},async prepare(){},withReplica:run=>run(replica)}],fetch:async input=>{
    const url=new URL(String(input));if(url.pathname.startsWith('/v1/blobs'))blobRequests++;
    if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},1);
    if(url.pathname==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:[selection]});
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
    assert.equal(url.searchParams.get('namespace'),namespace);return Response.json({events:[{operationId:'saved',key,base:0,revision:1,value:encoded.value,attachments:[]}],more:false});
  }});t.after(()=>client.close());await client.run();assert.match(client.status().error??'',/未声明/);assert.equal(commits,0);assert.equal(blobRequests,0);
});
