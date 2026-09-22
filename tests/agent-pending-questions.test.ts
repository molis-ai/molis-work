import assert from "node:assert/strict";
import test from "node:test";

import {
  PrologueAgentAdapter,
  type PrologueEvent,
  type PrologueRuntimePort,
} from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest, AgentRunRef, AgentRunControl } from "@molis-ai/molis-work-contracts/services/agent-host";

/** 提问要能走到界面，回答要能关掉它——否则 Run 卡住而用户无路可走。 */

function runtimeDouble() {
  const listeners = new Set<(event: PrologueEvent) => void>();
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => ({ ref: { id: "session-1" } }) },
    async startAgentRun() {
      return {
        run: {
          ref: { id: "run-1" },
          subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
          async cancel() {},
        },
        control: {
          state: "running",
          stop() {}, pause() {}, resume() {}, steer() {},
          subscribe() { return () => {}; },
        },
      };
    },
    async shutdown() { return {}; },
  };
  return { runtime, emit: (event: PrologueEvent) => { for (const l of listeners) l(event); } };
}

function startRequest(): AgentStartRequest {
  return {
    plugin_id: "io.molis.work.coding",
    session: { session_id: "session-1", runtime_id: "prologue" },
    task: "看看这段代码",
    role_id: "reader",
    directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    role: {
      role_id: "reader", version: 1, execution: "read-only",
      prompts: [{ prompt_id: "p", version: 1, body: "b" }], host_tools: [],
    },
  } as AgentStartRequest;
}

async function adapterFor(answerPending?: (run: AgentRunRef, answer: Extract<AgentRunControl, { kind: "answer" }>) => Promise<void>, readPendingQuestion?: PrologueRuntimePort["readPendingQuestion"]) {
  const double = runtimeDouble();
  const adapter = new PrologueAgentAdapter({
    runtime: { ...double.runtime, ...(readPendingQuestion ? {readPendingQuestion} : {}) },
    modelConfiguration: async () => ({
      protocol: "anthropic-messages", endpoint: "https://x.test",
      model: "m", credential_ref: "c",
    }),
    ...(answerPending === undefined ? {} : { answerPending }),
  });
  await adapter.createSession({ title: "t" });
  const handle = await adapter.start(startRequest());
  return { adapter, emit: double.emit, ref: handle.ref };
}

const question: PrologueEvent = {
  type: "awaiting-input",
  pendingRef: { id: "q1" },
  kind: "text",
  why: "连接失败时应该重试三次还是立刻报错？",
};

test("Run 停下来问问题时，问题内容真的出现在视图里", async () => {
  const item = await adapterFor(async () => {});
  item.emit(question);
  const view = await item.adapter.read(item.ref);

  assert.equal(view.phase, "awaiting-input");
  assert.equal(view.awaiting_input.length, 1, "光有 phase 不够，得看得到问的是什么");
  assert.equal(view.awaiting_input[0]?.pending_id, "q1");
  assert.equal(view.awaiting_input[0]?.prompt, "连接失败时应该重试三次还是立刻报错？");
  // Prologue 的事件不带选项，就不能编出选项来
  assert.deepEqual(view.awaiting_input[0]?.options, []);
  assert.equal(view.awaiting_input[0]?.allows_free_text, true);
});

test("回答之后问题从视图里消失", async () => {
  const answered: Array<[string, string]> = [];
  const item = await adapterFor(async (_run, answer) => { answered.push([answer.pending_id, answer.text!]); });
  item.emit(question);
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1);

  await item.adapter.control(item.ref, { kind: "answer", pending_id: "q1", text: "重试三次" });
  assert.deepEqual(answered, [["q1", "重试三次"]]);
  assert.deepEqual((await item.adapter.read(item.ref)).awaiting_input, []);
});

test("没接回答通道时如实报不可用，而不是悄悄吞掉回答", async () => {
  const item = await adapterFor();
  item.emit(question);
  await assert.rejects(
    () => item.adapter.control(item.ref, { kind: "answer", pending_id: "q1", text: "重试三次" }),
    (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
  );
  // 问题还在，因为它确实没被回答
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1);
});

test("回答和 steer 是两回事：steer 不会关掉问题", async () => {
  const item = await adapterFor(async () => {});
  item.emit(question);
  await item.adapter.control(item.ref, { kind: "steer", text: "顺便看看日志" });
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1,
    "追加指令不等于回答了那条问题");
});

test("精确问题版本与归属不匹配时不交给执行者，成功答案只接受一次", async () => {
  let calls=0;
  const item=await adapterFor(async (run,answer)=>{assert.equal(run.run_id,item.ref.run_id);assert.equal(answer.pending_revision,3);calls++;});
  item.emit({...question,pendingRef:{id:'q1',revision:3}});
  for(const control of [
    {kind:'answer' as const,pending_id:'other',pending_revision:3,text:'错误问题'},
    {kind:'answer' as const,pending_id:'q1',pending_revision:2,text:'旧版本'},
  ]) await assert.rejects(()=>item.adapter.control(item.ref,control),error=>(error as {code:string}).code==='agent.pending_not_open');
  assert.equal(calls,0);
  const answer={kind:'answer' as const,pending_id:'q1',pending_revision:3,text:'原问题答案'};
  await item.adapter.control(item.ref,answer);
  await assert.rejects(()=>item.adapter.control(item.ref,answer));
  assert.equal(calls,1);
});

test("执行者拒绝答案时保留原问题，不把发送动作投影为已回答",async()=>{
  const item=await adapterFor(async()=>{throw new Error('原问题已过期');});
  item.emit({...question,pendingRef:{id:'q1',revision:1}});
  await assert.rejects(()=>item.adapter.control(item.ref,{kind:'answer',pending_id:'q1',pending_revision:1,text:'回答'}),/已过期/);
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length,1);
});


test("暂时读不到原问卷时不伪造自由输入，重试恢复冻结题目", async () => {
  let readable = false;
  const item = await adapterFor(async () => {}, async (run, id, revision) => {
    assert.equal(run.run_id, "run-1"); assert.equal(id, "q1"); assert.equal(revision, 3);
    if (!readable) throw new Error("原问题暂时不可读");
    return { pending_id:id, pending_revision:revision, kind:"questionnaire", prompt:"原题", options:[], allows_free_text:false, answerable:true,
      questions:[{index:2,prompt:"选择范围",options:[{index:7,label:"精确选项"}],multiple:true,allow_other:true}] };
  });
  item.emit({...question,kind:"questionnaire",pendingRef:{id:"q1",revision:3}});
  const unavailable = (await item.adapter.read(item.ref)).awaiting_input[0]!;
  assert.equal(unavailable.answerable,false);assert.equal(unavailable.allows_free_text,false);assert.equal(unavailable.questions,undefined);
  readable = true;
  const restored = (await item.adapter.read(item.ref)).awaiting_input[0]!;
  assert.equal(restored.answerable,true);assert.deepEqual(restored.questions?.[0]?.options,[{index:7,label:"精确选项"}]);
});


test("重放仍有等待事件时，原问题已结算就不再显示空白待答表单", async () => {
  const item = await adapterFor(async () => {}, async () => null);
  item.emit({...question,pendingRef:{id:"q1",revision:1}});
  item.emit({type:"completed"});
  const view = await item.adapter.read(item.ref);
  assert.equal(view.phase,"completed");assert.deepEqual(view.awaiting_input,[]);
});
