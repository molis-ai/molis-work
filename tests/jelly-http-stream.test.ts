import assert from "node:assert/strict";
import test from "node:test";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
async function fixture(t: test.TestContext, ports: { completeText?: HostCompleteText } = {}) {
  const served = await serveHomeRuntime(t, { completeText: ports.completeText ?? null });
  return { ...served, post: (path: string, body: unknown, signal?: AbortSignal) => served.request(path, { method: "POST", body, signal }) };
}

test('a plan stream reports progress, returns the plan and commits nothing',async t=>{
  const {post,home}=await fixture(t,{completeText:async()=>JSON.stringify({actions:[{title:'核对来源与任务',notes:'逐条核实',minutes:30}],clarification_questions:[]})});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'任务与日历应一致；保留来源以便核对。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const response=await post('/api/plugins/io.molis.work.jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id});
  assert.match(response.headers.get('content-type')!,/ndjson/);
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));const final=events.at(-1);
  assert.equal(events[0].type,'progress');assert.equal(final.type,'result');assert.equal(final.result.plan.actions[0].title,'核对来源与任务');
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
  // Only planning streams: the routes that read files and pages now belong to 灵光.
  assert.equal((await post('/api/jelly/material?stream=1',{file_name:'a.txt',data_base64:'YQ=='})).status,404);
});

test('disconnecting a plan aborts model work and changes nothing',async t=>{
  let started!:()=>void, cancelled!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});const aborted=new Promise<void>(resolve=>{cancelled=resolve;});
  const {post,home}=await fixture(t,{completeText:async(_prompt,options)=>{started();return new Promise<string>((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>{cancelled();reject(new Error('cancelled'));},{once:true});});}});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'这是取消场景的原始材料。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const controller=new AbortController();const pending=post('/api/plugins/io.molis.work.jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id},controller.signal);await began;const response=await pending;
  const body=response.text().catch(()=>null);controller.abort();await aborted;await body;
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
});
