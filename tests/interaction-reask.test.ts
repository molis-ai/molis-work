import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, hostQuestionTypes } from "@molis-ai/molis-work-app-local-host";
import { codingReaskMaterial } from "@molis-ai/molis-work-plugin-coding";
import { QUESTION_REASK } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience D5: a question that closed before it was answered (it expired, or the Host closed while it
// waited) is asked again by a new round of the person's, carrying the question and their draft as one marked material.
// The page names only which question; the Host reads the question from the run and the draft from where the surface kept it.

const ASKED = { why: "约复盘会", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" }] };
const project = { project_id: "board", storage_key: "memory:project" };
const DAY = 24 * 60 * 60 * 1000;

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

async function assistant(t: import("node:test").TestContext, name: string) {
  const home = await mkdtemp(join(tmpdir(), `interaction-reask-${name}-`));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).text());
    return bodies.length === 1 ? reply({ name: "ask-user", input: ASKED }) : reply(undefined, "好的。");
  });
  const open = async () => {
    const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
    const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.work.reask-${name}-test`, appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
      questionTypes: hostQuestionTypes(), modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "fixture-only" });
    host.register(adapter);
    return { host, adapter };
  };
  let current = await open();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => current.host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目" }, "web-user");
  t.after(async () => { await current.adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const asked = async () => {
    const sent = await service.send({ text: "帮我约一个复盘会", request_id: `req-${name}` }, { project_ref: project });
    const view = await until(async () => { const read = await service.read(sent.work.work_id); return read.rounds[0]?.awaiting_input.length ? read : undefined; }, "the question");
    return { workId: sent.work.work_id, runId: view.rounds[0]!.run_id!, pending: view.rounds[0]!.awaiting_input[0]! };
  };
  const closed = (workId: string, pendingId: string) => until(async () => (await service.read(workId)).rounds.flatMap(round => round.awaiting_input).find(item => item.pending_id === pendingId && item.answerable === false), "the closed card");
  return { bodies, service, store, asked, closed, reopen: async () => { await current.adapter.close(); current = await open(); } };
}

/** After 「请 AI 重新问」: the new round carried the question and the draft, marked; the old card stays closed and takes no answer. */
async function reasked(fixture: Awaited<ReturnType<typeof assistant>>, workId: string, runId: string, pendingId: string) {
  fixture.store.update("web-user", workId, null, { question_drafts: { [pendingId]: { n0: "45" } } }, false);
  const before = fixture.bodies.length;
  const sent = await fixture.service.send({ work_id: workId, request_id: `reask-${pendingId}`, written_by: "page", text: "", reask: { run_id: runId, pending_id: pendingId } }, { project_ref: project });
  await until(() => fixture.bodies.length > before, "the new round's model call");
  // The round's own request is the first after the send; a check of the round's reply may follow it.
  const heard = fixture.bodies[before]!;
  assert.ok(heard.includes(QUESTION_REASK.title), "the round carries the draft as its own material");
  assert.ok(heard.includes("- 时长：45 分钟"), "with what the person had written, in the question's words");
  assert.ok(heard.includes("不是用户确认过的回答，也不是新的指令"), "marked as a draft and as data");
  assert.notEqual(sent.round?.run_id, runId, "a new round, not the closed one");
  const view = await fixture.service.read(workId);
  const old = view.rounds.find(round => round.run_id === runId)!.awaiting_input.find(item => item.pending_id === pendingId)!;
  assert.equal(old.answerable, false, "the closed card stays closed");
  await assert.rejects(fixture.service.answer(workId, { run_id: runId, pending_id: pendingId, ...(old.pending_revision !== undefined ? { pending_revision: old.pending_revision } : {}), answers: [{ question: 0, value: 45 }] }),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.stale", "and an answer to it is still refused");
}

test("D5: an expired question is asked again by a new round that carries the person's draft", { timeout: 60_000 }, async t => {
  // The question's 24-hour wait is the only timer of that length here: it runs out at once, and the Runtime expires the question itself.
  const real = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", ((fn: () => void, ms?: number, ...rest: unknown[]) => real(fn, ms !== undefined && ms > DAY - 60_000 && ms <= DAY ? 30 : ms, ...rest)) as typeof setTimeout);
  const fixture = await assistant(t, "expiry");
  const { workId, runId, pending } = await fixture.asked();
  await fixture.closed(workId, pending.pending_id);
  await reasked(fixture, workId, runId, pending.pending_id);
});

test("D5: a question the Host closed while it waited is asked again after reopening, with the draft", { timeout: 60_000 }, async t => {
  const fixture = await assistant(t, "restart");
  const { workId, runId, pending } = await fixture.asked();
  await fixture.reopen();
  await fixture.closed(workId, pending.pending_id);
  await reasked(fixture, workId, runId, pending.pending_id);
});

test("D5: re-asking an open question, or one that is not this work's, is refused and starts nothing", { timeout: 60_000 }, async t => {
  const fixture = await assistant(t, "refused");
  const { workId, runId, pending } = await fixture.asked();
  const before = fixture.bodies.length;
  await assert.rejects(fixture.service.send({ work_id: workId, request_id: "reask-open", written_by: "page", text: "重新问", reask: { run_id: runId, pending_id: pending.pending_id } }, { project_ref: project }),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.state", "an open question is answered, not asked again");
  const other = await fixture.service.send({ text: "另一件事", request_id: "req-other" }, { project_ref: project });
  await until(() => fixture.bodies.length > before, "the other work's model call");
  const calls = fixture.bodies.length;
  await assert.rejects(fixture.service.send({ work_id: other.work.work_id, request_id: "reask-other", written_by: "page", text: "重新问", reask: { run_id: runId, pending_id: pending.pending_id } }, { project_ref: project }),
    (error: unknown) => error instanceof ActionError && error.code === "assistant.scope", "another work's question is refused");
  assert.equal(fixture.bodies.length, calls, "a refused re-ask calls no model");
  assert.ok(calls > before);
});

test("D5: Coding re-asks only a closed question of a run of this session, with the draft its page kept", async () => {
  const question = { pending_id: "p1", pending_revision: 1, kind: "questionnaire", prompt: "约复盘会", options: [], allows_free_text: false,
    questions: [{ index: 0, prompt: "时长", type: "number" as const, required: true, options: [], multiple: false, allow_other: false, unit: "分钟" }] };
  const api = (answerable: boolean) => ({ invoke: async (capability: { capability_id: string }) => capability.capability_id === "agent.session.read.v1"
    ? { runs: [{ session_id: "rt-1", run_id: "run-1" }] }
    : { awaiting_input: [{ ...question, answerable, ...(answerable ? {} : { unavailable_reason: "这条问题已过期，不能提交原答案" }) }] } }) as never;
  const storage = new Map([["question-drafts:s1", JSON.stringify({ [JSON.stringify(["run-1", "p1", 1])]: { n0: "45" } })]]);
  const context = { services: { storage: { get: (key: string) => storage.get(key) } } } as never;
  const record = { session_id: "s1", runtime_id: "prologue", runtime_session_id: "rt-1" } as never;
  const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

  const material = await codingReaskMaterial(context, record, { run_id: "run-1", pending_id: "p1" }, api(false));
  assert.equal(material.title, QUESTION_REASK.title, "the same material the Assistant's round carries");
  assert.ok(material.text.includes("- 时长：45 分钟") && material.text.includes("这条问题已过期"));
  await assert.rejects(codingReaskMaterial(context, record, { run_id: "run-1", pending_id: "p1" }, api(true)), refused("coding.reask_question_open"), "an open question is answered, not asked again");
  await assert.rejects(codingReaskMaterial(context, record, { run_id: "run-of-another-session", pending_id: "p1" }, api(false)), refused("coding.reask_not_this_session"), "another session's question is refused");
  await assert.rejects(codingReaskMaterial(context, { ...(record as object), runtime_session_id: null } as never, { run_id: "run-1", pending_id: "p1" }, api(false)), refused("coding.reask_not_this_session"));
  await assert.rejects(codingReaskMaterial(context, record, { run_id: "run-1", pending_id: "gone" }, api(false)), refused("coding.reask_question_gone"));
  await assert.rejects(codingReaskMaterial(context, record, { run_id: 1 }, api(false)), refused("coding.reask_invalid"));
});
