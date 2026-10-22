import { syncRoundResponse } from './fixtures/sync-round.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalSync,resolveSyncEndpoint} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';

test('PCSYNC-26 all 26 idle collections use one authenticated summary request, never 26 empty pulls',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-idle-summary-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selections=Array.from({length:26},(_,n)=>({plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'records'+n,schema_version:1}));
  const policy={spaceId:space.spaceId,revision:1,selections},paths:string[]=[];let tokenReads=0;
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>{tokenReads++;return 'synthetic-only';}},registrations:selections.map(selection=>({selection,title:selection.collection_id,async refresh(){},async prepare(){throw new Error('no changed owner');},withReplica:run=>run({cursor:()=>0,next:()=>null,acknowledge(){throw new Error('no upload');},receive(){throw new Error('no event');},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}})})),fetch:async(input,init)=>{
    const path=new URL(String(input)).pathname;paths.push(path);assert.equal(path,'/v1/round');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');return syncRoundResponse(policy,0);
  }});t.after(()=>client.close());
  for(let round=1;round<=2;round++){await client.run();assert.equal(client.status().error,null);assert.equal(paths.length,round);assert.equal(tokenReads,round,'each summary still authenticates');}
  assert.equal(client.status().collections.length,26);assert.deepEqual(paths,['/v1/round','/v1/round']);
  assert.deepEqual(client.status().progress,{selected:26,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:true});
});

test('PCSYNC-27 aggregate progress counts each unavailable selected identity rather than one diagnostic message',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-missing-progress-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selections=Array.from({length:3},(_,n)=>({plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'missing'+n,schema_version:1}));
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',registrations:[],authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic'},fetch:async()=>syncRoundResponse({spaceId:space.spaceId,revision:1,selections},0)});t.after(()=>client.close());
  await client.run();assert.deepEqual(client.status().progress,{selected:3,pending:0,conflicts:0,waiting:0,failures:0,unavailable:3,complete:false});assert.equal(client.status().lastSuccess,null);
});

test('S-73 PCSYNC-01/26 malformed round hints never become an empty success or authorize a policy cache write',async t=>{
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  const selection={plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};
  const wire=await syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},1).json();
  const bad=[{}, {...wire,format:2}, {...wire,heads:[]}, {...wire,heads:[...wire.heads,...wire.heads]},
    {...wire,heads:[{namespace:'another-account',revision:1}]}, {...wire,heads:[{...wire.heads[0],revision:-1}]},
    {...wire,heads:[{...wire.heads[0],revision:2**53}]}, {...wire,heads:[{...wire.heads[0],extra:true}]},
    {...wire,policy:{...wire.policy,spaceId:'another-account'}}, {...wire,quota:{limitBytes:1,usedBytes:0}}];
  for(const summary of bad){
    const home=mkdtempSync(join(tmpdir(),'sync-invalid-summary-'));ensureStorageSpace(home,space);let prepares=0,requests=0;
    const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic'},registrations:[{selection,title:'Notes',async refresh(){},async prepare(){prepares++;},withReplica:run=>run({cursor:()=>0,next:()=>null,acknowledge(){throw new Error('no upload');},receive(){throw new Error('no owner write');},counts:()=>({pending:0,conflicts:0}),conflicts:()=>[],resolve(){}})}],fetch:async()=>{requests++;return Response.json(summary);}});
    try{await client.run();assert.notEqual(client.status().error,null);assert.equal(client.policy().revision,0);assert.equal(prepares,0);assert.equal(requests,1);}finally{client.close();rmSync(home,{recursive:true,force:true});}
  }
});

