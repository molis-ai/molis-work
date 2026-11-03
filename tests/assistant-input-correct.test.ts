import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { signedAgentPackage, newPublisher, PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";
// Stage 3b-2a of specs/ai-input-receipts (§4.6, D34): from the Assistant, a supplement its round has not put in the context
// is taken back, and a correction names the input it corrects; one sent after the round ended waits in the session. The
// runtime's ledger is the only owner of these facts, so this runs the Assistant against the real Prologue runtime.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority, assistantServiceFor, homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";

function reply(text: string): Response {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}
const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test("RCPT-323: the Assistant takes back a supplement its round has not read, and a correction names what it corrects, in the round or waiting for the next", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-correct-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const bodies: string[] = [], held = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: { body?: string | Uint8Array }) => {
    const request = bodies.push(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
    if (request === 1) { asked.resolve(); await held.promise; }
    return reply("好的。");
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-correct-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const service = new AssistantService(new AssistantStore(new DatabaseSync(":memory:")), { pages: async () => ["home"], host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), timeZone: "Asia/Shanghai" }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });

  const started = await service.send({ text: "帮我整理这周的周报", request_id: "request-1", scope: { kind: "personal" } }, {});
  const workId = started.work.work_id, runId = started.run_id!;
  await asked.promise;
  assert.equal((await service.read(workId)).queued_inputs, undefined, "RCPT-336 while its round is live, the work's queue is not read");
  const steerOf = async (text: string) => (await service.read(workId)).rounds.flatMap(round => round.turns).find(turn => turn.text === text)?.steer;
  assert.equal((await service.send({ work_id: workId, text: "不要写具体数字", request_id: "request-2" }, {})).outcome, "steered");
  assert.equal((await service.send({ work_id: workId, text: "顺便列出风险", request_id: "request-3" }, {})).outcome, "steered");
  const dropped = await until(() => steerOf("不要写具体数字"), "the first supplement's receipt"), kept = await until(() => steerOf("顺便列出风险"), "the second");

  await service.control(workId, { kind: "withdraw", run_id: runId, input_id: dropped.id });
  assert.equal((await steerOf("不要写具体数字"))?.state, "withdrawn", "RCPT-323 the round gave it back");
  await assert.rejects(service.control(workId, { kind: "withdraw", run_id: "another-round", input_id: kept.id }), code("assistant.scope"), "RCPT-323 a round of another work is not reachable");
  await assert.rejects(service.control(workId, { kind: "withdraw", run_id: runId, input_id: "" }), code("assistant.invalid"));
  assert.equal((await service.send({ work_id: workId, text: "风险只写前三条", request_id: "request-4", about: kept.id }, {})).outcome, "steered");
  assert.equal((await until(() => steerOf("风险只写前三条"), "the correction's receipt")).about, kept.id, "RCPT-323 the correction's receipt names what it corrects");

  held.resolve();
  await until(async () => (await service.read(workId)).work.state === "completed", "the round's end");
  assert.ok(bodies[0]!.includes("帮我整理这周的周报"), "the kept bodies are the requests as sent");
  assert.ok(bodies.every(body => !body.includes("不要写具体数字")), "RCPT-323 what was taken back never reached the model");
  await assert.rejects(service.control(workId, { kind: "withdraw", run_id: runId, input_id: kept.id }), code("agent.input_applied"), "RCPT-323 one the model read cannot be taken back");

  const late = await service.send({ work_id: workId, text: "风险改成只写一条", request_id: "request-5", about: kept.id }, {});
  assert.equal(late.outcome, "queued", "RCPT-323 a correction after the round ended waits for the next round");
  const session = { runtime_id: adapter.descriptor.runtime_id, session_id: service.reads.workRecord(workId)!.session_id! };
  assert.equal((await service.read(workId)).rounds.length, 1, "RCPT-323 no round starts on its own");
  const waiting = await adapter.readSession(session);
  assert.deepEqual(waiting.queued_inputs?.map(input => [input.text, input.about]), [["风险改成只写一条", kept.id]], "RCPT-323 it waits with the input it is about");
  assert.deepEqual((await service.read(workId)).queued_inputs?.map(input => [input.input_id, input.text, input.about]),
    [[waiting.queued_inputs![0]!.input_id, "风险改成只写一条", kept.id]], "RCPT-336 the work's view carries what waits, as the runtime read it");
  await service.control(workId, { kind: "withdraw", run_id: runId, input_id: waiting.queued_inputs![0]!.input_id });
  assert.deepEqual((await adapter.readSession(session)).queued_inputs, [], "RCPT-323 and it can be taken back from there");
  assert.deepEqual((await service.read(workId)).queued_inputs, [], "RCPT-336 read, and nothing waits");
});

