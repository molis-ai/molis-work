import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleJellyNativePluginHttp } from '../apps/local-host/src/jelly-native-plugin-http.js';
import { openJellyStore } from '../plugins/native/jelly/src/store.js';
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
async function fixture(t: {after(fn:()=>void|Promise<void>):void}, ports: { completeText?: HostCompleteText } = {}) {
  const home=mkdtempSync(join(tmpdir(),'jelly-http-'));
  const host=new MolisWorkLocalHost({homeDirectory:home,completeText:ports.completeText??null});
  const actions=(transport:object)=>bindActionClient(host.homeActionClient(),()=>({actor_id:'user',project_id:null,audience:'user',permissions:JELLY_ACTION_PERMISSIONS,...transport}));
  const server:Server=createServer((request,response)=>{void handleJellyNativePluginHttp(request,response,new URL(request.url!,'http://localhost'),actions).then(handled=>{if(!handled){response.writeHead(404);response.end();}}).catch(error=>{response.writeHead(500);response.end(error.message);});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await host.close();rmSync(home,{recursive:true,force:true});});
  const address=server.address();assert.ok(address&&typeof address==='object');
  return {home,base:'http://127.0.0.1:'+address.port};
}
const post=(base:string,path:string,body:unknown,signal?:AbortSignal)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});

test('a plan stream reports progress, returns the plan and commits nothing',async t=>{
  const {base,home}=await fixture(t,{completeText:async()=>JSON.stringify({actions:[{title:'核对来源与任务',notes:'逐条核实',minutes:30}],clarification_questions:[]})});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'任务与日历应一致；保留来源以便核对。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const response=await post(base,'/api/jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id});
  assert.match(response.headers.get('content-type')!,/ndjson/);
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));const final=events.at(-1);
  assert.equal(events[0].type,'progress');assert.equal(final.type,'result');assert.equal(final.result.plan.actions[0].title,'核对来源与任务');
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
  // Only planning streams: the routes that read files and pages now belong to 灵光.
  assert.equal((await post(base,'/api/jelly/material?stream=1',{file_name:'a.txt',data_base64:'YQ=='})).status,404);
});

test('disconnecting a plan aborts model work and changes nothing',async t=>{
  let started!:()=>void, cancelled!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});const aborted=new Promise<void>(resolve=>{cancelled=resolve;});
  const {base,home}=await fixture(t,{completeText:async(_prompt,options)=>{started();return new Promise<string>((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>{cancelled();reject(new Error('cancelled'));},{once:true});});}});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'这是取消场景的原始材料。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const controller=new AbortController();const pending=post(base,'/api/jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id},controller.signal);await began;const response=await pending;
  const body=response.text().catch(()=>null);controller.abort();await aborted;await body;
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
});
