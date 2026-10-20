import { syncRoundResponse } from './fixtures/sync-round.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalSync,syncNamespace,type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';

async function fixture(t:TestContext){
 const home=mkdtempSync(join(tmpdir(),'cloud-history-client-')),space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const selection={plugin_id:'io.example.history',publisher_id:'example',publisher_signature:'history-binding',collection_id:'content',schema_version:1},namespace=syncNamespace(selection);
 let available=true,prepared=0,applied=0,corrupt=false;const calls:string[]=[];
 const content=createSyncJsonContent({spaceId:space.spaceId,authorize(){if(!available)throw new Error('OWNER_STOPPED');}}),original={text:'complete history'.repeat(7000)},encoded=content.encode('asset',original);
 const version={event:{operationId:'archive',key:'asset',base:1,revision:2,value:encoded.value,attachments:encoded.blobs.map(({digest,size})=>({digest,size}))},createdAt:1000,currentRevision:1,retained:true};
 let versionHook:()=>Promise<void>=async()=>{},versionValue:unknown=version,rawResponse:string|undefined,keysValue:unknown={items:[{key:'asset',currentRevision:1,versions:1,retainedAt:1000}],more:false,next:null},versionsValue:unknown={items:[{revision:2,createdAt:1000,action:'archive',retained:true,current:false}],more:false,next:null,currentRevision:1};
 const registration:SyncRegistration={selection,title:'Content',available:()=>available,content,refresh:async()=>{},prepare:async()=>{prepared++;},withReplica:run=>run({next:()=>null,acknowledge(){applied++;},receive(){applied++;},cursor:()=>0,counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){applied++;}})};
 const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'},registrations:[registration],fetch:async(input,init)=>{
  const url=new URL(String(input));calls.push(url.pathname);assert.equal(url.origin,'https://sync.example.test');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');assert.equal(init?.redirect,'error');
  if(url.pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},0);
  if(url.pathname==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:[selection]});
  if(url.pathname==='/v1/history/keys')return Response.json(keysValue);
  if(url.pathname==='/v1/history')return Response.json(versionsValue);
  if(url.pathname==='/v1/history/version'){await versionHook();return rawResponse===undefined?Response.json(versionValue):new Response(rawResponse);}
  if(url.pathname==='/v1/blobs/status'){const source=encoded.blobs.find(blob=>blob.digest===url.searchParams.get('digest'))!;assert.ok(source);return Response.json({...source,bytes:undefined,ready:true,parts:[{part:0,checksum:createHash('sha256').update(source.bytes).digest('hex')}]});}
  if(url.pathname==='/v1/blobs/chunk'){const source=encoded.blobs.find(blob=>blob.digest===url.searchParams.get('digest'))!;assert.ok(source);const bytes=Buffer.from(source.bytes);if(corrupt)bytes[0]^=255;return new Response(bytes);}
  throw new Error('UNEXPECTED_HISTORY_ROUTE');
 }});
 t.after(()=>{client.close();rmSync(home,{recursive:true,force:true});});await client.save({spaceId:space.spaceId,revision:0,selections:[selection]});calls.length=0;
 return {client,namespace,original,version,calls,encoded,space,counts:()=>({prepared,applied}),stop:()=>available=false,onVersion:(hook:typeof versionHook)=>versionHook=hook,setVersion:(value:unknown)=>versionValue=value,setKeys:(value:unknown)=>keysValue=value,setVersions:(value:unknown)=>versionsValue=value,setRaw:(value:string)=>rawResponse=value,corrupt:()=>corrupt=true};
}

test('S-32 PCSYNC-11/16 cloud inspection decodes full declared bytes without owner preparation, head writes or execution',async t=>{
 const f=await fixture(t);assert.equal((await f.client.history.keys(f.namespace)).items[0]!.key,'asset');
 assert.equal((await f.client.history.versions(f.namespace,'asset')).items[0]!.revision,2);
 const view=await f.client.history.inspect(f.namespace,'asset',2);assert.deepEqual(view.value,f.original);assert.equal(view.currentRevision,1);
 assert.deepEqual(f.counts(),{prepared:0,applied:0});assert.ok(f.calls.includes('/v1/blobs/chunk'));assert.ok(!f.calls.includes('/v1/changes'));
});

