import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AgentRunRef} from '@molis-ai/molis-work-contracts/services/agent-host';
import {codingSdkRuntime} from './fixtures/coding-sdk-runtime.js';
import {cogniaModelResponse} from './fixtures/cognia-model-response.js';

type Fixture=Awaited<ReturnType<typeof codingSdkRuntime>>;
const data=<T>(result:Awaited<ReturnType<Fixture['call']>>):T=>{assert.equal(result?.status,200,JSON.stringify(result));return result!.body as T;};
const configuration={intent:'discuss',workspace_id:'work',provider_id:'fixture',model_id:'fixture'};
type Saved={draft:string;question_drafts:Record<string,unknown>;input_revision:number;configuration:unknown};

// S-65, PCS-S6: the normal Action/HTTP path refuses missing or old premises before changing other preferences.
test('Coding input edits require the original revision and preserve independent settings on refusal',async t=>{
 const fixture=await codingSdkRuntime(t);await fixture.create('A');
 const url='/sessions/A',questions={question:{answers:[{question:1,indexes:[2]}]}};
 assert.equal(data<Saved>(await fixture.call(url)).input_revision,0);
 for(const expected of [undefined,1]){
  const refused=await fixture.call(url,{draft:'unaccepted',configuration,...(expected===undefined?{}:{expected_input_revision:expected})},'PATCH');
  assert.equal(refused?.status,409);assert.equal((refused!.body as {code:string}).code,'coding.inputs_changed');
 }
 for(const expected of [-1,0.5])assert.equal((await fixture.call(url,{draft:'invalid premise',expected_input_revision:expected},'PATCH'))?.status,400);
 const untouched=data<Saved>(await fixture.call(url));assert.equal(untouched.draft,'');assert.equal(untouched.configuration,null);
 const saved=data<{input_revision:number}>(await fixture.call(url,{draft:'original',question_drafts:questions,configuration,expected_input_revision:0},'PATCH'));
 assert.equal(saved.input_revision,1);
 const invalid=await fixture.call(url,{draft:'must not write',question_drafts:[],expected_input_revision:1},'PATCH');assert.equal(invalid?.status,400);
 for(const bad of [{mcp_sources:[{}]},{mcp_tools:[{}]},{methods:[{}]},{budget:{tokens:1}},{title:''}]){
  const refused=await fixture.call(url,{draft:'invalid mixed request',expected_input_revision:1,configuration:{...configuration,intent:'execute'},...bad},'PATCH');
  assert.equal(refused?.status,400,JSON.stringify(refused));
  const after=data<Saved>(await fixture.call(url));assert.equal(after.draft,'original');assert.equal(after.input_revision,1);assert.deepEqual(after.configuration,configuration);
 }
 const stale=await fixture.call(url,{draft:'old editor',question_drafts:{},configuration:{...configuration,intent:'execute'},expected_input_revision:0},'PATCH');assert.equal(stale?.status,409);
 const retained=data<Saved>(await fixture.call(url));assert.equal(retained.draft,'original');assert.deepEqual(retained.question_drafts,questions);assert.deepEqual(retained.configuration,configuration);
 assert.equal(data<{input_revision:number}>(await fixture.call(url,{draft:'original',question_drafts:questions,expected_input_revision:1},'PATCH')).input_revision,1);
 assert.equal(data<{input_revision:number}>(await fixture.call(url,{title:'rename only'},'PATCH')).input_revision,1);
 assert.equal(data<{input_revision:number}>(await fixture.call(url,{draft:'',expected_input_revision:1},'PATCH')).input_revision,2);
 const empty=data<Saved>(await fixture.call(url));assert.equal(empty.draft,'');assert.deepEqual(empty.question_drafts,questions);
});

// S-65, PCS-S6: use a real Runtime/SDK and local HTTP model. Only the accepted handle receipt is held back.
for(const concurrentEdit of [false,true])test(`an accepted Coding Run clears only its original saved input (later typing: ${concurrentEdit})`,{timeout:30000},async t=>{
 let requests=0;const modelRequest=Promise.withResolvers<void>();
 const server=createServer((_request,response)=>{
  requests++;modelRequest.resolve();void cogniaModelResponse('Actual SDK round completed.').text().then(text=>{response.writeHead(200,{'content-type':'text/event-stream'});response.end(text);},error=>response.destroy(error));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address==='object');
 t.after(()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();}));
 const fixture=await codingSdkRuntime(t,{modelEndpoint:`http://127.0.0.1:${address.port}/v1/messages`});await fixture.create('A');
 const url='/sessions/A',questions={original:{answers:[{question:1,value:'保留待答输入'}]}};
 data(await fixture.call(url,{draft:'sent task',question_drafts:questions,expected_input_revision:0},'PATCH'));
 const accepted=Promise.withResolvers<AgentRunRef>(),release=Promise.withResolvers<void>();t.after(()=>release.resolve());
 const start=fixture.adapter.start.bind(fixture.adapter);
 t.mock.method(fixture.adapter,'start',async(...args)=>{const handle=await start(...args);accepted.resolve(handle.ref);await release.promise;return handle;});
 const pending=fixture.call(url+'/runs',{...configuration,task:'sent task'});
 const ref=await Promise.race([accepted.promise,pending.then(result=>{throw new Error('SDK start returned without reaching the acceptance barrier: '+JSON.stringify(result));})]);
 // The SDK owns a real accepted Run before the user makes a second normal save.
 assert.equal((await fixture.adapter.read(ref)).ref.run_id,ref.run_id);
 if(concurrentEdit)data(await fixture.call(url,{draft:'new unsent input',expected_input_revision:1},'PATCH'));
 release.resolve();
 const result=data<{cleared_input_revision?:number}>(await pending),read=data<Saved>(await fixture.call(url));
 assert.equal(read.draft,concurrentEdit?'new unsent input':'');assert.equal(read.input_revision,2);assert.deepEqual(read.question_drafts,questions);
 assert.equal(result.cleared_input_revision,concurrentEdit?undefined:2);
 await modelRequest.promise;
 assert.ok(requests>0,'the real SDK used the isolated local HTTP model');
});
