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
import type { JellyAiPorts } from '../plugins/native/jelly/src/ai.js';
async function fixture(t: {after(fn:()=>void|Promise<void>):void}, ports: JellyAiPorts = {}) {
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

test('material stream delivers progress and extraction, and errors remain reviewable',async t=>{
  const {base}=await fixture(t);
  const response=await post(base,'/api/jelly/material?stream=1',{file_name:'检查.txt',data_base64:Buffer.from('验证素材来源与笔记之间的联系。').toString('base64')});
  assert.match(response.headers.get('content-type')!,/ndjson/);
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(events[0].type,'progress');assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).result.text,'验证素材来源与笔记之间的联系。');
  const material=events.at(-1).result;
  const reread=await post(base,'/api/jelly/material/reread',{file_name:material.file_name,sha256:material.source_sha256});
  assert.equal(reread.status,200);assert.equal((await reread.json() as {text:string}).text,material.text);
  const badReference=await post(base,'/api/jelly/material/reread',{file_name:'../检查.txt',sha256:material.source_sha256});
  assert.equal(badReference.status,400);
  const invalid=await post(base,'/api/jelly/material?stream=1',{file_name:'bad.exe',data_base64:'AA=='});
  const failure=(await invalid.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1);
  assert.equal(failure.type,'error');assert.equal(failure.status,415);assert.match(failure.code,/unsupported/);
});

test('digest stream persists structured evidence only after successful completion',async t=>{
  const {base,home}=await fixture(t,{completeText:async prompt=>{
    const blocks=JSON.parse(prompt.match(/<材料块>\n([\s\S]*?)\n<\/材料块>/u)![1]!);const id=blocks[0].id;
    return JSON.stringify({thesis:{text:'核对来源与任务',evidence_block_ids:[id]},takeaways:[{text:'任务与日历应一致',evidence_block_ids:[id]}],chapters:[],quotes:[],dropped:[]});
  }});
  const store=openJellyStore(home);store.execute({type:'inspiration.create',raw_text:'任务与日历应一致；保留素材来源以便核对。'});const id=store.read().inspirations[0]!.id;store.close();
  const response=await post(base,'/api/jelly/ai?stream=1',{kind:'digest',source_type:'inspiration',source_id:id});
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));const final=events.at(-1);
  assert.equal(final.type,'result');assert.equal(final.result.digest.structured.thesis.text,'核对来源与任务');
  const persisted=openJellyStore(home);try{assert.ok(persisted.read().inspirations[0]!.digest?.snapshot?.blocks.length);}finally{persisted.close();}
});

test('disconnecting a digest aborts model work and never commits a late result',async t=>{
  let started!:()=>void, cancelled!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});const aborted=new Promise<void>(resolve=>{cancelled=resolve;});
  const {base,home}=await fixture(t,{completeText:async(_prompt,options)=>{started();return new Promise<string>((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>{cancelled();reject(new Error('cancelled'));},{once:true});});}});
  const store=openJellyStore(home);store.execute({type:'inspiration.create',raw_text:'这是取消场景的原始材料。'});const before=store.read(),id=before.inspirations[0]!.id;store.close();
  const controller=new AbortController();const pending=post(base,'/api/jelly/ai?stream=1',{kind:'digest',source_type:'inspiration',source_id:id},controller.signal);await began;const response=await pending;
  const body=response.text().catch(()=>null);controller.abort();await aborted;await body;
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
});
