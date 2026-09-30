import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
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
const write: ActionDefinition = { capability_id: "fixture.notes.write", version: 1, operation: "command", action: {
  title: "写笔记", description: "在项目里保存一条笔记", kind: "operation", scope: "project", audiences: ["agent"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } }, required: ["text"], additionalProperties: false } } };

test("an answer continues its own question; a rejection stays a rejection; a late or misplaced answer or approval starts nothing", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-answers-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const written: string[] = [];
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.notes", kind: "plugin", title: "笔记" }, definitions: [write],
    handlers: [{ ...write, handle(_context, input) { written.push((input as { text: string }).text); return { saved: true }; } }] });
  const requests: any[] = [];
  const script = [
    () => reply({ name: "ask-user", input: { why: "要写成几段？" } }),
    (body: any) => { assert.match(JSON.stringify(body.messages), /两段/, "the answer reaches the round that asked"); return reply({ name: "change-capability", input: { capability_id: "fixture.notes.write", version: 1, provider_id: "fixture.notes", input: { text: "两段的笔记" } } }); },
    () => reply(undefined, "你拒绝了，我没有写。"),
  ];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    requests.push(body);
    return (script[requests.length - 1] ?? (() => reply(undefined, "再说一次。")))(body);
  });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-answers-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目" }, "web-user");
  try {
    const sent = await service.send({ text: "帮我写一条笔记", request_id: "req-answers-1" }, { project_ref: project });
    const asking = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "waiting-input" ? view : undefined; }, "question");
    const round = asking.rounds[0]!, question = round.awaiting_input[0]!;
    await service.answer(sent.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, ...(question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}), text: "两段" });
    const reviewing = await until(async () => { const view = await service.read(sent.work.work_id); return view.reviews.length ? view : undefined; }, "review");
    const review = reviewing.reviews[0]!;
    await service.decide(sent.work.work_id, { review_id: review.review_id, decision: "reject" });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "completion");
    assert.deepEqual(written, [], "a rejection is not an approval: nothing was written");

    const before = requests.length;
    await assert.rejects(service.answer(sent.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, text: "三段" }),
      (error: unknown) => error instanceof AssistantError && error.code === "assistant.stale");
    await assert.rejects(service.decide(sent.work.work_id, { review_id: review.review_id, decision: "approve" }));
    assert.equal(requests.length, before, "a late answer or approval starts no model call");
    assert.deepEqual(written, [], "and revives no old action");

    const other = await service.send({ text: "另一件事", request_id: "req-answers-2" }, { project_ref: project });
    await assert.rejects(service.answer(other.work.work_id, { run_id: round.run_id, pending_id: question.pending_id, text: "两段" }),
      (error: unknown) => error instanceof AssistantError && error.code === "assistant.scope", "an answer from another work is refused");
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