test("RAC-2639/2641/2642 S-105 signed supplements keep an 8000-unit body, reject over-budget JSON and recheck at the final Runtime send", { skip: process.platform !== "darwin", timeout: 90_000 }, async t => {
  const h = await installedPackageHost(), publisher = newPublisher(), body = "中".repeat(7998) + "尾部";
  await h.install(signedAgentPackage(publisher, { bodies: { "agent/role.md": body } }));
  const enteredModel = Promise.withResolvers<void>(), releaseModel = Promise.withResolvers<void>(), enteredSend = Promise.withResolvers<void>(), releaseSend = Promise.withResolvers<void>();
  const requests: string[] = [], queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.signed-supplement-test", appVersion: "1.0.0" }, storageRoot: join(h.home, "test-sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (_url: unknown, init: RequestInit) => {
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)); enteredModel.resolve(); await releaseModel.promise; return reply("检查完成。");
  }));
  const { service } = assistantServiceFor({ localHost: h.host, homeDirectory: h.home, agentHost, agentReady: async () => {}, projectTitle: async () => "正文项目", pages: async () => [] });
  const role = (await service.reads.methods(null, { project_ref: h.reference })).find(item => item.plugin_id === PACKAGE_PLUGIN_ID && item.kind === "role")!;
  const prompt = homeAgentDefinitions(h.home).prompts().find(item => item.default_ref?.entry_id === role.default_ref?.entry_id)!;
  const material = { material_id: "signed", kind: "method" as const, explicit: true, title: "角色资料", method: role };
  const send = adapter.inputs!.send.bind(adapter.inputs!);
  let pause = false;
  t.mock.method(adapter.inputs!, "send", async (...args: Parameters<typeof send>) => {
    if (pause) { enteredSend.resolve(); await releaseSend.promise; } return send(...args);
  });
  try {
    const started = await service.send({ text: "等待补充后审稿", request_id: "signed-running-first" }, { project_ref: h.reference });
    await enteredModel.promise;
    assert.equal((await service.send({ text: "采用完整资料", request_id: "signed-running-valid", work_id: started.work.work_id, materials: [material] }, {})).outcome, "steered");
    const runRef = { session_id: started.work.session_id!, run_id: started.run_id! };
    const accepted = await adapter.read(runRef);
    assert.ok(accepted.turns.some(turn => turn.text?.includes(body)), "the accepted Runtime input contains all 8000 UTF16 units including its tail");
    assert.equal(homeAgentDefinitions(h.home).uses(prompt.key).length, 1);
    await assert.rejects(service.send({ text: "超预算补充", request_id: "signed-running-overflow", work_id: started.work.work_id, materials: [material, { ...material, material_id: "second" }, { ...material, material_id: "third" }] }, {}), /输入预算/);
    assert.equal(homeAgentDefinitions(h.home).uses(prompt.key).length, 1);
    pause = true;
    const pending = service.send({ text: "拒绝迟到补充", request_id: "signed-running-late", work_id: started.work.work_id, materials: [material] }, {});
    const refused = assert.rejects(pending, /来源已失效|没有登记|停用/);
    await Promise.race([enteredSend.promise, pending.then(() => assert.fail("handoff completed before send barrier"), error => { throw error; }), new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error("send barrier not reached")), 10_000); timer.unref(); })]); await h.control("disable", { plugin_id: PACKAGE_PLUGIN_ID }); releaseSend.resolve(); await refused;
    assert.ok(!(await adapter.read(runRef)).turns.some(turn => turn.text?.includes("拒绝迟到补充")));
    assert.equal(homeAgentDefinitions(h.home).uses(prompt.key).length, 1, "only the earlier accepted handoff is kept");
    releaseModel.resolve();
    // The failed new send keeps its draft/hold; the already accepted Runtime round still finishes after source withdrawal.
    await until(async () => (await adapter.read(runRef)).phase === "completed", "accepted Runtime round after source withdrawal");
    assert.ok(requests.some(request => JSON.stringify(JSON.parse(request).messages).includes("尾部")), "the complete accepted supplement reaches Prologue's model boundary");
  } finally { releaseSend.resolve(); releaseModel.resolve(); service.continuations.close(); await adapter.close(); await h.close(); }
});
