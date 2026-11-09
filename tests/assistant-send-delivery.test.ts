// specs/unified-input-voice/implementation-plan.md K0b (UIC-03, UIC-12), UIV-17: the Assistant's Send carries how a supplement
// reaches the round under way — 补充 (next-boundary, the default), 打断并改向 (interrupt), 下一轮再做 (after-run). The choice
// reaches the runtime as it was made; it is refused where it means nothing, and never turned into another kind of send:
// interrupt and after-run never start a round. A round that has ended keeps them for the next one and says so (`queued`),
// as the runtime does when it ends while they are on their way (specs/ai-input-receipts §4.1, implementation-plan §2).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, MolisWorkLocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import type { AgentInputSend } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { serveTestHost } from "./fixtures/test-home.js";

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
// Send ids are 8 to 80 letters, digits and hyphens.
const id = (name: string) => `${name}-${randomUUID()}`;
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test("UIC-03 UIC-12 UIV-17: delivery reaches the round as chosen, is refused where it means nothing, and never starts a round", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delivery-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const held = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++requests === 1) { asked.resolve(); await held.promise; }
    return reply("好的。");
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-delivery-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const sent: AgentInputSend[] = [], send = adapter.inputs!.send.bind(adapter.inputs!);
  t.mock.method(adapter.inputs!, "send", async (...args: Parameters<typeof send>) => { sent.push(args[1]); return send(...args); });
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), timeZone: "Asia/Shanghai" }, "web-user");
  t.after(async () => { held.resolve(); service.continuations.close(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });

  // UIC-12: refused before anything is written — a new work, an answer, a value nobody knows.
  await assert.rejects(service.send({ text: "新工作", request_id: id("new"), scope: { kind: "personal" }, delivery: "interrupt" }, {}), code("assistant.invalid"), "UIC-12 a new work takes no delivery");
  assert.equal((await service.list()).length, 0, "UIC-12 nothing was created");

  const started = await service.send({ text: "帮我整理这周的周报", request_id: id("start"), scope: { kind: "personal" } }, {});
  const workId = started.work.work_id;
  // B10-R3: status reads are actor scoped and do not claim or replay a request.
  const pendingId = id("pending-check");
  assert.deepEqual(store.requests.read("web-user", pendingId), { state: "not-sent" });
  store.requests.claimRequest("web-user", pendingId);
  assert.deepEqual(store.requests.read("web-user", pendingId), { state: "unknown" });
  assert.deepEqual(store.requests.read("another-user", pendingId), { state: "not-sent" });
  store.requests.finishRequest("web-user", pendingId, started);
  assert.deepEqual(store.requests.read("web-user", pendingId), { state: "sent", result: started });

  await asked.promise;
  await assert.rejects(service.send({ work_id: workId, text: "回答", request_id: id("answer"), target: "answer", delivery: "next-boundary" }, {}), code("assistant.invalid"), "UIC-12 an answer takes no delivery");
  // An HTTP body is not typed: a value outside the three is refused, not taken as the default.
  const unknownValue = JSON.parse('{"delivery":"now"}') as { delivery: "interrupt" };
  await assert.rejects(service.send({ work_id: workId, text: "现在", request_id: id("unknown"), ...unknownValue }, {}), code("assistant.invalid"), "UIC-12 an unknown value is refused");
  assert.equal(sent.length, 0, "UIC-12 nothing reached the round");

  // UIC-03: each choice reaches the runtime as made; absent stays 补充.
  assert.equal((await service.send({ work_id: workId, text: "顺便列出风险", request_id: id("plain") }, {})).outcome, "steered");
  assert.equal((await service.send({ work_id: workId, text: "做完再加一页总结", request_id: id("later"), delivery: "after-run" }, {})).outcome, "queued", "UIV-17 下一轮再做 waits in the session");
  assert.equal((await service.send({ work_id: workId, text: "改成按项目分组", request_id: id("now"), delivery: "interrupt" }, {})).outcome, "steered");
  assert.deepEqual(sent.map(input => [input.text, input.mode]), [["顺便列出风险", undefined], ["做完再加一页总结", "after-run"], ["改成按项目分组", "interrupt"]], "UIC-03 the mode reaches the runtime as chosen");

  held.resolve();
  await until(async () => (await service.read(workId)).work.state === "completed", "the round's end");
  const rounds = (await service.read(workId)).rounds.length;
  assert.ok((await service.read(workId)).queued_inputs?.some(input => input.text === "做完再加一页总结"), "UIV-17 下一轮再做 still waits; no round started on its own");

  // UIV-17: a round that has ended still takes them, for the next round the person starts; neither starts one.
  assert.equal((await service.send({ work_id: workId, text: "打断它", request_id: id("late-interrupt"), delivery: "interrupt" }, {})).outcome, "queued", "UIV-17 the round just ended: kept for the next round");
  assert.equal((await service.send({ work_id: workId, text: "排到下一轮", request_id: id("late-after"), delivery: "after-run" }, {})).outcome, "queued", "UIV-17 下一轮再做 after the round ended still waits");
  assert.equal((await service.read(workId)).rounds.length, rounds, "UIV-17 no round was started for them");
  assert.deepEqual(sent.slice(3).map(input => [input.text, input.mode]), [["打断它", "interrupt"], ["排到下一轮", "after-run"]], "UIC-03 the mode reaches the runtime as chosen");
  const waiting = (await service.read(workId)).queued_inputs?.map(input => input.text) ?? [];
  assert.ok(["做完再加一页总结", "打断它", "排到下一轮"].every(text => waiting.includes(text)), `UIV-17 all three wait for the next round: ${JSON.stringify(waiting)}`);
  assert.equal((await service.send({ work_id: workId, text: "开始下一轮", request_id: id("next"), delivery: "next-boundary" }, {})).outcome, "started", "补充 with nothing under way starts the next round, as with no delivery");

  // UIV-17: a work that never had a round has nothing to interrupt or wait behind; refused before anything is written —
  // no session, no input hold, no link to the material it carried.
  const empty = store.create({ actor_id: "web-user", title: "还没开始", scope: { kind: "personal" }, origin: null });
  const note = { material_id: "m1", kind: "object" as const, title: "背景", explicit: true, object: { kind: "note", id: "bg", version: 4 }, text: "背景" };
  for (const delivery of ["interrupt", "after-run"] as const) {
    await assert.rejects(service.send({ work_id: empty.work_id, text: "先别做", request_id: id(`empty-${delivery}`), delivery, materials: [note] }, {}), code("assistant.state"), `UIV-17 ${delivery} with no round is refused`);
  }
  const untouched = store.get("web-user", empty.work_id);
  assert.equal(untouched.session_id, null, "UIV-17 no session was opened for them");
  assert.equal(untouched.continuation_hold, undefined, "UIV-17 no input hold was written");
  assert.deepEqual(store.relations.forWork({ work_id: empty.work_id, project_id: null }), [], "UIV-17 no material link was written");
});

