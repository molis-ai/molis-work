// Stage 3b-1 of specs/ai-input-receipts (§4.3, §4.6, D34): a supplement the model has not seen can be taken back, from the
// round or from the session's queue; one already in the context cannot; a correction names the input it is about. The
// runtime's ledger is the only owner of all three facts, so these run against the real Prologue runtime.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunRef, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";

const until = async <T>(read: () => T | Promise<T>, what: string): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`not reached: ${what}`);
};
const steerOf = (turns: AgentTurnView[], text: string) => turns.find(turn => turn.text === text)?.steer;
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

function sse(content: { tool?: { name: string; input: unknown }; text?: string }, round: number): Response {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: `m-${round}`, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: content.tool ? { type: "tool_use", id: `call-${round}`, name: content.tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: content.tool ? { type: "input_json_delta", partial_json: JSON.stringify(content.tool.input) } : { type: "text_delta", text: content.text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: content.tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/** A real runtime whose provider is scripted: each request can be held until the test lets it answer, and every body is kept. */
async function runtime(t: test.TestContext, reply: (request: number) => { tool?: { name: string; input: unknown }; text?: string }) {
  const root = await mkdtemp(join(tmpdir(), "molis-input-withdraw-"));
  const bodies: string[] = [], gates: Array<PromiseWithResolvers<void>> = [];
  const gate = (request: number) => (gates[request] ??= Promise.withResolvers<void>());
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: { body?: string | Uint8Array }) => {
    const request = bodies.push(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array));
    await gate(request).promise;
    return sse(reply(request), request);
  });
  const open = () => createPrologueNodeAdapter({ app: { appId: "molis.input-withdraw.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "test" }), resolveCredential: () => "test-only" });
  let adapter = await open();
  t.after(async () => { await adapter.close?.(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "board", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "user" }, directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "withdraw" });
  const start = (task: string) => adapter.start({ ...owner, directory, session, task, role_id: "reader", queued: "carry",
    role: { role_id: "reader", version: 1, execution: "read-only", prompts: [], host_tools: ["read-file"] } });
  const ended = (ref: AgentRunRef) => until(async () => { const view = await adapter.read(ref); return ["completed", "failed", "cancelled"].includes(view.phase) ? view : undefined; }, "the round's end");
  return { get adapter() { return adapter; }, session, start, ended, bodies, reopen: async () => { await adapter.close(); adapter = await open(); }, release: (request: number) => gate(request).resolve(), asked: (request: number) => until(() => bodies.length >= request, `model request ${request}`) };
}

test("RCPT-311/312/314: a round gives back a supplement it has not put in the context, refuses one it has, and a correction names what it corrects", { timeout: 60_000 }, async t => {
  const item = await runtime(t, request => request === 1 ? { tool: { name: "read", input: { path: "a.ts" } } } : { text: "完成。" });
  const handle = await item.start("看看 a.ts");
  await item.asked(1);
  const dropped = await item.adapter.inputs!.send(handle.ref, { text: "不要改测试", key: "send.w1" });
  const kept = await item.adapter.inputs!.send(handle.ref, { text: "顺便看日志", key: "send.w2" });
  assert.deepEqual(await item.adapter.inputs!.withdraw!(handle.ref, dropped.input_id), { input_id: dropped.input_id, from: "run" }, "RCPT-311 not yet in the context: the round gives it back");
  assert.deepEqual(await item.adapter.inputs!.withdraw!(handle.ref, dropped.input_id), { input_id: dropped.input_id, from: "run" }, "RCPT-311 taking it back again answers the same");
  const beforeCorrection = Date.now();
  const correction = await item.adapter.inputs!.send(handle.ref, { text: "日志只看错误级别", key: "send.w3", about: kept.input_id });
  assert.ok(await until(async () => steerOf((await item.adapter.read(handle.ref)).turns, "不要改测试")?.state === "withdrawn", "RCPT-311 the receipt says it was taken back"));

  item.release(1);
  await item.asked(2);
  const applied = await until(async () => steerOf((await item.adapter.read(handle.ref)).turns, "顺便看日志")?.state === "applied", "the supplement in the context");
  assert.ok(applied);
  await assert.rejects(item.adapter.inputs!.withdraw!(handle.ref, kept.input_id), code("agent.input_applied"), "RCPT-312 once in the context it cannot be taken back");
  item.release(2);

  const view = await item.ended(handle.ref);
  assert.equal(view.phase, "completed");
  assert.equal(steerOf(view.turns, "不要改测试")?.state, "withdrawn");
  assert.equal(steerOf(view.turns, "顺便看日志")?.state, "read", "RCPT-312 the refused withdrawal changed nothing");
  const corrected = steerOf(view.turns, "日志只看错误级别");
  assert.ok(corrected);
  assert.ok(corrected.accepted_at_ms! >= beforeCorrection && corrected.accepted_at_ms! <= Date.now());
  assert.deepEqual(corrected, { id: correction.input_id, state: "read", key: "send.w3", about: kept.input_id, source: "person", accepted_at_ms: corrected.accepted_at_ms }, "RCPT-314 the correction's receipt names the input it is about");
  assert.ok(item.bodies[0]!.includes("看看 a.ts"), "the kept bodies are the requests as sent");
  assert.ok(item.bodies.every(body => !body.includes("不要改测试")), "RCPT-311 what was taken back never reached the model");
  assert.ok(item.bodies[1]!.includes("顺便看日志") && item.bodies[1]!.includes("日志只看错误级别"));
});

test("RCPT-313/314: a supplement waiting in the session can be taken back until a round takes it", { timeout: 60_000 }, async t => {
  const item = await runtime(t, () => ({ text: "好的。" }));
  item.release(1);
  const first = await item.start("看看测试");
  assert.equal((await item.ended(first.ref)).phase, "completed");
  const waiting = await item.adapter.inputs!.send(first.ref, { text: "下一轮顺便看注册接口", key: "send.q1", mode: "after-run" });
  const about = await item.adapter.inputs!.send(first.ref, { text: "注册接口只看失败路径", key: "send.q2", mode: "after-run", about: waiting.input_id });
  assert.deepEqual((await item.adapter.readSession(item.session)).queued_inputs?.map(input => [input.text, input.about]),
    [["下一轮顺便看注册接口", undefined], ["注册接口只看失败路径", waiting.input_id]], "RCPT-314 a waiting correction names the input it is about");
  assert.deepEqual(await item.adapter.inputs!.withdraw!(first.ref, waiting.input_id), { input_id: waiting.input_id, from: "queued" }, "RCPT-313 the session gives it back");
  assert.deepEqual(await item.adapter.inputs!.withdraw!(first.ref, waiting.input_id), { input_id: waiting.input_id, from: "queued" }, "RCPT-313 again: the same answer, nothing more");
  assert.deepEqual((await item.adapter.readSession(item.session)).queued_inputs?.map(input => input.text), ["注册接口只看失败路径"]);
  await assert.rejects(item.adapter.inputs!.withdraw!(first.ref, "no-such-input"), code("agent.input_not_queued"), "RCPT-313 an id the session does not hold is refused");

  const original = (await item.adapter.readSession(item.session)).queued_inputs![0]!;
  assert.equal(original.source, "person"); assert.equal(typeof original.accepted_at_ms, "number");
  await item.reopen();
  assert.deepEqual((await item.adapter.readSession(item.session)).queued_inputs, [original], "restart preserves the SDK original identity/time");
  item.release(2);
  const second = await item.start("继续");
  const view = await item.ended(second.ref);
  assert.deepEqual(view.turns.filter(turn => turn.steer).map(turn => turn.text), ["注册接口只看失败路径"], "RCPT-313 the next round takes only what still waited");
  assert.equal(steerOf(view.turns, "注册接口只看失败路径")?.accepted_at_ms, original.accepted_at_ms, "carry does not adopt the new Run start time");
  assert.equal(steerOf(view.turns, "注册接口只看失败路径")?.id, original.input_id);
  assert.ok(item.bodies[1]!.includes("注册接口只看失败路径"), "the kept bodies are the requests as sent");
  assert.ok(item.bodies.every(body => !body.includes("下一轮顺便看注册接口")), "RCPT-313 what was taken back never reached the model");
  await assert.rejects(item.adapter.inputs!.withdraw!(first.ref, about.input_id), code("agent.input_not_queued"), "RCPT-313 a round took it: the session no longer holds it");
  await assert.rejects(item.adapter.inputs!.withdraw!(second.ref, about.input_id), code("agent.input_applied"), "RCPT-313 and the round that took it has read it");
});
