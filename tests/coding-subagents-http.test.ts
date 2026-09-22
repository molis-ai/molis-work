import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test('Coding child controls bind original run, keep acceptance separate, reject stale and foreign requests',async()=>{
  const home=mkdtempSync(join(tmpdir(),'coding-child-http-')),dbPath=join(home,'board.db');seedDemoBoard(dbPath);let store=new LocalProjectDatabase(dbPath);
  const sessions=new CodingSessionStore(store.db);sessions.create({board_id:DEMO_BOARD_ID,session_id:'app',title:'App',runtime_id:'prologue',at:new Date().toISOString()});sessions.setRuntimeSession(DEMO_BOARD_ID,'app','sdk',new Date().toISOString());
  let state='running',cancels=0;
  const host=()=>({store,homeDirectory:home,boardId:DEMO_BOARD_ID,actorId:'web-user',goalTitle:()=>undefined,escapeHtml:(v:unknown)=>String(v),translate:(v:string)=>v,
    execution:{ready:async()=>{},models:async()=>[]},capabilities:{async invoke<I,O>(definition:{capability_id:string},args:I):Promise<O>{
      const input=args as any[];
      if(input[0]?.session_id!=='sdk'||input[1]?.run_id!=='parent')throw new Error('not original parent');
      if(definition.capability_id===agent.listSubagents.capability_id)return [{subagent_id:'child',parent_run:input[1],role_id:'coding-reader',task:'read',state,result:'candidate',workspace_path:home}] as O;
      if(definition.capability_id===agent.cancelSubagent.capability_id){assert.equal(input[2],'child');assert.equal(input[3],'web-user');cancels++;return undefined as O;}
      throw new Error('Unexpected capability');
    }}});
  const server=createServer((req,res)=>{void handleCodingPluginHttp(req,res,new URL(req.url!,'http://localhost'),host()).catch(error=>{res.writeHead(500);res.end(String(error));});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const post=async(body:any,child='child',run='parent')=>{const res=await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app/runs/${run}/subagents/${child}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
  try{
    assert.equal((await post({action:'accepted',expected_revision:0})).status,400);
    assert.equal((await post({action:'stop'},'foreign')).status,400);assert.equal((await post({action:'stop'},'child','other')).status,400);assert.equal(cancels,0);
    assert.equal((await post({action:'stop'})).status,200);assert.equal(cancels,1);
    state='completed';assert.equal((await post({action:'needs-work',expected_revision:0,notes:''})).status,400);
    assert.equal((await post({action:'needs-work',expected_revision:0,notes:'缺少文件依据'})).status,200);
    assert.equal((await post({action:'accepted',expected_revision:0})).status,400);
    await releaseCodingSurface(store,DEMO_BOARD_ID);store.close();store=new LocalProjectDatabase(dbPath);
    assert.equal((await post({action:'accepted',expected_revision:0})).status,400,'revision and verdict persist after reopen');
    assert.equal((await post({action:'accepted',expected_revision:1,notes:'已独立核对'})).status,200);
    assert.equal(state,'completed','verdict does not modify execution state');assert.equal(cancels,1,'verdict does not execute or stop again');
    state='reconcile-required';assert.equal((await post({action:'accepted',expected_revision:2})).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await releaseCodingSurface(store,DEMO_BOARD_ID);store.close();rmSync(home,{recursive:true,force:true});}
});
