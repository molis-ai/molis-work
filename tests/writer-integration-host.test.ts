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
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
const exec=promisify(execFile);
function response(name?:string,input?:unknown){const frames=[{type:"message_start",message:{id:"f",type:"message",role:"assistant",model:"fixture",content:[],usage:{input_tokens:10,output_tokens:0}}},
 ...(name?[{type:"content_block_start",index:0,content_block:{type:"tool_use",id:"f-"+name,name,input}}]:[{type:"content_block_start",index:0,content_block:{type:"text",text:""}},{type:"content_block_delta",index:0,delta:{type:"text_delta",text:"finished"}}]),
 {type:"content_block_stop",index:0},{type:"message_delta",delta:{stop_reason:name?"tool_use":"end_turn"},usage:{output_tokens:10}},{type:"message_stop"}];return new Response(frames.map(f=>`event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join(""),{headers:{"content-type":"text/event-stream"}});}

for (const parentOutcome of ["completed", "failed"] as const) test(`Host integrates an owned completed child after parent ${parentOutcome}, preserving rejection, stale proposal and restart evidence`,{timeout:40000},async t=>{
 const home=await realpath(await mkdtemp(path.join(tmpdir(),"integration-host-"))),root=path.join(home,"repo");await mkdir(root);
 const git=(...args:string[])=>exec("git",args,{cwd:root});await git("init","-q");await git("config","user.name","Fixture");await git("config","user.email","fixture@example.invalid");await writeFile(path.join(root,"note.txt"),"base\n");await git("add",".");await git("commit","-qm","base");
 const tree=await createGitWorktreePort(root).create("child"),childRoot=path.resolve(root,tree.directory);
 let grants=[{workspace_id:"main",canonical_path:root,realpath_verified:true,display_name:"Parent"},{workspace_id:"child",canonical_path:childRoot,realpath_verified:true,display_name:"Child"}];
 let parentCalls=0,childCalls=0;
 t.mock.method(globalThis,"fetch",async(_url:unknown,init:RequestInit)=>{
  const body=JSON.parse(typeof init.body==="string"?init.body:new TextDecoder().decode(init.body as Uint8Array));
  const isChild=body.messages.some((m:any)=>m.role==='user'&&JSON.stringify(m.content).includes('CHILD_TASK'));
  if(isChild){childCalls++;return childCalls===1?response("read",{path:"note.txt"}):childCalls===2?response("write",{path:"note.txt",text:"child result\n"}):response();}
  parentCalls++;const character=JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@[0-9]+/)?.[0];assert.ok(character);
  return parentCalls===1?response("dispatch-subagent",{instruction:"CHILD_TASK read and update note.txt",tools:["read","search","context-remaining","write","edit","run-command"],workspace:"child",character,idempotencyKey:"child",background:false}):parentOutcome === "failed" ? new Response(JSON.stringify({type:"error",error:{type:"invalid_request_error",message:"fixture parent cannot finish its report"}}),{status:400,headers:{"content-type":"application/json"}}):response();
 });
 const localHost=new MolisWorkLocalHost(),reference=molisWorkHostProjectReference({databasePath:path.join(home,"board.db"),boardId:"board",projectId:"project"}),client=localHost.client(reference);
 const make=()=>composeAgentHost({localHost,homeDirectory:home,workspaceFor:()=>grants[0]!,workspacesFor:()=>grants,cliRuntimes:[],prologue:{storageRoot:path.join(home,"sdk"),modelConfiguration:async()=>({protocol:"anthropic-compatible",endpoint:"https://1.1.1.1/v1/messages",model:"fixture",credential_ref:"fixture"}),resolveCredential:()=>"test-only"}});
 let composition=make();await composition.ready;
 try{
  const adapter=composition.agentHost.adapter("prologue"),owner={board_id:"board",plugin_id:"io.molis.work.coding",install_id:"fixture",actor_id:"user"},directory={canonical_path:root,realpath_verified:true};
  const session=await adapter.createSession({...owner,directory,title:"integration"});
  const handle=await composition.agentHost.start("prologue",{...owner,session,directory,role_id:"writers",task:"delegate once",subagent_workspaces:[{workspace_id:"child",directory:{canonical_path:childRoot,realpath_verified:true}}]}, {manifest:codingAgentManifest,prompts:codingPrompts,authorizedDirectories:[root,childRoot]});
  const source={session_id:session.session_id,run_id:handle.ref.run_id,subagent_id:"unknown"};
  await assert.rejects(client.invoke(integration.read,source),/父任务|子任务/);
  const deadline=Date.now()+15000,decided=new Set<string>();
  while(!["completed","failed"].includes((await adapter.read(handle.ref)).phase)){
   assert.ok(Date.now()<deadline,"fixture task must complete");await composition.agentHost.reviews.refresh("board");
   for(const review of composition.agentHost.reviews.list("board"))if(composition.agentHost.reviews.receipt(review.review_id)?.status==="pending"&&!decided.has(review.review_id)){decided.add(review.review_id);await composition.agentHost.reviews.respond({review_id:review.review_id,decision:"approve",actor_id:"user"});}
   await new Promise(r=>setTimeout(r,10));
  }
  assert.equal((await adapter.read(handle.ref)).phase,parentOutcome);
  const children=await adapter.subagents!.list(handle.ref); assert.equal(children.length,1,JSON.stringify(await adapter.read(handle.ref))); source.subagent_id=children[0]!.subagent_id;
  const view=await client.invoke(integration.read,source);assert.equal(view.files[0]!.after_text,"child result\n");assert.equal(view.files[0]!.selectable,true);
  const other=localHost.client(molisWorkHostProjectReference({databasePath:path.join(home,"other.db"),boardId:"other",projectId:"other"}));
  await assert.rejects(other.invoke(integration.read,source),/不属于/);
  await assert.rejects(client.invoke(integration.read,{...source,subagent_id:"forged"}),/子任务/);
  const files=view.files.map(f=>({path:f.path,revision:f.revision!}));
  const operation_id=randomUUID(),pending=await client.invoke(integration.prepare,{...source,files,operation_id});
  assert.equal((await client.invoke(integration.prepare,{...source,files,operation_id})).review_id,pending.review_id);
  await composition.agentHost.reviews.respond({review_id:pending.review_id,decision:"reject",actor_id:"user"});assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"base\n");
  const stale=await client.invoke(integration.prepare,{...source,files,operation_id:randomUUID()});await writeFile(path.join(childRoot,"note.txt"),"changed after review\n");
  await composition.agentHost.reviews.respond({review_id:stale.review_id,decision:"approve",actor_id:"user"});assert.ok(composition.agentHost.reviews.receipt(stale.review_id)?.effect_error);assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"base\n");
  const refreshed=await client.invoke(integration.read,source),ready=await client.invoke(integration.prepare,{...source,files:refreshed.files.map(f=>({path:f.path,revision:f.revision!})),operation_id:randomUUID()});
  const index=await readFile(path.join(root,".git/index"));await composition.agentHost.reviews.respond({review_id:ready.review_id,decision:"approve",actor_id:"user"});
  assert.equal(composition.agentHost.reviews.receipt(ready.review_id)?.effect_settled,true);assert.equal(await readFile(path.join(root,"note.txt"),"utf8"),"changed after review\n");assert.deepEqual(await readFile(path.join(root,".git/index")),index);
  const receipt=composition.agentHost.reviews.receipt(ready.review_id),request=composition.agentHost.reviews.get(ready.review_id),calls=parentCalls+childCalls;
  await composition.dispose();composition=make();await composition.ready;await composition.agentHost.reviews.refresh("board");
  assert.deepEqual(composition.agentHost.reviews.receipt(ready.review_id),receipt);assert.deepEqual(composition.agentHost.reviews.get(ready.review_id),request);
  await assert.rejects(composition.agentHost.reviews.respond({review_id:ready.review_id,decision:"approve",actor_id:"user"}));assert.equal(parentCalls+childCalls,calls);
  grants=grants.slice(0,1);await assert.rejects(client.invoke(integration.read,source),/授权/);
 }finally{await composition.dispose();await localHost.close();await rm(home,{recursive:true,force:true});}
});
