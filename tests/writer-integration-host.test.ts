import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference, createGitWorktreePort } from "@molis-ai/molis-work-app-local-host";
import { writerIntegrationCapabilities as integration } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { reviewPlugins } from "./fixtures/review-plugins.js";
const exec=promisify(execFile);
function response(name?:string,input?:unknown){const frames=[{type:"message_start",message:{id:"f",type:"message",role:"assistant",model:"fixture",content:[],usage:{input_tokens:10,output_tokens:0}}},
 ...(name?[{type:"content_block_start",index:0,content_block:{type:"tool_use",id:"f-"+name,name,input}}]:[{type:"content_block_start",index:0,content_block:{type:"text",text:""}},{type:"content_block_delta",index:0,delta:{type:"text_delta",text:"finished"}}]),
 {type:"content_block_stop",index:0},{type:"message_delta",delta:{stop_reason:name?"tool_use":"end_turn"},usage:{output_tokens:10}},{type:"message_stop"}];return new Response(frames.map(f=>`event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join(""),{headers:{"content-type":"text/event-stream"}});}

for (const parentOutcome of ["completed", "failed"] as const) test(`Host integrates an owned completed child after parent ${parentOutcome}, preserving rejection, stale proposal and restart evidence`,{timeout:40000},async t=>{
 const home=await realpath(await mkdtemp(path.join(tmpdir(),"integration-host-"))),root=path.join(home,"repo");await mkdir(root);
 const git=(...args:string[])=>exec("git",args,{cwd:root});await git("init","-q");await git("config","user.name","Fixture");await git("config","user.email","fixture@example.invalid");await writeFile(path.join(root,"note.txt"),"base\n");await git("add",".");await git("commit","-qm","base");
 const tree=await createGitWorktreePort(root).create("child"),childRoot=path.resolve(root,tree.directory);
 // The child's worktree is the Host's own, not a folder of the project (plan A): the project has only its output.
 const grants=[{workspace_id:"main",canonical_path:root,realpath_verified:true,display_name:"Parent"}];let output:typeof grants[0]|null=grants[0]!;
 let parentCalls=0,childCalls=0;
 t.mock.method(globalThis,"fetch",async(_url:unknown,init:RequestInit)=>{
  const body=JSON.parse(typeof init.body==="string"?init.body:new TextDecoder().decode(init.body as Uint8Array));
  const isChild=body.messages.some((m:any)=>m.role==='user'&&JSON.stringify(m.content).includes('CHILD_TASK'));
  if(isChild){childCalls++;return childCalls===1?response("read",{path:"note.txt"}):childCalls===2?response("write",{path:"note.txt",text:"child result\n"}):response();}
  parentCalls++;const character=JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@[0-9]+/)?.[0];assert.ok(character);
  return parentCalls===1?response("dispatch-subagent",{instruction:"CHILD_TASK read and update note.txt",tools:["read","search","context-remaining","write","edit","run-command"],workspace:"child",character,idempotencyKey:"child",background:false}):parentOutcome === "failed" ? new Response(JSON.stringify({type:"error",error:{type:"invalid_request_error",message:"fixture parent cannot finish its report"}}),{status:400,headers:{"content-type":"application/json"}}):response();
 });
 const localHost=new MolisWorkLocalHost(),reference=molisWorkHostProjectReference({databasePath:path.join(home,"board.db"),projectId: "board"});
 const make=()=>composeAgentHost({localHost,homeDirectory:home,workspaceFor:()=>output,workspacesFor:()=>grants,prologue:{storageRoot:path.join(home,"sdk"),modelConfiguration:async()=>({protocol:"anthropic-compatible",endpoint:"https://1.1.1.1/v1/messages",model:"fixture",credential_ref:"fixture"}),resolveCredential:()=>"test-only"}});
 let composition=make();await composition.ready;
 // Integrating is a review only the installation holding review:git-integration asks for, through its own session (S-50); reading
 // what would be integrated is that installation's too (W5-01-CODING-46). Both are the Host's actions, offered to plugins only (PG-035).
 const plugins=reviewPlugins(localHost,reference,path.join(home,"plugins.db")),coding="io.molis.work.coding",reviewer="io.molis.work.example.reviewer";
 const integrate=[{permission:"review:git-integration",required:true,reason:"Brings a child's result back once a person approves"},{permission:"workspace:read",required:true,reason:"Reads what a child's result would bring back"}] as const;
 const granted=["review:git-integration","workspace:read"],consumes=[integration.read.capability_id,integration.prepare.capability_id];
 const install_id=await plugins.start(coding,[...integrate],granted,consumes);
 const reads=plugins.actions(coding),elsewhere=reviewPlugins(localHost,molisWorkHostProjectReference({databasePath:path.join(home,"other.db"),projectId: "other"}),path.join(home,"other-plugins.db"));
 try{
  const adapter=composition.agentHost.adapter("prologue"),owner={project_id:"board",plugin_id:coding,install_id,actor_id:"user"},directory={canonical_path:root,realpath_verified:true};
  const session=await adapter.createSession({...owner,directory,title:"integration"});
  const handle=await composition.agentHost.start("prologue",{...owner,session,directory,role_id:"writers",task:"delegate once",subagent_workspaces:[{worktree_id:"child",directory:{canonical_path:childRoot,realpath_verified:true}}]}, {manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root],worktrees:async()=>[{worktree_id:"child",canonical_path:childRoot}]});
  const source={session_id:session.session_id,run_id:handle.ref.run_id,subagent_id:"unknown"};
  await assert.rejects(reads.invoke(integration.read,source),{code:"workspace_git.writer.unsettled",message:/父任务|子任务/});
  const deadline=Date.now()+15000,decided=new Set<string>();
  while(!["completed","failed"].includes((await adapter.read(handle.ref)).phase)){
   assert.ok(Date.now()<deadline,"fixture task must complete");await composition.agentHost.reviews.refresh("board");
   for(const review of composition.agentHost.reviews.list("board"))if(composition.agentHost.reviews.receipt(review.review_id)?.status==="pending"&&!decided.has(review.review_id)){decided.add(review.review_id);await composition.agentHost.reviews.respond({review_id:review.review_id,decision:"approve",actor_id:"user"});}
   await new Promise(r=>setTimeout(r,10));
  }
  assert.equal((await adapter.read(handle.ref)).phase,parentOutcome);
  const children=await adapter.subagents!.list(handle.ref); assert.equal(children.length,1,JSON.stringify(await adapter.read(handle.ref))); source.subagent_id=children[0]!.subagent_id;
  const view=await reads.invoke(integration.read,source);assert.equal(view.files[0]!.after_text,"child result\n");assert.equal(view.files[0]!.selectable,true);
  assert.deepEqual([view.workspace_id,view.worktree_id],["main","child"],"the output it comes back to, and the Host's worktree it comes from");
  // A round recorded before writers were named by their worktree (its child carries `workspace_id`) is refused, never read another way.
  const recorded=adapter.read.bind(adapter),old=t.mock.method(adapter,"read",async(ref:Parameters<typeof recorded>[0])=>{const run=await recorded(ref);
   return {...run,frozen:{...run.frozen,subagent_workspaces:run.frozen.subagent_workspaces?.map(({worktree_id,directory})=>({workspace_id:worktree_id,directory}))}};});
  await assert.rejects(reads.invoke(integration.read,source),{code:"workspace_git.writer.round_outdated",message:/这一轮是旧版本开的，写手的目录接不上，请重开一轮/});
  old.mock.restore();
  await elsewhere.start(coding,[...integrate],granted,consumes);
  await assert.rejects(elsewhere.actions(coding).invoke(integration.read,source),{code:"workspace_git.writer.session_foreign",message:/不属于本项目/});
  await assert.rejects(reads.invoke(integration.read,{...source,subagent_id:"forged"}),{code:"workspace_git.writer.unsettled",message:/子任务/});
  const files=view.files.map(f=>({path:f.path,revision:f.revision!}));
  // W5-01-CODING-46: whose session this is decides who may integrate it, by plugin and installation together, never by a plugin's name.
  const asked=composition.agentHost.reviews.list("board").length,refuse={code:"workspace_git.writer.session_foreign",message:/不属于发起整合的这份插件安装/};
  const foreign=await adapter.createSession({...owner,install_id:"another-installation-of-coding",directory,title:"owned by another installation"});
  await assert.rejects(reads.invoke(integration.read,{...source,session_id:foreign.session_id}),refuse);
  await assert.rejects(reads.invoke(integration.prepare,{...source,session_id:foreign.session_id,files,operation_id:randomUUID()}),refuse);
  await plugins.start(reviewer,[...integrate],granted,consumes);
  const other_plugin=plugins.actions(reviewer);
  await assert.rejects(other_plugin.invoke(integration.read,source),refuse);
  await assert.rejects(other_plugin.invoke(integration.prepare,{...source,files,operation_id:randomUUID()}),refuse);
  // A plugin-audience call into the project that no plugin made carries no caller the Host issued.
  const unissued={actor_id:LOCAL_PERSON_ACTOR_ID,project_id:"board",audience:"plugin" as const,permissions:granted},gateway=localHost.actionClient(reference);
  await assert.rejects(gateway.invoke(unissued,integration.read,source),{code:"host.plugin_caller_invalid"});
  await assert.rejects(gateway.invoke(unissued,integration.prepare,{...source,files,operation_id:randomUUID()}),{code:"host.plugin_caller_invalid"});
  assert.equal(composition.agentHost.reviews.list("board").length,asked,"none of those refusals left a review");
  const operation_id=randomUUID(),pending=await reads.invoke(integration.prepare,{...source,files,operation_id});
  assert.equal((await reads.invoke(integration.prepare,{...source,files,operation_id})).review_id,pending.review_id);
  await composition.agentHost.reviews.respond({review_id:pending.review_id,decision:"reject",actor_id:"user"});assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"base\n");
  const stale=await reads.invoke(integration.prepare,{...source,files,operation_id:randomUUID()});await writeFile(path.join(childRoot,"note.txt"),"changed after review\n");
  await composition.agentHost.reviews.respond({review_id:stale.review_id,decision:"approve",actor_id:"user"});assert.ok(composition.agentHost.reviews.receipt(stale.review_id)?.effect_error);assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"base\n");
  const refreshed=await reads.invoke(integration.read,source),ready=await reads.invoke(integration.prepare,{...source,files:refreshed.files.map(f=>({path:f.path,revision:f.revision!})),operation_id:randomUUID()});
  const index=await readFile(path.join(root,".git/index"));await composition.agentHost.reviews.respond({review_id:ready.review_id,decision:"approve",actor_id:"user"});
  assert.equal(composition.agentHost.reviews.receipt(ready.review_id)?.effect_settled,true);assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"changed after review\n");assert.deepEqual(await readFile(path.join(root,".git/index")),index);
  const receipt=composition.agentHost.reviews.receipt(ready.review_id),request=composition.agentHost.reviews.get(ready.review_id),calls=parentCalls+childCalls;
  await composition.dispose();composition=make();await composition.ready;await composition.agentHost.reviews.refresh("board");
  assert.deepEqual(composition.agentHost.reviews.receipt(ready.review_id),receipt);assert.deepEqual(composition.agentHost.reviews.get(ready.review_id),request);
  await assert.rejects(composition.agentHost.reviews.respond({review_id:ready.review_id,decision:"approve",actor_id:"user"}));assert.equal(parentCalls+childCalls,calls);
  // It comes back only to the folder the round ran in while that is still the output, and only from the worktree the Host made for it.
  output=null;await assert.rejects(reads.invoke(integration.read,source),{code:"workspace_git.writer.workspace_unavailable",message:/输出目录/});output=grants[0]!;
  await git("worktree","remove","--force",childRoot);await assert.rejects(reads.invoke(integration.read,source),{code:"workspace_git.writer.workspace_unavailable",message:/独立工作树/});
 }finally{await plugins.close();await elsewhere.close();await composition.dispose();await localHost.close();await rm(home,{recursive:true,force:true});}
});

// Coding's 「用于下一轮」 (coordinator 2026-11-08): a session's rounds run in one of the Host's worktrees of the output, and what they changed
// comes back the way a writer's does, reviewed file by file. The worktree is the one the round's frozen record names, never the caller's.
test("CODING-WORKTREE-05 CODING-WORKTREE-06 CODING-WORKTREE-08 a round that ran in a worktree the Host made, never one of a writers round, brings what it wrote back to the output; a round in the output, or one whose worktree is not the Host's, is refused",{timeout:40000},async t=>{
 const home=await realpath(await mkdtemp(path.join(tmpdir(),"worktree-integration-"))),root=path.join(home,"repo");await mkdir(root);
 const git=(...args:string[])=>exec("git",args,{cwd:root});await git("init","-q");await git("config","user.name","Fixture");await git("config","user.email","fixture@example.invalid");await writeFile(path.join(root,"note.txt"),"base\n");await git("add",".");await git("commit","-qm","base");
 // Made straight from the writers dialog, never assigned to a writer.
 const made=await createGitWorktreePort(root).create("tree"),treeRoot=path.resolve(root,made.directory);
 const output={workspace_id:"main",canonical_path:root,realpath_verified:true,display_name:"Parent"},grants=[output];
 let calls=0;
 t.mock.method(globalThis,"fetch",async(_url:unknown,init:RequestInit)=>{
  const body=JSON.parse(typeof init.body==="string"?init.body:new TextDecoder().decode(init.body as Uint8Array));
  // A file that exists is read before it is written.
  calls++;return !JSON.stringify(body.messages).includes("WRITE_NOTE")?response():calls===1?response("read",{path:"note.txt"}):calls===2?response("write",{path:"note.txt",text:"from the worktree\n"}):response();
 });
 const localHost=new MolisWorkLocalHost(),reference=molisWorkHostProjectReference({databasePath:path.join(home,"board.db"),projectId: "board"});
 const composition=composeAgentHost({localHost,homeDirectory:home,workspaceFor:()=>output,workspacesFor:()=>grants,prologue:{storageRoot:path.join(home,"sdk"),modelConfiguration:async()=>({protocol:"anthropic-compatible",endpoint:"https://1.1.1.1/v1/messages",model:"fixture",credential_ref:"fixture"}),resolveCredential:()=>"test-only"}});await composition.ready;
 const plugins=reviewPlugins(localHost,reference,path.join(home,"plugins.db")),coding="io.molis.work.coding";
 const integrate=[{permission:"review:git-integration",required:true,reason:"Brings a worktree's result back once a person approves"},{permission:"workspace:read",required:true,reason:"Reads what a worktree's result would bring back"}] as const;
 const install_id=await plugins.start(coding,[...integrate],["review:git-integration","workspace:read"],[integration.read.capability_id,integration.prepare.capability_id]);
 const reads=plugins.actions(coding);
 try{
  const adapter=composition.agentHost.adapter("prologue"),owner={project_id:"board",plugin_id:coding,install_id,actor_id:"user"};
  const authority={manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root],worktrees:async()=>[{worktree_id:"tree",canonical_path:treeRoot}],
   directories:{revision:"directories-1",output,inputs:[],instructions_trusted:false}};
  const session=await adapter.createSession({...owner,directory:{canonical_path:root,realpath_verified:true},title:"worktree"});
  const settle=async(ref:{session_id:string;run_id:string})=>{const deadline=Date.now()+15000,decided=new Set<string>();
   while(!["completed","failed"].includes((await adapter.read(ref)).phase)){
    assert.ok(Date.now()<deadline,"fixture round must end");await composition.agentHost.reviews.refresh("board");
    for(const review of composition.agentHost.reviews.list("board"))if(composition.agentHost.reviews.receipt(review.review_id)?.status==="pending"&&!decided.has(review.review_id)){decided.add(review.review_id);await composition.agentHost.reviews.respond({review_id:review.review_id,decision:"approve",actor_id:"user"});}
    await new Promise(r=>setTimeout(r,10));
   }};
  // CODING-WORKTREE-05: the round runs in the worktree and writes there; the output is untouched.
  const inTree=await composition.agentHost.start("prologue",{...owner,session,directory:{canonical_path:treeRoot,realpath_verified:true},role_id:"writer",task:"WRITE_NOTE in note.txt"},authority);
  await settle(inTree.ref);
  assert.equal(await readFile(path.join(treeRoot,"note.txt"),"utf8"),"from the worktree\n");assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"base\n");
  assert.deepEqual((await adapter.read(inTree.ref)).frozen.directories?.execution,{kind:"worktree",worktree_id:"tree"});
  // CODING-WORKTREE-06: a worktree made straight from the dialog, never a writer's, is read as a child's would be: named by the session and
  // that round alone, as it is now.
  const source={session_id:session.session_id,run_id:inTree.ref.run_id};
  const view=await reads.invoke(integration.read,source);
  assert.deepEqual([view.workspace_id,view.worktree_id,view.source_path],["main","tree",treeRoot]);
  assert.equal(view.files[0]!.after_text,"from the worktree\n");assert.equal(view.files[0]!.selectable,true);
  // CODING-WORKTREE-08: a round that ran in the output has nothing to bring back; a round whose record names a worktree the Host does not
  // have for this project (another one, or one gone) is refused, whatever the caller says.
  const inOutput=await composition.agentHost.start("prologue",{...owner,session,directory:{canonical_path:root,realpath_verified:true},role_id:"reader",task:"look around"},authority);
  await settle(inOutput.ref);
  await assert.rejects(reads.invoke(integration.read,{session_id:session.session_id,run_id:inOutput.ref.run_id}),{code:"workspace_git.writer.source_missing",message:/不是在宿主的独立工作树里跑的/});
  // Naming the worktree in the input does not make it the round's: only the round's record says where it ran.
  await assert.rejects(reads.invoke(integration.read,{session_id:session.session_id,run_id:inOutput.ref.run_id,worktree_id:"tree"} as never),{code:"actions.input_invalid"});
  const recorded=adapter.read.bind(adapter),other=t.mock.method(adapter,"read",async(ref:Parameters<typeof recorded>[0])=>{const run=await recorded(ref);
   return {...run,frozen:{...run.frozen,directories:{...run.frozen.directories!,execution:{kind:"worktree" as const,worktree_id:"elsewhere"}}}};});
  await assert.rejects(reads.invoke(integration.read,source),{code:"workspace_git.writer.workspace_unavailable",message:/不是宿主为这个项目建的/});
  other.mock.restore();
  // CODING-WORKTREE-05: what the person approves lands in the output, and the worktree stays (nothing removes it; switching the session
  // back to the output is CODING-WORKTREE-07, tests/coding-writer-assignments-http.test.ts).
  const asked=await reads.invoke(integration.prepare,{...source,files:view.files.map(f=>({path:f.path,revision:f.revision!})),operation_id:randomUUID()});
  const document=composition.agentHost.reviews.get(asked.review_id)?.document;
  assert.ok(document?.kind==="git-integration"&&document.source.run_id===inTree.ref.run_id&&!("subagent_id" in document.source),"the review names the round, with no child");
  await composition.agentHost.reviews.respond({review_id:asked.review_id,decision:"approve",actor_id:"user"});
  assert.equal(composition.agentHost.reviews.receipt(asked.review_id)?.effect_settled,true);
  assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"from the worktree\n");
  assert.equal((await createGitWorktreePort(root).list()).length,1,"the worktree is kept");
 }finally{await plugins.close();await composition.dispose();await localHost.close();await rm(home,{recursive:true,force:true});}
});
