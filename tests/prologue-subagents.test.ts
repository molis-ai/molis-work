import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
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
      const catalog=JSON.stringify(body.system);assert.doesNotMatch(catalog,/molis-child-[a-z0-9-]+@1@/);const character=catalog.match(/molis-child-[a-z0-9-]+@1/)?.[0];assert.ok(character,catalog);
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
    const owner={project_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
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
      {manifest:forbidden,prompts:codingPrompts,authorizedDirectories:[root]}),
      (error: Error & {code?: string}) => error.code === "agent.role_execution_exceeded" && /子角色请求了当前父任务未开放的工具与目录/.test(error.message));
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
    if(parentCalls===1){let character=JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@1/)?.[0];assert.ok(character);
      if(outcome==='unknown-role')character=JSON.stringify(body.system).match(/molis-role-[a-z0-9-]+/)?.[0]+'@8';
      return response('',{name:'dispatch-subagent',input:{instruction:'CONTROL_CHILD inspect only',tools:['read','search','context-remaining'],character,idempotencyKey:'child-control',maxTurns:2}});}
    return response('Observed child outcome, no acceptance claim.');
  });
  const queue=new AgentReviewQueue();const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.child-control-'+outcome,appVersion:'1.0.0'},storageRoot:join(root,'runtime'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'fixture'});
  try{
    const host=new AgentHost({reviews:queue});host.register(adapter);const owner={project_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
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

test('a named child role brings its own tools: an empty tools list still gives them, and nothing past them or the parent is given (A1)', {timeout:40_000}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'molis-child-tools-'));let parentCalls=0;const childTools:Record<string,string[]>={};let parentTools:string[]=[];
  type ModelRequest={system?:unknown;tools?:Array<{name:string}>;messages:Array<{content:string|Array<{type:string;text?:string}>}>};
  const firstText=(body:ModelRequest)=>{const content=body.messages[0]!.content;return typeof content==='string'?content:content.find(block=>block.type==='text')?.text??'';};
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body:ModelRequest=JSON.parse(typeof init.body==='string'?init.body:new TextDecoder().decode(init.body as Uint8Array));
    const names=(body.tools??[]).map(tool=>tool.name).sort(),child=/^TOOLS_CHILD_[AB]/.exec(firstText(body))?.[0];
    if(child){childTools[child]=names;return response(`${child} done`);}
    parentCalls++;
    if(parentCalls===1){
      const system=JSON.stringify(body.system);parentTools=names;
      assert.doesNotMatch(system,/完整 tools 清单|显式提供/,'the host no longer asks the model to restate the role\'s tools');
      const character=/(molis-child-[a-z0-9-]+@\d+): 代码调查/.exec(system)?.[1];assert.ok(character,system);
      return response('',{name:'dispatch-subagent',input:{instruction:'TOOLS_CHILD_A: report done.',tools:[],character,idempotencyKey:'tools-a',maxTurns:2}});
    }
    if(parentCalls===2){
      const character=/(molis-child-[a-z0-9-]+@\d+): 代码调查/.exec(JSON.stringify(body.system))![1];
      // write and edit: the coordinator does not hold them. run-command: it does (for the reviewer), but this role does not declare it.
      return response('',{name:'dispatch-subagent',input:{instruction:'TOOLS_CHILD_B: report done.',tools:['read','write','edit','run-command'],character,idempotencyKey:'tools-b',maxTurns:2}});
    }
    return response('Both children reported.');
  });
  const queue=new AgentReviewQueue();
  const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.subagent-test',appVersion:'1.0.0'},storageRoot:join(root,'runtime'),reviewQueue:queue,
    modelConfiguration:async()=>({protocol:'anthropic-compatible',endpoint:'https://1.1.1.1/v1/messages',model:'fixture',credential_ref:'fixture'}),resolveCredential:()=> 'test-only'});
  try{
    const host=new AgentHost({reviews:queue});host.register(adapter);
    const owner={project_id:'b',plugin_id:'io.molis.work.coding',install_id:'i',actor_id:'user'},directory={canonical_path:root,realpath_verified:true};
    const session=await adapter.createSession({...owner,directory,title:'Parent'});
    const handle=await host.start('prologue',{...owner,session,directory,role_id:'coordinator',task:'Delegate two inspections.'},
      {manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root]});
    const deadline=Date.now()+20_000;let view:AgentRunView;
    for(;;){
      view=await adapter.read(handle.ref);
      if(['completed','failed','cancelled'].includes(view.phase))break;
      if(Date.now()>deadline)throw new Error('Timed out: '+JSON.stringify({view,childTools}));
      for(const review of queue.list('b','pending'))await queue.respond({review_id:review.review_id,decision:'approve',actor_id:'user'});
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(view.phase,'completed',view.stop_reason);
    const declared=['list','read','search'];
    for(const child of ['TOOLS_CHILD_A','TOOLS_CHILD_B']){
      const tools=childTools[child];assert.ok(tools,`${child} never asked the model`);
      for(const name of declared)assert.ok(tools.includes(name),`${child} lacks its role's ${name}: ${tools}`);
      for(const name of ['write','edit','run-command'])assert.equal(tools.includes(name),false,`${child} was given ${name}: ${tools}`);
      for(const name of tools)assert.ok(parentTools.includes(name),`${child} holds ${name}, which its parent does not: ${tools}`);
    }
    assert.ok(!parentTools.includes('write')&&parentTools.includes('run-command'),parentTools.join());
    assert.deepEqual(childTools.TOOLS_CHILD_A,childTools.TOOLS_CHILD_B,'what the model put in tools changed nothing');
  }finally{await adapter.close();await rm(root,{recursive:true,force:true});}
});