test('PCSYNC-26 a server rewind is refused rather than skipping history and uploading against a reset database',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-server-rewind-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selection={plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};let ownerReads=0,received=0,requests=0;
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic'},registrations:[{selection,title:'Notes',async refresh(){},async prepare(){received++;},withReplica:run=>run({cursor:()=>2,next:()=>{ownerReads++;return {operationId:'unsent',key:'note',base:2,value:'unique local edit'};},acknowledge(){throw new Error('must not settle queue');},receive(){received++;},counts:()=>({pending:1,conflicts:0}),conflicts:()=>[],resolve(){}})}],fetch:async()=>{requests++;return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},1);}});
  t.after(()=>client.close());await client.run();assert.match(client.status().error??'',/版本已回退/);assert.equal(client.status().lastSuccess,null);
  assert.equal(client.status().collections[0].pending,1);assert.equal(ownerReads,0);assert.equal(received,0);assert.equal(requests,1);
});

for(const direction of ['upload','download'] as const)test('PCSYNC-13/27 bounded '+direction+' work does not claim completion and resumes without a manual-mode timer',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-bounded-round-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selection={plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};
  const policy={spaceId:space.spaceId,revision:1,selections:[selection]};
  let cursor=0,uploaded=0,received=0,requests=0;
  const events=Array.from({length:1000},(_,n)=>({key:'record'+n,operationId:'remote'+n,base:0,value:'preserve '+n,revision:n+1}));
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic'},registrations:[{selection,title:'Notes',async refresh(){},async prepare(){},withReplica:run=>run({cursor:()=>cursor,next:()=>direction==='upload'&&uploaded<41?{key:'local'+uploaded,operationId:'operation'+uploaded,base:0,value:'original '+uploaded}:null,acknowledge(key,operation,revision){assert.equal(key,'local'+uploaded);assert.equal(operation,'operation'+uploaded);assert.equal(revision,uploaded+1);uploaded++;},receive(event){assert.ok(event.revision>cursor);cursor=event.revision;received++;},counts:()=>({pending:direction==='upload'?41-uploaded:0,conflicts:0}),conflicts:()=>[],resolve(){}})}],fetch:async(input,init)=>{
    requests++;const url=new URL(String(input));
    if(url.pathname==='/v1/round')return syncRoundResponse(policy,direction==='upload'?uploaded:1000);
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:uploaded});
    if(init?.method==='POST')return Response.json({accepted:true,revision:uploaded+1});
    const after=Number(url.searchParams.get('after')),end=direction==='upload'?uploaded:1000;
    return Response.json({events:events.slice(after,Math.min(after+20,end)),more:end>after+20});
  }});t.after(()=>client.close());
  await client.run();assert.match(client.status().error??'',/本轮仍有内容待同步/);assert.equal(client.status().lastSuccess,null);assert.equal(client.status().progress.complete,false);
  assert.equal(client.status().device.automatic,null);assert.equal(cursor,direction==='upload'?39:800);
  assert.equal(uploaded,direction==='upload'?40:0);assert.equal(received,direction==='upload'?39:800);
  const before=requests;await client.run();assert.equal(client.status().error,null);assert.ok(client.status().lastSuccess);assert.equal(client.status().progress.complete,true);
  assert.equal(client.status().collections[0].pending,0);assert.equal(cursor,direction==='upload'?41:1000);
  assert.ok(requests>before);assert.equal(client.status().device.automatic,null);
});

for(const code of ['SYNC_READ_ONLY','SYNC_INVALID_WRITE_MODE'])test('PCSYNC-26/27 '+code+' is not quarantined as a corrupt original or acknowledged upload',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-maintenance-client-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selection={plugin_id:'io.example.records',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};let uploads=0;
  const client=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic'},registrations:[{selection,title:'Notes',async refresh(){},async prepare(){throw new Error('no incoming writes');},withReplica:run=>run({cursor:()=>0,next:()=>({key:'unique',operationId:'frozen',base:0,value:'sole local original'}),acknowledge(){throw new Error('maintenance cannot acknowledge an upload');},receive(){throw new Error('no incoming writes');},counts:()=>({pending:1,conflicts:0}),conflicts:()=>[],resolve(){}})}],fetch:async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},0);
    if(path==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
    assert.equal(path,'/v1/changes');assert.equal(init?.method,'POST');uploads++;return Response.json({error:code},{status:503,headers:{'Retry-After':'60'}});
  }});t.after(()=>client.close());await client.run();
  const status=client.status();assert.match(status.error??'',/维护|服务配置无效/);assert.match(status.error??'',/本机原件和待同步内容已保留/);
  assert.equal(uploads,1);assert.equal(status.lastSuccess,null);assert.equal(status.progress.complete,false);assert.equal(status.progress.pending,1);assert.deepEqual(status.collections[0].failures,[]);assert.equal(status.device.automatic,null);
});

