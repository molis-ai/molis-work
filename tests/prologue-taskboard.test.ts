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

test('confirmed step graphs use scoped SDK reports, dependency/version guards and durable original state', {timeout:45_000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-step-board-'));await writeFile(join(root,'sample.txt'),'ORIGINAL PLAN EVIDENCE');
  let stage='success',turn=0,calls=0,firstBoard='',currentBoard='';
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    calls++;turn++;const body=JSON.parse(typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array));
    const system=JSON.stringify(body.system),messages=JSON.stringify(body.messages);
    const board=system.match(/任务图：([^。]+)。/)?.[1];
    if(stage==='ordinary'){assert.equal(board,undefined);assert.ok(!body.tools.some((tool:any)=>tool.name==='board-read'||tool.name==='board-report'));return response('Ordinary task has no graph.');}
    assert.ok(board,system);currentBoard=board;
    const version=Number([...messages.matchAll(/board (?:at|[^ ]+ at) version (\d+)/g)].at(-1)?.[1]||1);
    const report=(node:string,state:string,note:string,v=version)=>response('',{name:'board-report',input:{board,node,state,note,version:v}});
    if(stage==='success'){
      firstBoard=board;
      if(turn===1)return response('',{name:'board-read',input:{board}});
      if(turn===2)return report('step-1','running','开始核对第一步');
      if(turn===3)return response('',{name:'read',input:{path:'sample.txt'}});
      if(turn===4){assert.match(messages,/ORIGINAL PLAN EVIDENCE/);return report('step-1','succeeded','实际读取内容为 ORIGINAL PLAN EVIDENCE');}
      if(turn===5)return report('step-2','running','开始核对第二步');
      if(turn===6)return report('step-2','blocked','等待明确第二步的完成依据');
      if(turn===7)return report('step-2','ready','从原材料核对后阻塞已解除');
      if(turn===8)return report('step-2','running','重新核对第二步');
      if(turn===9)return report('step-2','succeeded','第二步已按原材料核对，无文件修改');
      return response('Both steps reported. User acceptance pending.');
    }
    if(stage==='guards'){
      if(turn===1)return response('',{name:'board-read',input:{board:firstBoard,node:'step-1'}});
      if(turn===2){assert.match(messages,/不能访问其他任务图/);assert.doesNotMatch(messages,/实际读取内容为/);return report('step-2','running','不能跳过前置步骤');}
      if(turn===3)return response('',{name:'board-read',input:{board}});
      if(turn===4)return report('step-1','running','核对第一步');
      if(turn===5)return report('step-1','succeeded','过期版本不能保存',1);
      if(turn===6)return response('',{name:'board-read',input:{board}});
      if(turn===7)return report('step-1','failed','证据不足，保留失败');
      return response('The run ended, but steps did not succeed.');
    }
    if(stage==='same-session'){
      if(turn===1)return response('',{name:'board-report',input:{board:firstBoard,node:'step-1',version:1,state:'running',note:'old run must not change'}});
      assert.match(messages,/不能访问其他任务图/);return response('Old run graph denied.');
    }
    if(stage==='interrupted'){
      if(turn===1)return response('',{name:'board-read',input:{board}});
      if(turn===2)return report('step-1','running','已开始核对，尚无完成证据');
      return new Promise<Response>((_resolve,reject)=>{const abort=()=>reject(new DOMException('Stopped','AbortError'));if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true});});
    }
    throw new Error(stage);
  });
  const make=()=>createPrologueNodeAdapter({app:{appId:'io.molis.work.step-board-test',appVersion:'1.0.0'},storageRoot:join(root,'runtime'),reviewQueue:new AgentReviewQueue(),
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'test-only'});
  let adapter=await make();
  const owner={board_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
  const plan={source:{artifact_id:'fixed-plan',version:1},title:'Original plan',steps:[{id:'step-1',title:'读取 sample.txt',acceptance:'内容为 ORIGINAL PLAN EVIDENCE'},{id:'step-2',title:'核对材料',acceptance:'记录结果，不修改文件'}]};
  const material={material_id:'plan',source_artifact_id:plan.source.artifact_id,source_version:1,title:plan.title,text:JSON.stringify(plan)};
  try{
    const host=new AgentHost();host.register(adapter);const authority={manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root]};
    const session=await adapter.createSession({...owner,directory,title:'Original'}),other=await adapter.createSession({...owner,directory,title:'Other'});
    const request=(at=session)=>({...owner,session:at,directory,role_id:'builder',task:'Follow original steps.',execution_plan:plan,text_materials:[material]});
    const finish=async(ref:any)=>{const deadline=Date.now()+20_000;for(;;){const view=await adapter.read(ref);if(['completed','failed','stopped','cancelled'].includes(view.phase))return view;if(Date.now()>deadline)throw new Error('Timeout '+JSON.stringify(view));await new Promise(resolve=>setTimeout(resolve,10));}};
    await assert.rejects(host.start('prologue',{...request(),text_materials:[]},authority),/固定材料/);
    await assert.rejects(host.start('prologue',{...request(),role_id:'reader'},authority),/未开放计划/);
    assert.equal(calls,0);
    const first=await host.start('prologue',request(),authority);const done=await finish(first.ref);
    assert.equal(done.phase,'completed',JSON.stringify(done));assert.equal(turn,10);
    assert.equal(done.step_board?.terminal,true);assert.deepEqual(done.step_board?.nodes.map(node=>node.state),['succeeded','succeeded']);
    assert.match(done.step_board!.nodes[0].reports.at(-1)!.note,/ORIGINAL PLAN EVIDENCE/);assert.equal(done.step_board!.nodes[1].reports.length,5);
    assert.equal(done.frozen.budget?.max_turns,14);assert.deepEqual(done.frozen.execution_plan,plan);
    stage='guards';turn=0;const second=await host.start('prologue',request(other),authority);const failedSteps=await finish(second.ref);
    assert.equal(failedSteps.phase,'completed',JSON.stringify(failedSteps));assert.notEqual(currentBoard,firstBoard);
    assert.deepEqual(failedSteps.step_board?.nodes.map(node=>node.state),['failed','not-started']);
    assert.equal(failedSteps.step_board!.nodes[0].reports.length,2);assert.equal(failedSteps.step_board!.nodes[1].reports.length,0);
    assert.deepEqual((await adapter.read(first.ref)).step_board,done.step_board,'foreign read or writes never change the old graph');
    stage='same-session';turn=0;const third=await host.start('prologue',request(),authority);await finish(third.ref);
    assert.deepEqual((await adapter.read(first.ref)).step_board,done.step_board);
    stage='ordinary';turn=0;const ordinary=await host.start('prologue',{...request(other),execution_plan:undefined,text_materials:[]},authority);assert.equal((await finish(ordinary.ref)).step_board,undefined);
    await assert.rejects(adapter.read({...first.ref,session_id:other.session_id}),/不属于/);
    stage='interrupted';turn=0;const interrupted=await host.start('prologue',request(other),authority);
    const deadline=Date.now()+10_000;while(turn<3){if(Date.now()>deadline)throw new Error('provider did not enter the unfinished step');await new Promise(resolve=>setTimeout(resolve,10));}
    await adapter.control(interrupted.ref,{kind:'stop'});const stopped=await finish(interrupted.ref);
    assert.equal(stopped.phase,'stopped');assert.deepEqual(stopped.step_board?.nodes.map(node=>node.state),['running','not-started']);
    const count=calls;await adapter.close();adapter=await make();
    assert.deepEqual((await adapter.read(interrupted.ref)).step_board,stopped.step_board,'stop and restart never fabricate terminal step reports');
    assert.deepEqual((await adapter.read(first.ref)).step_board,done.step_board);assert.deepEqual((await adapter.read(second.ref)).step_board,failedSteps.step_board);
    assert.equal(calls,count,'restoring original boards never calls the provider or repeats tools');
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});
