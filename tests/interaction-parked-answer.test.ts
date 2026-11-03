import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, hostQuestionTypes, runWithLocale } from "@molis-ai/molis-work-app-local-host";

// specs/ai-interaction-experience AC-07 (§15.9, BL-156): a question the Assistant asked survives a restart. The round is parked
// on it, the card takes the answer, and the next round carries it. A next round that cannot start leaves the answer queued
// and says why; the person's next Send (「继续」) starts it. A session still being recovered is read once and tried once more.

const ASKED = { why: "约复盘会", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" }] };
const project = { project_id: "board", storage_key: "memory:project" };

function reply(tool?: { name: string; input: unknown }, text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}
async function until<T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

/** A work whose round asked, then a restart: the Host and its runtime are opened again on the same storage. */
async function parkedWork(t: TestContext, name: string) {
  const home = await mkdtemp(join(tmpdir(), `interaction-parked-${name}-`));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).text());
    return bodies.length === 1 ? reply({ name: "ask-user", input: ASKED }) : reply(undefined, "好的，按 45 分钟约。");
  });
  const open = async () => {
    const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
    const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.work.parked-${name}-test`, appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
      questionTypes: hostQuestionTypes(), modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "fixture-only" });
    host.register(adapter);
    return { host, adapter };
  };
  let current = await open();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => current.host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目" }, "web-user");
  t.after(async () => { service.continuations.close(); await current.adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const sent = await service.send({ text: "帮我约一个复盘会", request_id: randomUUID() }, { project_ref: project });
  const workId = sent.work.work_id;
  const asked = await until(async () => { const read = await service.read(workId); return read.rounds[0]?.awaiting_input.length ? read : undefined; }, "the question");
  const runId = asked.rounds[0]!.run_id!, pendingId = asked.rounds[0]!.awaiting_input[0]!.pending_id;
  await current.adapter.close(); current = await open();
  const answer = () => service.outcomes.answer(workId, { run_id: runId, pending_id: pendingId, pending_revision: asked.rounds[0]!.awaiting_input[0]!.pending_revision!, answers: [{ question: 0, value: 45 }] },
    { project_ref: project });
  return { bodies, service, workId, runId, pendingId, answer, current: () => current };
}

/** The request of the round after the answer: the Host's words, and the answer from the session's queue. */
function carriesTheAnswer(body: string) {
  assert.ok(body.includes("我回答了你在服务重启前问我的那个问题"), "the round says what it goes on from");
  assert.match(body, /answered-after-interruption/, "the parked round's question is marked answered after the interruption");
  assert.match(body, /\\"value\\":45|"value":45/, "and the answer itself is in the request");
}

test("AC-07 a question asked before a restart is answered on its card after it, and the next round carries the answer", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "answer");
  const before = await fixture.service.read(fixture.workId);
  const card = before.rounds.flatMap(round => round.awaiting_input).find(item => item.pending_id === fixture.pendingId);
  assert.equal(card?.answerable, true, "after the restart the card can be answered");
  assert.equal(card?.parked, true);
  assert.equal(before.problem?.action, "回答上面的问题", "the work asks for the answer, not for a check");
  const recovery = (await fixture.service.recovery(fixture.workId)).rounds.find(round => round.run_id === fixture.runId);
  assert.equal(recovery?.can_close, true, "and it could be closed instead");
  const calls = fixture.bodies.length;
  const view = await fixture.answer();
  assert.equal(view.problem, undefined);
  await until(() => fixture.bodies.length > calls, "the next round's model call");
  carriesTheAnswer(fixture.bodies[calls]!);
  await until(async () => (await fixture.service.read(fixture.workId)).work.state === "completed", "the next round's end");
  assert.equal((await fixture.service.read(fixture.workId)).rounds.length, 2, "one new round, after the parked one");
});

test("AC-07 a next round that cannot start leaves the answer queued and says why; 「继续」 starts it with the answer", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "refused");
  const host = fixture.current().host, start = host.start.bind(host);
  let refuse = true;
  t.mock.method(host, "start", async (...args: Parameters<typeof host.start>) => { if (refuse) throw new Error("模型服务暂时不可用"); return start(...args); });
  const calls = fixture.bodies.length;
  const view = await fixture.answer();
  assert.equal(view.problem?.message, "已回答，下一轮没能开始：模型服务暂时不可用", "the answer was taken; the round was not");
  assert.equal(fixture.bodies.length, calls, "no model call was made");
  assert.ok(view.queued_inputs?.some(input => input.key === `answer.${fixture.pendingId}`), "the answer waits in the session, keyed by its question");
  assert.equal((await fixture.service.read(fixture.workId)).problem?.message, "已回答，下一轮还没开始；回答留在排队里", "read again, the work still says so");
  refuse = false;
  await fixture.service.send({ work_id: fixture.workId, request_id: randomUUID(), text: "继续" }, { project_ref: project });
  await until(() => fixture.bodies.length > calls, "the round the person started");
  assert.match(fixture.bodies[calls]!, /\\"value\\":45|"value":45/, "it carries the queued answer");
});

test("AC-10, QA-001: on an English page the reason a next round could not start after the answer is English throughout", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "refused-en");
  t.mock.method(fixture.current().host, "start", async () => { throw new ActionError("agent.model_not_configured", "fixture: no model"); });
  const view = await runWithLocale("en", () => fixture.answer());
  assert.equal(view.problem?.message, "Answered, but the next round couldn't start: No usable model is configured yet, so the assistant can't start");
  assert.doesNotMatch(view.problem?.message ?? "", /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/, "no Chinese word or punctuation left");
  assert.equal(view.problem?.action, "说“继续”接着做", "the action stays the key the page translates");
});

test("AC-07 a session still being recovered is read once and the next round tried once more, never in a loop", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "busy");
  const { host, adapter } = fixture.current(), start = host.start.bind(host), inspect = adapter.recovery!.inspect.bind(adapter.recovery);
  // What the adapter makes of the SDK's SESSION_RECOVERY_BUSY (agent-control-errors covers the mapping).
  // BL305-BUSY-03: the current Agent conflict still takes the same code-based read/one-retry path.
  const busy = () => new ActionError("agent.session_busy", "这个会话正在恢复，请稍后再试", { kind: "conflict" });
  let busyTimes = 1, starts = 0, inspected = 0;
  t.mock.method(host, "start", async (...args: Parameters<typeof host.start>) => { starts++; if (busyTimes-- > 0) throw busy(); return start(...args); });
  t.mock.method(adapter.recovery!, "inspect", async (...args: Parameters<typeof inspect>) => { inspected++; return inspect(...args); });
  const calls = fixture.bodies.length;
  assert.equal((await fixture.answer()).problem, undefined);
  assert.deepEqual({ starts, inspected }, { starts: 2, inspected: 1 }, "busy once: one look, one more start");
  await until(() => fixture.bodies.length > calls, "the next round's model call");
  carriesTheAnswer(fixture.bodies[calls]!);
});

test("AC-07 busy twice, the answer stays queued: one look and one more start, then the reason", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "busy-twice");
  const { host, adapter } = fixture.current(), inspect = adapter.recovery!.inspect.bind(adapter.recovery);
  let starts = 0, inspected = 0;
  t.mock.method(host, "start", async () => { starts++; throw new ActionError("agent.session_busy", "这个会话正在恢复，请稍后再试"); });
  t.mock.method(adapter.recovery!, "inspect", async (...args: Parameters<typeof inspect>) => { inspected++; return inspect(...args); });
  const view = await fixture.answer();
  assert.deepEqual({ starts, inspected }, { starts: 2, inspected: 1 });
  assert.match(view.problem?.message ?? "", /^已回答，下一轮没能开始：/);
  assert.ok(view.queued_inputs?.some(input => input.key === `answer.${fixture.pendingId}`));
});

test("AC-08 after a restart, two answers to the same parked question at once: one is taken, the other refused, the model hears it once", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "twice");
  const calls = fixture.bodies.length;
  const [one, two] = await Promise.allSettled([fixture.answer(), fixture.answer()]);
  const taken = [one, two].filter(result => result.status === "fulfilled"), refused = [one, two].filter(result => result.status === "rejected");
  assert.equal(taken.length, 1, "one answer is taken");
  assert.match(String((refused[0] as PromiseRejectedResult | undefined)?.reason?.code), /^agent\.(pending_not_open|session_busy)$/, "the other is refused as no longer open, or as the session being recovered");
  await until(async () => (await fixture.service.read(fixture.workId)).work.state === "completed", "the next round's end");
  const after = fixture.bodies.slice(calls);
  assert.equal(after.filter(body => /answered-after-interruption/.test(body)).length >= 1, true);
  assert.equal((await fixture.service.read(fixture.workId)).rounds.length, 2, "one next round, not two");
});

test("AC-07 a new message while the round is parked on its question starts nothing and says to answer first; the question still takes its answer", { timeout: 60_000 }, async t => {
  const fixture = await parkedWork(t, "message");
  const calls = fixture.bodies.length;
  const sent = await fixture.service.send({ work_id: fixture.workId, request_id: randomUUID(), text: "顺便把议程也列一下" }, { project_ref: project }).then(view => ({ view }), error => ({ error }));
  assert.equal(fixture.bodies.length, calls, "no model call was made");
  const refused = (sent as { error?: { code?: string; details?: { action?: string; work?: { draft?: string } } } }).error;
  assert.equal(refused?.code, "assistant.needs_check");
  assert.equal(refused?.details?.action, "回答上面的问题", "the person is told to answer the question, not to check the round");
  assert.equal(refused?.details?.work?.draft, "顺便把议程也列一下", "what they wrote stays as the draft");
  assert.equal((await fixture.answer()).problem, undefined, "the parked question is still answered on its card");
  await until(() => fixture.bodies.length > calls, "the next round's model call");
  carriesTheAnswer(fixture.bodies[calls]!);
});
