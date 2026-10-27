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
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";

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