test("UIC-12 UIV-17: the HTTP Send refuses delivery on a new work, with an answer, or with a value it does not know, before anything is written", { timeout: 60_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-delivery-http-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const server = await serveTestHost(null, { home, host });
  t.after(async () => { await server.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  const send = (body: object) => fetch(server.origin + "/api/assistant/send", { method: "POST", body: JSON.stringify({ request_id: randomUUID(), text: "改成按项目分组", ...body }),
    headers: { origin: server.origin, "content-type": "application/json", "x-molis-work-control-token": server.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
  const refused = async (body: object) => {
    const response = await send(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json() as { code?: string }).code, "assistant.invalid", JSON.stringify(body));
  };
  await t.test("UIC-12 a new work takes no delivery", () => refused({ scope: { kind: "personal" }, delivery: "interrupt" }));
  await t.test("UIC-12 an answer takes no delivery", () => refused({ work_id: "w1", target: "answer", delivery: "next-boundary" }));
  await t.test("UIC-12 a value outside the three is refused, not taken as the default", async () => {
    for (const delivery of ["now", "", null, 1]) await refused({ work_id: "w1", delivery });
  });
  const works = await fetch(server.origin + "/api/assistant/works", { headers: { origin: server.origin } });
  assert.deepEqual((await works.json() as { works: unknown[] }).works, [], "UIC-12 no work was made");
});