test('S-32 PCSYNC-16 stale or repeated pagination cursors are refused instead of creating an unbounded history loop',async t=>{
 const f=await fixture(t);
 f.setKeys({items:[{key:'asset',currentRevision:1,versions:1,retainedAt:1000}],more:true,next:'wrong'});await assert.rejects(()=>f.client.history.keys(f.namespace));
 f.setKeys({items:[{key:'asset',currentRevision:1,versions:1,retainedAt:1000}],more:false,next:null});await assert.rejects(()=>f.client.history.keys(f.namespace,'asset'));
 f.setVersions({items:[{revision:2,createdAt:1000,action:'archive',retained:true,current:false}],more:true,next:3,currentRevision:1});await assert.rejects(()=>f.client.history.versions(f.namespace,'asset'));
 assert.deepEqual(f.counts(),{prepared:0,applied:0});
});

for(const mode of ['wrong-key','wrong-revision','undeclared','corrupt'] as const)test('S-32 PCSYNC-11/16 malformed history is refused without owner writes: '+mode,async t=>{
 const f=await fixture(t),wire=structuredClone(f.version);
 if(mode==='wrong-key')wire.event.key='foreign';else if(mode==='wrong-revision')wire.event.revision=3;else if(mode==='undeclared')wire.event.attachments=[];else f.corrupt();f.setVersion(wire);
 await assert.rejects(()=>f.client.history.inspect(f.namespace,'asset',2));assert.deepEqual(f.counts(),{prepared:0,applied:0});
 if(mode!=='corrupt')assert.ok(!f.calls.includes('/v1/blobs/chunk'));
});

for(const mode of ['stop-owner','stop-device'] as const)test('S-32 PCSYNC-06/16 delayed history response cannot cross a stopped scope: '+mode,async t=>{
 const f=await fixture(t);f.onVersion(async()=>{if(mode==='stop-owner')f.stop();else await f.client.setDevice(false);});
 await assert.rejects(()=>f.client.history.inspect(f.namespace,'asset',2));assert.deepEqual(f.counts(),{prepared:0,applied:0});assert.ok(!f.calls.includes('/v1/blobs/chunk'));
 if(mode==='stop-device'){f.onVersion(async()=>{});assert.deepEqual((await f.client.history.inspect(f.namespace,'asset',2)).value,f.original,'a later explicit manual inspection uses a new operation scope');}
});

test('S-32 PCSYNC-01/16 unselected namespaces, current-version restore and unconfirmed purge never send a request',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>f.client.history.keys('foreign'));await assert.rejects(()=>f.client.history.restore(f.namespace,'asset',1,1,'operation'));
 await assert.rejects(()=>f.client.history.purge(f.namespace,'asset',2,1,false));assert.deepEqual(f.calls,[]);
 f.setKeys({items:Array.from({length:21},()=>({key:'asset',currentRevision:1,versions:1,retainedAt:1})),more:true,next:'asset'});
 await assert.rejects(()=>f.client.history.keys(f.namespace));assert.deepEqual(f.counts(),{prepared:0,applied:0});
});

for(const mode of ['response','decoded-content'] as const)test('S-39 S-32 PCSYNC-16/26 malformed history JSON never includes private content in its diagnostic: '+mode,async t=>{
 const f=await fixture(t),privateText='private-history-body-never-diagnostic',broken=Buffer.from('{"text":"'+privateText+'" malformed');
 if(mode==='response')f.setRaw(broken.toString());else{
  const ref={digest:createHash('sha256').update(broken).digest('hex'),size:broken.length};f.encoded.blobs.splice(0,f.encoded.blobs.length,{...ref,bytes:broken});
  f.version.event.attachments=[ref];f.version.event.value={sync_content:1,spaceId:f.space.spaceId,key:'asset',...ref,parts:[ref]};f.setVersion(f.version);
 }
 await assert.rejects(()=>f.client.history.inspect(f.namespace,'asset',2),error=>{assert.ok(error instanceof Error);assert.match(error.message,/格式无效/);assert.ok(!error.message.includes(privateText));return true;});assert.deepEqual(f.counts(),{prepared:0,applied:0});
});
