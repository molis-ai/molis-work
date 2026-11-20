import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,statSync,existsSync} from 'node:fs';
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
test('S-126 PCSYNC-11/13 owner projects raw file bytes and large bodies without changing immutable payloads',async()=>{
  const codec=createArtifactSyncContent('space-alice'),file=Buffer.alloc(700000,31),original=value({content:'正文'.repeat(100000),original_file:{filename:'image.jpg',mime:'image/jpeg',data_base64:file.toString('base64')}});
  const encoded=codec.encode(key,original);assert.equal(encoded.blobs.length,2);assert.ok(JSON.stringify(encoded.value).includes('"artifact":{"format":2,"spaceId":"space-alice"'),'the attached encoding says 2, in its place on the wire');assert.ok(encoded.blobs.some(b=>Buffer.from(b.bytes).equals(file)));assert.ok(Buffer.byteLength(JSON.stringify(encoded.value))<512*1024);
  const restored=await codec.decode(key,encoded.value,async ref=>{const source=encoded.blobs.find(b=>b.digest===ref.digest&&b.size===ref.size);assert.ok(source);return source.bytes;});
  assert.deepEqual(restored,original);assert.equal(original.artifact.format,1,'no mutation of the owner snapshot');
  const empty=value({original_file:{filename:'empty.bin',mime:'application/octet-stream',data_base64:''}}),projected=codec.encode(key,empty);
  assert.deepEqual(await codec.decode(key,projected.value,async ref=>projected.blobs.find(b=>b.digest===ref.digest)!.bytes),empty,'an empty imported file remains portable without a zero-byte reservation');
  await assert.rejects(()=>codec.decode(key,encoded.value,async()=>Buffer.from('corrupt')),/校验失败/);
});

test("QEA-80: sync carries exact historical and current import warnings with their fixed versions", async () => {
  const codec = createArtifactSyncContent("space-alice");
  const original = value({ content: "Earlier import", warnings: ["旧版本保存的原话。"] });
  const prior = { ...original.artifact.versions[0]!, schema_version: 1 };
  const current = { ...prior, version: 2, schema_version: 2, payload: {
    content: "Later import", warnings: [{ key: "workbench.import.warning-transcription-model-size", args: [{ name: "megabytes", kind: "number", number: 626 }] }],
  } };
  const snapshot = { ...original, artifact: { ...original.artifact, versions: [prior, current] } };
  const encoded = codec.encode(key, snapshot);
  const restored = await codec.decode(key, encoded.value, async ref => encoded.blobs.find(blob => blob.digest === ref.digest)!.bytes);
  assert.deepEqual(restored, snapshot);
});

for(const version of [1,2,3,4])test(`S-126 PCSYNC-12 the current sync store refuses and preserves a mismatched v${version} file`,t=>{
  const home=mkdtempSync(join(tmpdir(),'molis-sync-v1-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice'));
  const current=readFileSync(new URL('./fixtures/home-store-schemas/sync.sql',import.meta.url),'utf8');
  const schema=version===1?`${current}; DROP TABLE sync_blob_parts;`:current,old=openBaselineHomeSqlite(home,'sync',{version,schema});
  old.prepare('INSERT INTO sync_policy VALUES(1,?)').run('{"preserved":true}');old.close();
  const path=join(home,'sync','sync.db'),before=readFileSync(path);
  const code=version<SYNC_STORE_BASELINE.version?'storage.upgrade_pending':
    version===SYNC_STORE_BASELINE.version?'storage.schema_structure_mismatch':'storage.store_too_new';
  assert.throws(()=>openBaselineHomeSqlite(home,'sync',SYNC_STORE_BASELINE),{code});assert.deepEqual(readFileSync(path),before);
});

