import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

const response = (text: string, tool?: {name:string; input:unknown}) => {
  const events: string[] = [], emit=(type:string,value:any)=>events.push(`event: ${type}\ndata: ${JSON.stringify({type,...value})}\n\n`);
  emit('message_start',{message:{id:'fixture',type:'message',role:'assistant',model:'fixture',content:[],usage:{input_tokens:30,output_tokens:0}}});
  if(tool) emit('content_block_start',{index:0,content_block:{type:'tool_use',id:'call-'+Math.random(),name:tool.name,input:tool.input}});
  else {emit('content_block_start',{index:0,content_block:{type:'text',text:''}});emit('content_block_delta',{index:0,delta:{type:'text_delta',text}});}
  emit('content_block_stop',{index:0});emit('message_delta',{delta:{stop_reason:tool?'tool_use':'end_turn'},usage:{output_tokens:8}});emit('message_stop',{});
  return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
};

test('packed SDK child dispatch uses Host review, frozen roles, actual reads and durable results without replay', {timeout:40_000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-subagents-'));await writeFile(join(root,'sample.txt'),'ACTUAL CHILD FILE');
  let calls=0, parentCalls=0, childCalls=0;const requests:any[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    calls++;const body=JSON.parse(typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array));requests.push(body);
    const messages=JSON.stringify(body.messages);
    if(body.messages.some((message:any)=>message.role==='user' && (typeof message.content==='string'?message.content.startsWith('READ_CHILD_SAMPLE'):Array.isArray(message.content)&&message.content.some((block:any)=>block.type==='text'&&block.text.startsWith('READ_CHILD_SAMPLE'))))){
      childCalls++;
      if(childCalls===1)return response('',{name:'read',input:{path:'sample.txt'}});
      assert.ok(messages.includes('ACTUAL CHILD FILE'));
      return response('Child evidence: ACTUAL CHILD FILE\n'+'detail '.repeat(400)+'REPORT_END');
    }
    parentCalls++;
    if(parentCalls===1){
      const catalog=JSON.stringify(body.system);assert.doesNotMatch(catalog,/molis-child-[a-z0-9-]+@2@/);const character=catalog.match(/molis-child-[a-z0-9-]+@2/)?.[0];assert.ok(character,catalog);
      return response('',{name:'dispatch-subagent',input:{instruction:'READ_CHILD_SAMPLE: read sample.txt and report exact contents; no writes.',tools:['read','search'] /* a parent may leave out optional tools; the child must still start */,character,idempotencyKey:'read-child',maxTurns:3}});
    }
    assert.ok(messages.includes('ACTUAL CHILD FILE'),messages);
    if(parentCalls===2 || parentCalls===3){
      const child=messages.match(/sub-[a-z0-9-]+/)?.[0];assert.ok(child);
      return response('',{name:'await-subagents',input:{refs:[child],mode:'all',timeoutMs:0,reportOffset:parentCalls===2?0:2000}});
    }
    assert.ok(messages.includes('REPORT_END'),'parent must read the terminal result beyond the bounded summary');
    return response('Parent received child report; acceptance pending.');
  });
  let queue=new AgentReviewQueue();
  const make=()=>createPrologueNodeAdapter({app:{appId:'io.molis.work.subagent-test',appVersion:'1.0.0'},storageRoot:join(root,'runtime'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'test-only'});
  let adapter=await make();
  try{
    const host=new AgentHost({reviews:queue});host.register(adapter);
    const owner={board_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
    const session=await adapter.createSession({...owner,directory,title:'Parent'});
    const handle=await host.start('prologue',{...owner,session,directory,role_id:'coordinator',task:'Delegate one read-only inspection.'},
      {manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root]});
    let approved=0;const decided=new Set<string>();
    const deadline=Date.now()+20_000;let view:AgentRunView;
    for(;;){
      view=await adapter.read(handle.ref);
      if(['completed','failed','cancelled'].includes(view.phase))break;
      if(Date.now()>deadline)throw new Error('Timed out: '+JSON.stringify({view,requests,reviews:queue.list('b')}));
      for(const review of queue.list('b','pending'))if(!decided.has(review.review_id)){
        assert.equal(review.kind,'tool-operation');assert.equal(childCalls,0,'child provider must not run before dispatch approval');
        decided.add(review.review_id);approved++;const receipt=await queue.respond({review_id:review.review_id,decision:'approve',actor_id:'user'});assert.equal(receipt.delivery_error,undefined);
      }
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(view.phase,'completed',view.stop_reason);assert.equal(approved,1,JSON.stringify({view,requests,childCalls}));assert.equal(childCalls,2);
    const before=await adapter.subagents!.list(handle.ref);assert.equal(before.length,1);assert.equal(before[0].state,'completed');assert.match(before[0].result!,/ACTUAL CHILD FILE/);
    assert.match(before[0].task,/READ_CHILD_SAMPLE/);assert.ok(before[0].activity?.some(item=>item.name==='read'&&item.state==='completed'));
    assert.match(before[0].result!,/REPORT_END$/);assert.equal(parentCalls,4);assert.equal(before[0].usage?.tokens.input,60);
    assert.ok(before[0].host_tools?.includes('read-file'));assert.equal(before[0].host_tools?.includes('write'),false);
    const foreign=await adapter.createSession({...owner,directory,title:'Other'});
    await assert.rejects(adapter.subagents!.list({...handle.ref,session_id:foreign.session_id}),/不属于/);
    await assert.rejects(adapter.subagents!.cancel(handle.ref,'foreign','user'),/不属于/);
    const forbidden=structuredClone(codingAgentManifest);forbidden.subagents!.roles[0]!.host_tools!.push('write');
    await assert.rejects(host.start('prologue',{...owner,session,directory,role_id:'coordinator',task:'must not start'},
      {manifest:forbidden,prompts:codingPrompts,authorizedDirectories:[root]}),/只读子角色/);
    const callCount=calls;await adapter.close();queue=new AgentReviewQueue();adapter=await make();
    assert.deepEqual(await adapter.subagents!.list(handle.ref),before);assert.equal(calls,callCount,'restart never redispatches child');
    assert.equal((await adapter.readSession(session)).recovery,undefined);
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});

for (const outcome of ['rejected','cancelled','failed','unknown-role'] as const) test(`packed SDK child ${outcome}: no success substitution or uncontrolled provider continuation`,{timeout:30_000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-child-control-'));let parentCalls=0,childCalls=0;const childEntered=Promise.withResolvers<void>();
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body=JSON.parse(typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array));
    const child=body.messages.some((message:any)=>message.role==='user'&&(typeof message.content==='string'?message.content.startsWith('CONTROL_CHILD'):Array.isArray(message.content)&&message.content.some((block:any)=>block.type==='text'&&block.text.startsWith('CONTROL_CHILD'))));
    if(child){childCalls++;childEntered.resolve();if(outcome==='failed')throw new Error('deliberate child provider failure');
      return new Promise<Response>((_resolve,reject)=>{const abort=()=>reject(new DOMException('Stopped','AbortError'));if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});});}
    parentCalls++;
    if(parentCalls===1){let character=JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@2/)?.[0];assert.ok(character);
      if(outcome==='unknown-role')character=JSON.stringify(body.system).match(/molis-role-[a-z0-9-]+/)?.[0]+'@8';
      return response('',{name:'dispatch-subagent',input:{instruction:'CONTROL_CHILD inspect only',tools:['read','search','context-remaining'],character,idempotencyKey:'child-control',maxTurns:2}});}
    return response('Observed child outcome, no acceptance claim.');
  });
  const queue=new AgentReviewQueue();const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.child-control-'+outcome,appVersion:'1.0.0'},storageRoot:join(root,'runtime'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'fixture'});
  try{
    const host=new AgentHost({reviews:queue});host.register(adapter);const owner={board_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
    const session=await adapter.createSession({...owner,directory,title:'Parent'});
    const handle=await host.start('prologue',{...owner,session,directory,role_id:'coordinator',task:'Inspect through a child.'},{manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root]});
    const deadline=Date.now()+15_000,decided=new Set<string>();let cancelled=false;
    for(;;){
      const view=await adapter.read(handle.ref);if(['completed','failed','cancelled'].includes(view.phase))break;
      if(Date.now()>deadline)throw new Error('Control timed out '+JSON.stringify(view));
      for(const review of queue.list('b','pending'))if(!decided.has(review.review_id)){
        assert.equal(childCalls,0);decided.add(review.review_id);await queue.respond({review_id:review.review_id,decision:outcome==='rejected'?'reject':'approve',actor_id:'user'});
      }
      if(outcome==='cancelled'&&childCalls&&!cancelled){const rows=await adapter.subagents!.list(handle.ref);assert.equal(rows.length,1);await adapter.subagents!.cancel(handle.ref,rows[0].subagent_id,'user');cancelled=true;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    const children=await adapter.subagents!.list(handle.ref);
    if(outcome==='rejected'||outcome==='unknown-role'){assert.equal(childCalls,0);assert.ok(children.every(child=>child.state!=='completed'));}
    else {assert.equal(childCalls,1);assert.equal(children.length,1);assert.equal(children[0].state,outcome);assert.equal(children[0].result,null);}
    // A character that does not exist is refused before the dispatch is reviewed: nobody approves a call that can only fail.
    assert.equal(decided.size,outcome==='unknown-role'?0:1);
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});
