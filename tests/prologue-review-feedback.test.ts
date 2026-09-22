import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentReviewQueue, createPrologueNodeAdapter } from '@molis-ai/molis-work-service-agent-host';

const until = async <T>(read: () => T | Promise<T>): Promise<NonNullable<T>> => {
  for (let i=0;i<200;i++) { const result=await read(); if(result)return result as NonNullable<T>; await new Promise(r=>setTimeout(r,25)); }
  throw new Error('Expected review/run state not reached');
};

test('packed SDK: rejected review feedback reaches the next model request before a revised proposal and survives restart', {timeout:30_000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-review-feedback-')), project=join(root,'project');await mkdir(project);await writeFile(join(project,'a.ts'),'original\n');
  const requests:any[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body=typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array);requests.push(JSON.parse(body));
    const round=requests.length, events:string[]=[];
    const emit=(type:string,value:unknown)=>events.push(`event: ${type}\ndata: ${JSON.stringify({type,...value as object})}\n\n`);
    emit('message_start',{message:{id:'message-'+round,type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,usage:{input_tokens:20,output_tokens:0}}});
    if(round<=3){
      emit('content_block_start',{index:0,content_block:{type:'tool_use',id:'write-'+round,name:round===1?'read':'write',input:{}}});
      emit('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(round===1?{path:'a.ts'}:{path:'a.ts',text:round===2?'wrong\n':'revised\n'})}});
    }else{
      emit('content_block_start',{index:0,content_block:{type:'text',text:''}});
      emit('content_block_delta',{index:0,delta:{type:'text_delta',text:'The revised proposal was applied after approval.'}});
    }
    emit('content_block_stop',{index:0});emit('message_delta',{delta:{stop_reason:round<=3?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit('message_stop',{});
    return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
  });
  let queue=new AgentReviewQueue();
  const make=()=>createPrologueNodeAdapter({app:{appId:'molis.review-feedback.test',appVersion:'1.0.0'},storageRoot:join(root,'sdk'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'test'}),resolveCredential:()=> 'test-only'});
  let adapter=await make();
  try{
    const owner={board_id:'board',plugin_id:'io.molis.work.coding',install_id:'installed',actor_id:'user'},directory={canonical_path:project,realpath_verified:true};
    const session=await adapter.createSession({...owner,directory,title:'review feedback'});
    const handle=await adapter.start({...owner,directory,session,task:'Change a.ts after host review.',role_id:'writer',role:{role_id:'writer',version:1,execution:'text-edit',prompts:[],host_tools:['read-file','write']}});
    const first=await until(async()=>{const review=queue.list('board','pending')[0];const view=await adapter.read(handle.ref);if(!review && ['failed','completed'].includes(view.phase))throw new Error(JSON.stringify({view,requests}));return review;});assert.equal(await readFile(join(project,'a.ts'),'utf8'),'original\n');
    const note='第 1 行不要写 wrong，改为 revised。保留新提案供我批准。反馈标记 REVIEW-FEEDBACK-1。';
    const rejected=await queue.respond({review_id:first.review_id,decision:'reject',actor_id:'user',note});assert.equal(rejected.delivery_error,undefined);assert.equal(rejected.note,note);assert.equal(rejected.status,'rejected');
    const second=await until(()=>queue.list('board','pending').find(row=>row.review_id!==first.review_id));
    assert.equal(await readFile(join(project,'a.ts'),'utf8'),'original\n');assert.equal(second.run?.run_id,first.run?.run_id);
    assert.ok(JSON.stringify(requests[2].messages).includes(note),'real next provider request must contain the complete rejection feedback');
    assert.ok(JSON.stringify(requests[2].messages).includes(first.review_id),'feedback remains tied to its exact original review');
    assert.ok(JSON.stringify(requests[2].messages).includes('新的操作仍须经过原宿主审查'));
    assert.equal(second.document.kind,'text-edit');assert.equal((second.document as any).after_text,'revised\n');
    await assert.rejects(queue.respond({review_id:first.review_id,decision:'approve',actor_id:'user'}));
    await queue.respond({review_id:second.review_id,decision:'approve',actor_id:'user'});
    const completed=await until(async()=>{const view=await adapter.read(handle.ref);return view.phase==='completed'?view:null;});
    assert.equal(await readFile(join(project,'a.ts'),'utf8'),'revised\n');assert.equal(requests.length,4);
    const steer=completed.turns.find(turn=>turn.kind==='user' && turn.steer?.state==='applied' && turn.text.includes(note));assert.ok(steer,'SDK keeps the original durable feedback event: '+JSON.stringify(completed.turns));
    await queue.refresh('board');const before=[queue.receipt(first.review_id),queue.receipt(second.review_id)];
    await adapter.close();queue=new AgentReviewQueue();adapter=await make();const restored=await adapter.readSession(session);await queue.refresh('board');
    assert.deepEqual([queue.receipt(first.review_id),queue.receipt(second.review_id)],before);assert.deepEqual(restored.latest_run?.turns,completed.turns);assert.equal(requests.length,4,'restoration cannot send feedback or execute again');
    assert.equal(await readFile(join(project,'a.ts'),'utf8'),'revised\n');
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});