test('S-73 PCSYNC-01 trusted cloud origin is explicit, HTTPS and canonical; local opt-in cannot leak into cloud config',()=>{
  assert.equal(resolveSyncEndpoint({local:false}),null);
  assert.equal(resolveSyncEndpoint({local:true}),'http://127.0.0.1:8788');
  assert.equal(resolveSyncEndpoint({local:false,origin:'https://sync.example.test'}),'https://sync.example.test');
  for(const origin of ['http://sync.example.test','https://user:password@sync.example.test','https://sync.example.test/path','https://sync.example.test?x=1','https://sync.example.test/#x','https://127.0.0.1','https://localhost','http://127.0.0.1:8788','https://sync.example.test/']){
    assert.throws(()=>resolveSyncEndpoint({local:false,origin}));
  }
  assert.throws(()=>resolveSyncEndpoint({local:true,origin:'https://sync.example.test'}));
});

test('S-73 PCSYNC-01 coordinator sends only to its configured origin and forbids redirect following',async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-cloud-endpoint-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const destinations:string[]=[];
  const service=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',registrations:[],authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'},fetch:async(input,init)=>{
    destinations.push(String(input));assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-only');
    throw new TypeError('redirect refused');
  }});t.after(()=>service.close());
  await service.run();assert.match(service.status().error??'',/redirect refused/);
  assert.deepEqual(destinations,['https://sync.example.test/v1/round']);
});

for(const usedBytes of [0,100000000])test('PCSYNC-10 coordinator pauses positive uploads without dropping queue after quota admission '+usedBytes,async t=>{
  const home=mkdtempSync(join(tmpdir(),'sync-cloud-quota-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const selection={plugin_id:'io.example.quota',publisher_id:'example',publisher_signature:'synthetic-only',collection_id:'records',schema_version:1};
  const mutation={operationId:'synthetic-operation',key:'record',base:0,value:{text:'keep me'}};let uploads=0;
  const service=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example.test',authority:{signal:new AbortController().signal,assertCurrent(){},accessToken:async()=>'synthetic-only'},registrations:[{selection,title:'Content',refresh:async()=>{},prepare:async()=>{},withReplica:run=>run({next:options=>options?.deletionsOnly?null:mutation,cursor:()=>0,receive(){throw new Error('no incoming events expected');},acknowledge(){throw new Error('quota-rejected upload has no receipt');},counts:()=>({pending:1,conflicts:0}),conflicts:()=>[],resolve(){throw new Error('no conflict');}})}],fetch:async(input,init)=>{
    const route=new URL(String(input)).pathname;
    if(route==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[selection]},0,usedBytes);
    if(route==='/v1/policy')return Response.json({spaceId:space.spaceId,revision:1,selections:[selection]});
    if(route==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes});
    if(init?.method==='POST'){uploads++;return Response.json({error:'SYNC_QUOTA_EXCEEDED'},{status:413});}
    return Response.json({events:[],more:false});
  }});t.after(()=>service.close());
  await service.run();assert.match(service.status().error??'',/100 MB/);assert.equal(service.status().collections[0].pending,1);
  assert.equal(uploads,usedBytes===0?1:0,'full accounts avoid positive body transfer; stale preflight is rejected atomically by the server');
});
