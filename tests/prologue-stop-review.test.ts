import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentReviewQueue, createPrologueNodeAdapter } from '@molis-ai/molis-work-service-agent-host';

const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i=0;i<200;i++) { const result=await read(); if(result)return result as NonNullable<T>; await new Promise(r=>setTimeout(r,25)); }
  throw new Error('Expected state not reached: '+what);
};

// Stopping a round ends it. Nothing more is put in front of the person to approve: an operation already waiting on
// review is withdrawn, and one the model asks for after the stop is never shown. Neither runs.
test('packed SDK: stop withdraws waiting reviews and never surfaces one asked for after the stop', {timeout:30_000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-stop-review-')), project=join(root,'project');await mkdir(project);await writeFile(join(project,'a.ts'),'original\n');
  let requests=0, hold: Promise<void> | null=null, command=false;
  // Each round reads a.ts, then asks to write it.
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    requests++;
    const body=JSON.parse(typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array));
    const last=body.messages.at(-1), write=Array.isArray(last?.content) && last.content.some((part:any)=>part.type==='tool_result');
    if(write && hold)await hold;
    const events:string[]=[], emit=(type:string,value:unknown)=>events.push(`event: ${type}\ndata: ${JSON.stringify({type,...value as object})}\n\n`);
    emit('message_start',{message:{id:'message-'+requests,type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,usage:{input_tokens:20,output_tokens:0}}});
    const [name,input]=command?['run-command',{executable:'touch',argv:['ran.txt']}]:write?['write',{path:'a.ts',text:'changed\n'}]:['read',{path:'a.ts'}];
    emit('content_block_start',{index:0,content_block:{type:'tool_use',id:'call-'+requests,name,input:{}}});
    emit('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}});
    emit('content_block_stop',{index:0});emit('message_delta',{delta:{stop_reason:'tool_use',stop_sequence:null},usage:{output_tokens:10}});emit('message_stop',{});
    return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
  });
  const queue=new AgentReviewQueue();
  const adapter=await createPrologueNodeAdapter({app:{appId:'molis.stop-review.test',appVersion:'1.0.0'},storageRoot:join(root,'sdk'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'test'}),resolveCredential:()=> 'test-only'});
  try{
    const owner={board_id:'board',plugin_id:'io.molis.work.coding',install_id:'installed',actor_id:'user'},directory={canonical_path:project,realpath_verified:true};
    const role={role_id:'writer',version:1,execution:'text-edit' as const,prompts:[],host_tools:['read-file','write']};
    const session=await adapter.createSession({...owner,directory,title:'stop'});

    // A write is waiting on review when the person stops the round.
    const first=await adapter.start({...owner,directory,session,task:'Change a.ts.',role_id:'writer',role});
    const waiting=await until(()=>queue.list('board','pending')[0],'a pending review');
    await adapter.control(first.ref,{kind:'stop'});
    const stopped=await until(async()=>{const view=await adapter.read(first.ref);return view.phase==='stopped'?view:null;},'the round to stop without a decision');
    assert.equal(stopped.awaiting_review?.length ?? 0,0);
    await queue.refresh('board');
    assert.equal(queue.receipt(waiting.review_id)?.status,'cancelled','the review is withdrawn, not left for a decision');
    await assert.rejects(queue.respond({review_id:waiting.review_id,decision:'approve',actor_id:'user'}));
    assert.equal(await readFile(join(project,'a.ts'),'utf8'),'original\n');
    assert.equal(requests,2,'no further model request after the stop');

    // The person stops while the model is still answering; the write it then asks for is never shown.
    let release!: () => void; hold=new Promise<void>(resolve=>{release=resolve;});
    const second=await adapter.start({...owner,directory,session,task:'Change a.ts again.',role_id:'writer',role});
    await until(()=>requests===4,'the second round asking to write');
    await adapter.control(second.ref,{kind:'stop'});
    release();
    const ended=await until(async()=>{const view=await adapter.read(second.ref);return view.phase==='stopped'?view:null;},'the second round to stop');
    assert.equal(ended.awaiting_review?.length ?? 0,0);
    await queue.refresh('board');
    assert.equal(queue.list('board','pending').length,0,'nothing waits for the person after they stopped');
    assert.equal(await readFile(join(project,'a.ts'),'utf8'),'original\n');

    // The same for a command waiting on review.
    hold=null;command=true;
    const third=await adapter.start({...owner,directory,session,task:'Touch a file.',role_id:'builder',role:{role_id:'builder',version:1,execution:'workspace-write',prompts:[],host_tools:['read-file','run-command']}});
    const asked=await until(()=>queue.list('board','pending').find(row=>row.run?.run_id===third.ref.run_id),'a pending command review');
    assert.equal(asked.document.kind,'command');
    await adapter.control(third.ref,{kind:'stop'});
    await until(async()=>(await adapter.read(third.ref)).phase==='stopped','the command round to stop without a decision');
    await queue.refresh('board');
    assert.equal(queue.receipt(asked.review_id)?.status,'cancelled');
    await assert.rejects(readFile(join(project,'ran.txt'),'utf8'),'the command never ran');
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});
