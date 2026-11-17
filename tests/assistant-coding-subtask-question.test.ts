import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult, AssistantSubtaskBinding, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

async function until<T>(read: () => Promise<T | undefined>, label: string): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { const value = await read(); if (value !== undefined) return value; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`Not reached: ${label}`);
}

for (const parked of [false, true]) test(`SAI-02/06/08/10/15: a delegated Work carried by Coding answers its original ${parked ? "parked" : "live"} question once through HTTP`, { timeout: 90_000 }, async t => {
  let delegated = false, coding = false, asked = false;
  const codingBodies: string[] = [];
  const f = await codingProductHost(t, request => {
    const review = endingReviewAnswer(request, () => []);
    if (review) return reply(undefined, review);
    if (!coding) {
      if (!delegated) { delegated = true; return reply({ name: "delegate-work", input: { title: "Confirm duration", brief: "确认时长再交回", acceptance: "明确时长" } }); }
      return reply(undefined, "已完成初次确认。");
    }
    codingBodies.push(JSON.stringify(request.messages));
    if (!asked) { asked = true; return reply({ name: "ask-user", input: { why: "确认时长", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true }] } }); }
    return reply(undefined, "已确认时长为 45 分钟。");
  });
  const project = f.project.project_id;
  const call = async <T>(path: string, body?: unknown) => {
    const result = await f.call<T>(project, "/api/assistant" + path, body);
    assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
  };
  const parent = await call<AssistantSendResult>("/send", { text: "委托确认时长", request_id: "sai-coding-question-parent" });
  const child = await until(async () => (await call<AssistantWorkView>(`/works/${parent.work.work_id}`)).delegated?.[0], "delegated Work");
  const workPath = `/works/${child.work_id}`;
  await until(async () => { const view = await call<AssistantWorkView>(`/works/${parent.work.work_id}`); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "original parent handback");
  const prior = await call<{ binding: AssistantSubtaskBinding }>(workPath + "/subtask");
  const handed = await call<AssistantWorkView>(workPath + "/handover", { to: { kind: "plugin", plugin_id: "io.molis.work.coding" }, mode: "discuss" });
  assert.equal(handed.work.executor.kind, "plugin");
  const stale = await f.call(project, "/api/assistant/send", { work_id: child.work_id, request_id: "sai-old-executor", text: "Must not move", subtask: { binding: prior.binding, operation: "continue" } });
  assert.notEqual(stale.status, 200, "old executor reference is rejected before a new Run");
  coding = true;
  await call<AssistantSendResult>("/send", { work_id: child.work_id, text: "请问清准确时长", request_id: "sai-coding-question-start" });
  await until(async () => (await call<AssistantWorkView>(workPath)).rounds.at(-1)?.awaiting_input.length ? true : undefined, "question before shutdown");
  if (parked) await f.restart();
  const original = await until(async () => { const result = await call<{ view: AssistantWorkView; binding: AssistantSubtaskBinding }>(workPath + "/subtask"); return result.view.rounds.at(-1)?.awaiting_input.length ? result : undefined; }, "executor original question");
  assert.equal(original.binding.executor.kind, "plugin");
  const question = original.view.rounds.at(-1)!.awaiting_input[0]!;
  assert.equal(Boolean(question.parked), parked);
  const input = { request_id: "sai-coding-original-answer", subtask: original.binding, pending_id: question.pending_id, pending_revision: question.pending_revision!, answers: [{ question: 0, value: 45 }] };
  const invalid = await f.call<{ error?: unknown }>(project, "/api/assistant" + workPath + "/answer", { ...input, request_id: "sai-coding-invalid-answer", answers: [{ question: 0, value: 400 }] });
  assert.notEqual(invalid.status, 200);
  assert.equal((await call<AssistantWorkView>(workPath)).rounds.at(-1)!.awaiting_input[0]!.pending_id, question.pending_id);
  let accepted: AssistantWorkView;
  if (parked) {
    const transport = globalThis.fetch;
    let lost = false;
    const drop = t.mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
      const response = await transport(...args);
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (!lost && url.endsWith(workPath + "/answer") && response.ok) {
        await response.arrayBuffer(); lost = true;
        throw new Error("original answer accepted; outer receipt lost");
      }
      return response;
    });
    await assert.rejects(call(workPath + "/answer", input), /outer receipt lost/);
    drop.mock.restore();
    await f.restart();
    assert.equal((await call<{ state: string }>(workPath + "/subtask/requests/" + input.request_id)).state, "applied", "a fresh Host queries the accepted request without answering again");
    accepted = await call<AssistantWorkView>(workPath);
  } else accepted = await call<AssistantWorkView>(workPath + "/answer", input);
  await call(workPath + "/answer", input);
  assert.equal(accepted.work.work_id, child.work_id);
  if (parked) {
    assert.equal(accepted.rounds.length, original.view.rounds.length, "answer-only never starts a replacement Run");
    const queued = accepted.queued_inputs!.find(one => one.key === `answer.${question.pending_id}`)!;
    assert.equal(queued.left_by?.run_id, original.binding.run.run_id);
    const resume = { request_id: "sai-coding-resume-answer", subtask: original.binding, pending_id: question.pending_id, queued_input_id: queued.input_id };
    const competing = await Promise.all([resume, { ...resume, request_id: "sai-coding-resume-answer-other" }]
      .map(body => f.call(project, "/api/assistant" + workPath + "/resume-answer", body)));
    assert.ok(competing.some(one => one.status === 200), JSON.stringify(competing));
    assert.ok(competing.every(one => one.status === 200 || one.status === 409), JSON.stringify(competing));
    await call(workPath + "/resume-answer", resume);
  }
  const after = await until(async () => { const view = await call<AssistantWorkView>(workPath); return view.work.state === "completed" ? view : undefined; }, "Coding original question resumes");
  assert.equal(after.rounds.length, original.view.rounds.length + Number(parked), "only explicit parked continuation adds one Run");
  assert.ok(codingBodies.some(body => body.includes("45")), "the actual executor model request consumed the original answer");
  assert.equal(codingBodies.length, 2, "duplicate answer starts no new model call");
  assert.equal((await call<{ state: string }>(workPath + "/subtask/requests/" + input.request_id)).state, "applied");
  assert.equal((await call<AssistantWorkView>(`/works/${parent.work.work_id}`)).rounds.length, 2, "ended parent remains ended");
});
