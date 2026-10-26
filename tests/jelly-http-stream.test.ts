import assert from "node:assert/strict";
import test from "node:test";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
async function fixture(t: test.TestContext, ports: { completeText?: HostCompleteText } = {}) {
  const served = await serveHomeRuntime(t, { completeText: ports.completeText ?? null });
  return { ...served, post: (path: string, body: unknown, signal?: AbortSignal) => served.request(path, { method: "POST", body, signal: signal ? AbortSignal.any([t.signal, signal]) : t.signal }) };
}

// W5-01-JMC-01: real invoke must evaluate selection without reentering its own availability check.
test('a plan stream reports progress, returns the plan and commits nothing',{timeout:10_000},async t=>{
  const {post,home}=await fixture(t,{completeText:async()=>JSON.stringify({actions:[{title:'核对来源与任务',notes:'逐条核实',minutes:30}],clarification_questions:[]})});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'任务与日历应一致；保留来源以便核对。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const response=await post('/api/plugins/io.molis.work.jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id});
  assert.match(response.headers.get('content-type')!,/ndjson/);
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));const final=events.at(-1);
  assert.equal(events[0].type,'progress',JSON.stringify({status:response.status,headers:Object.fromEntries(response.headers),events}));assert.equal(final.type,'result');assert.equal(final.result.plan.actions[0].title,'核对来源与任务');
  // The removed material entry follows the generic unknown-Home-route refusal, not a Jelly handler.
  const input={file_name:'a.txt',data_base64:'YQ=='};
  const removed=await post('/api/jelly/material?stream=1',input),unknown=await post('/api/no-such-route',input);
  assert.equal(unknown.ok,false);assert.equal(removed.status,unknown.status);assert.deepEqual(await removed.json(),await unknown.json());
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
});

test('disconnecting a plan aborts model work and changes nothing',{timeout:10_000},async t=>{
  let started!:()=>void, cancelled!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});const aborted=new Promise<void>(resolve=>{cancelled=resolve;});
  const {post,home}=await fixture(t,{completeText:async(_prompt,options)=>{started();return new Promise<string>((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>{cancelled();reject(new Error('cancelled'));},{once:true});});}});
  const store=openJellyStore(home);store.execute({type:'note.create',title:'原笔记',markdown:'这是取消场景的原始材料。'});const before=store.read(),id=before.notes[0]!.id;store.close();
  const controller=new AbortController();const response=await post('/api/plugins/io.molis.work.jelly/ai?stream=1',{kind:'decompose',source_type:'note',source_id:id},controller.signal);
  const body=response.text().catch(()=>null);
  await Promise.race([began,body.then(value=>{assert.fail('plan ended before reaching the model: '+value);})]);
  controller.abort();await aborted;await body;
  const persisted=openJellyStore(home);try{assert.deepEqual(persisted.read(),before);}finally{persisted.close();}
});