const requireC3Sdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost: createC3Host } = await import(requireC3Sdk.resolve("@prologue/sdk/node"));
type C3ParentIndex = { attempts: Array<{ refused?: { code: string; at: string }; child_openings?: Array<{ parent_run: string; session?: { id: string }; run?: { id: string }; format: string }> }> };
type C3ChildWire = { messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>; system?: unknown };

for (const indexed of [false, true]) test(`C3 real Node child exact caller survives reopen without opening a new entry; indexed=${indexed}`, { timeout: 40_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-c3-child-"));
  const requests: C3ChildWire[] = []; let parentCalls = 0, childCalls = 0;
  // The child Character carries its role's declared version; read it from the manifest instead of fixing a number.
  const childRole = codingAgentManifest.subagents!.roles.find(role => role.role_id === (indexed ? "coding-reviewer" : "coding-reader"))!;
  const childCharacter = new RegExp(`molis-child-[a-z0-9-]+@${childRole.version}(?![0-9])`);
  const model = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw) as C3ChildWire; requests.push(body);
    const child = body.messages.some(m => m.role === "user" && (typeof m.content === "string" ? m.content.startsWith("EXACT_NEW_CHILD") : m.content?.some(p => p.text?.startsWith("EXACT_NEW_CHILD"))));
    let reply: Response;
    if (child) { childCalls++; reply = response("CHILD_DONE"); }
    else {
      parentCalls++;
      if (parentCalls === 1 || parentCalls === 2) {
        const character = JSON.stringify(body.system).match(childCharacter)?.[0]; assert.ok(character);
        reply = response("", { name: "dispatch-subagent", input: { instruction: "EXACT_NEW_CHILD: inspect the source, no changes.", tools: ["read", "search"], character, idempotencyKey: "same-child", maxTurns: 2 } });
      } else if (parentCalls === 3) {
        const childRef = JSON.stringify(body.messages).match(/sub-[a-z0-9-]+/)?.[0]; assert.ok(childRef);
        reply = response("", { name: "await-subagents", input: { refs: [childRef], mode: "all", timeoutMs: 10000 } });
      } else reply = response("Parent done.");
    }
    res.writeHead(200, { "content-type": "text/event-stream" }); res.end(Buffer.from(await reply.arrayBuffer()));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const address = model.address(); assert.ok(address && typeof address !== "string");
  let queue = new AgentReviewQueue();
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.c3-child", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture" });
  let adapter = await make();
  try {
    let host = new AgentHost({ reviews: queue }); host.register(adapter);
    const owner = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "person" }, directory = { canonical_path: root, realpath_verified: true };
    const manifest = structuredClone(codingAgentManifest);
    manifest.subagents!.roles = manifest.subagents!.roles.filter(role => role.role_id === (indexed ? "coding-reviewer" : "coding-reader"));
    const session = await adapter.createSession({ ...owner, directory, title: "Parent" });
    const parent = await host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Delegate one exact child." }, { manifest, prompts: codingPrompts, authorizedDirectories: [root] });
    const approved = new Set<string>();
    for (const deadline = Date.now() + 20000; ;) {
      const view = await adapter.read(parent.ref);
      if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
      assert.ok(Date.now() < deadline, JSON.stringify({ requests, view }));
      for (const review of queue.list("p", "pending")) if (!approved.has(review.review_id)) { approved.add(review.review_id); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "person" }); }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const children = await adapter.subagents!.list(parent.ref); assert.equal(children.length, 1); assert.equal(childCalls, 1);
    const child = children[0]!;
    assert.equal(child.continuation_task?.status, "available");
    assert.ok(child.continuation_task?.status === "available" && child.continuation_task.text.startsWith("EXACT_NEW_CHILD"));
    const before = requests.length;
    await adapter.close(); queue = new AgentReviewQueue(); adapter = await make();
    assert.deepEqual(await adapter.subagents!.list(parent.ref), children, "the original parent's body-free generation fact restores the exact child task");
    assert.equal(requests.length, before);
    if (indexed) {
      host = new AgentHost({ reviews: queue }); host.register(adapter);
      const childSession = { runtime_id: "prologue", session_id: child.child_run!.session_id };
      const next = await host.start("prologue", { ...owner, session: childSession, directory, role_id: "reader", task: "NEXT_CHILD_TASK" }, { manifest, prompts: codingPrompts, authorizedDirectories: [root] });
      for (const deadline = Date.now() + 10000; ;) {
        const view = await adapter.read(next.ref);
        if (["completed", "failed", "cancelled"].includes(view.phase)) { assert.equal(view.phase, "completed", view.stop_reason); break; }
        assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(JSON.stringify(requests.at(-1)).includes("NEXT_CHILD_TASK"));
    } else await assert.rejects(adapter.readSession({ runtime_id: "prologue", session_id: child.child_run!.session_id }), /会话|session/);
    // Exercise attribution through the public Adapter after altering only the persisted fixture's body-free proof.
    await adapter.close();
    const inspector = createC3Host({ storageRoot: join(root, "runtime") });
    const kind = `molis-agent-index-${createHash("sha256").update("io.molis.work.c3-child").digest("hex").slice(0, 24)}`;
    const bytes = await inspector.storage.readSecure({ kind, id: session.session_id });
    let original: C3ParentIndex;
    try { original = JSON.parse(new TextDecoder().decode(bytes)) as C3ParentIndex; } finally { bytes.fill(0); }
    const proof = original.attempts[0]!.child_openings![0]!;
    assert.deepEqual(Object.keys(proof).sort(), ["format", "parent_run", "run", "session"], "the original parent stores no copied caller body");
    assert.equal(original.attempts[0]!.child_openings!.length, 1);
    for (const change of ["missing", "duplicate", "foreign-parent", "foreign-session", "foreign-run", "duplicate-parent", "refused-parent", "missing-run", "missing-session", "non-array"] as const) {
      const saved = structuredClone(original), facts = saved.attempts[0]!.child_openings!;
      if (change === "missing") saved.attempts[0]!.child_openings = [];
      else if (change === "duplicate") facts.push(structuredClone(facts[0]!));
      else if (change === "foreign-parent") facts[0]!.parent_run = "foreign-parent";
      else if (change === "foreign-session") facts[0]!.session!.id = "foreign-session";
      else if (change === "foreign-run") facts[0]!.run!.id = "foreign-run";
      else if (change === "duplicate-parent") saved.attempts.push(structuredClone(saved.attempts[0]!));
      else if (change === "refused-parent") saved.attempts[0]!.refused = { code: "SESSION_HISTORY_UNAVAILABLE", at: "2026-11-04T00:00:00.000Z" };
      else if (change === "missing-run") delete facts[0]!.run;
      else if (change === "missing-session") delete facts[0]!.session;
      else Object.assign(saved.attempts[0]!, { child_openings: { format: "caller-only-v1" } });
      const record = await inspector.storage.get({ kind, id: session.session_id }); assert.ok(record);
      await inspector.storage.commit({ kind, id: session.session_id, expectedVersion: record.version, metadata: { schema: 1 }, secureBody: new TextEncoder().encode(JSON.stringify(saved)) });
      adapter = await make();
      const actual = (await adapter.subagents!.list(parent.ref))[0]!;
      assert.deepEqual(actual.continuation_task, { status: "unavailable" }, change);
      assert.equal(actual.task, child.task, "unattributed raw history remains readable");
      if (indexed) {
        host = new AgentHost({ reviews: queue }); host.register(adapter);
        const count = requests.length;
        await assert.rejects(host.start("prologue", { ...owner, session: { runtime_id: "prologue", session_id: child.child_run!.session_id }, directory, role_id: "reader", task: "UNPROVEN_CHILD_FOLLOWUP" },
          { manifest, prompts: codingPrompts, authorizedDirectories: [root] }), (error: unknown) => error instanceof Error && "code" in error && error.code === "agent.capability_unavailable");
        assert.equal(requests.length, count, `${change}: rejected indexed child sends nothing`);
        assert.ok((await adapter.read(child.child_run!)).turns.some(turn => turn.text.startsWith("EXACT_NEW_CHILD")), `${change}: raw indexed child remains readable`);
      }
      await adapter.close();
    }
  } finally { await adapter.close(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