test('S-126 PCSYNC-06/12 revocation during a file download prevents late cache and owner writes',async t=>{
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

test('PCSYNC-OPT-08 a 50 MB ordinary attachment resumes from private files without filling SQLite',async t=>{
  t.mock.timers.enable({apis:['Date']});
  const home=mkdtempSync(join(tmpdir(),'molis-file-stage-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const size=50_000_000,chunk=4*1024*1024,hash=createHash('sha256');
  const partBytes=(part:number)=>Buffer.alloc(Math.min(chunk,size-part*chunk),part+1);
  const parts=Array.from({length:Math.ceil(size/chunk)},(_,part)=>{
    const bytes=partBytes(part);hash.update(bytes);
    return {part,checksum:createHash('sha256').update(bytes).digest('hex')};
  });
  const reference={size,digest:hash.digest('hex')};
  const selection={plugin_id:'io.example.files',publisher_id:'example',publisher_signature:'synthetic',collection_id:'files',schema_version:1};
  const namespace=syncNamespace(selection),scope={spaceId:space.spaceId,revision:1,selections:[selection]};
  const stage=join(home,'sync','staging','v1',createHash('sha256').update(namespace).digest('hex'),reference.digest);
  let downloaded=0,applied=false,ready=false,active=0,peak=0;
  const create=()=>new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},
    registrations:[{selection,title:'Files',async refresh(){},async prepare(){if(!ready)throw new Error('Missing owner dependency');},
      content:{encode(value){return {value,blobs:[]};},async decode(_key,_value,read){
        assert.equal(createHash('sha256').update(await read(reference)).digest('hex'),reference.digest);return {};
      }},
      withReplica:run=>run({cursor:()=>applied?1:0,next:()=>null,receive(){applied=true;},acknowledge(){},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}})}],
    fetch:async input=>{
      const url=new URL(String(input));
      if(url.pathname==='/v1/round')return syncRoundResponse(scope,1);
      if(url.pathname==='/v1/changes')return Response.json({events:[{key:'file',base:0,operationId:'remote',revision:1,value:{},attachments:[reference]}],more:false});
      if(url.pathname==='/v1/blobs/status')return Response.json({...reference,ready:true,parts});
      assert.equal(url.pathname,'/v1/blobs/chunk');
      downloaded++;peak=Math.max(peak,++active);
      await new Promise(resolve=>setImmediate(resolve));
      active--;return new Response(partBytes(Number(url.searchParams.get('part'))));
    }});
  const first=create();
  try{await first.run();assert.equal(applied,false);}finally{first.close();}
  assert.equal(downloaded,parts.length);
  assert.equal(peak,2);
  assert.ok(statSync(join(home,'sync','sync.db')).size<1_000_000);
  assert.equal(statSync(join(stage,'0')).mode & 0o777,0o600);
  ready=true;t.mock.timers.tick(15_000);
  const resumed=create();
  try{await resumed.run();assert.equal(resumed.status().error,null);}finally{resumed.close();}
  assert.ok(applied);
  assert.equal(downloaded,parts.length,'restart reused the staged parts');
  assert.equal(existsSync(stage),false,'a committed owner releases the stage');
});
test('S-126 PCSYNC-01/11 owner rejects foreign space, project or identity before reading bytes',async()=>{
  const codec=createArtifactSyncContent('space-alice'),encoded=codec.encode(key,value({original_file:{data_base64:Buffer.from('bytes').toString('base64'),filename:'x',mime:'application/octet-stream'}}));
  for(const change of [(v:ReturnType<typeof value>)=>v.artifact.spaceId='space-bob',(v:ReturnType<typeof value>)=>v.project.id='other',(v:ReturnType<typeof value>)=>v.artifact.identity.artifact_id='other']){
    const input=structuredClone(encoded.value) as ReturnType<typeof value>;change(input);let reads=0;
    await assert.rejects(()=>codec.decode(key,input,async()=>{reads++;return new Uint8Array();}),/不匹配/);assert.equal(reads,0);
  }
  assert.throws(()=>codec.encode(key,value({original_file:{data_base64:'not base64',filename:'x',mime:'x'}})),/编码无效/);
});
test('S-126 PCSYNC-11 common coordinator rejects an undeclared body reference before network or owner commit',async t=>{
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

test('PCSYNC-OPT-08 staging keeps sync.db under 1 MB across 24 MiB downloads and reports byte transfer progress',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout']});
  const home=mkdtempSync(join(tmpdir(),'molis-blob-progress-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const size=24*1024*1024,chunk=4*1024*1024;
  const partBytes=(part:number)=>Buffer.alloc(Math.min(chunk,size-part*chunk),part+11);
  const hasher=createHash('sha256');
  const parts=Array.from({length:Math.ceil(size/chunk)},(_,part)=>{const b=partBytes(part);hasher.update(b);return {part,checksum:createHash('sha256').update(b).digest('hex')};});
  const reference={size,digest:hasher.digest('hex')};
  const selection={plugin_id:'io.example.large',publisher_id:'example',publisher_signature:'synthetic',collection_id:'large',schema_version:1};
  const scope={spaceId:space.spaceId,revision:1,selections:[selection]};
  let applied=false,seenProgress=false;
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',
    authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){return 'synthetic';}},
    registrations:[{selection,title:'Large',async refresh(){},async prepare(){},
      content:{encode(v){return {value:v,blobs:[]};},async decode(_k,_v,read){const b=await read(reference);assert.equal(createHash('sha256').update(b).digest('hex'),reference.digest);return {};}},
      withReplica:run=>run({cursor:()=>applied?1:0,next:()=>null,receive(){applied=true;},acknowledge(){},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}})}],
    fetch:async input=>{
      const url=new URL(String(input));
      if(url.pathname==='/v1/round')return syncRoundResponse(scope,1);
      if(url.pathname==='/v1/changes')return Response.json({events:[{key:'big',base:0,operationId:'op1',revision:1,value:{},attachments:[reference]}],more:false});
      if(url.pathname==='/v1/blobs/status')return Response.json({...reference,ready:true,parts});
      const transfer=client.indicatorStatus().transfer;
      if(transfer&&transfer.total===size)seenProgress=true;
      return new Response(partBytes(Number(url.searchParams.get('part'))));
    }});
  t.after(()=>client.close());
  await client.run();
  assert.equal(client.status().error,null);
  assert.equal(applied,true);
  assert.equal(seenProgress,true,'byte-level attachment progress is reported during transfer');
  assert.equal(client.indicatorStatus().transfer,null,'transfer progress clears after cycle');
  assert.ok(statSync(join(home,'sync','sync.db')).size<1_000_000,'24 MiB download keeps sync.db under 1 MB');
});
