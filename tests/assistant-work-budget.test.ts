import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantError, AssistantService, stopInWords } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}

/** One model answer that reports 600 input and 10 output tokens. */
function reply(text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 600, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("a cap the person puts on one work holds its rounds: what is left bounds the next round, and none left starts nothing", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-work-budget-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return reply(); });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-work-budget-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), timeZone: "Asia/Shanghai" }, "web-user");
  try {
    const sent = await service.send({ text: "第一轮", request_id: "work-budget-1", scope: { kind: "personal" } }, {});
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    const first = await service.read(sent.work.work_id);
    assert.deepEqual(first.usage, { tokens: 610, rounds: 1, budget_tokens: null }, "what the round used is counted, with no cap yet");

    // Too small a cap, or one on a sub-task, is refused with why.
    await assert.rejects(service.saveWorkBudget(sent.work.work_id, 500), /至少 1000 tokens/);
    const capped = await service.saveWorkBudget(sent.work.work_id, 1000);
    assert.deepEqual(capped.usage, { tokens: 610, rounds: 1, budget_tokens: 1000 });
    assert.equal(capped.work.budget_tokens, 1000);

    // 390 left: the round starts, bounded to what is left.
    await service.send({ text: "第二轮", request_id: "work-budget-2", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const session = (await service.read(sent.work.work_id)).work.session_id!;
    const run = (await adapter.readSession({ session_id: session })).latest_run!;
    assert.equal(run.frozen.budget?.max_total_tokens, 390, "the round may spend only what is left of the work's cap");

    // Nothing left: no round, no model call, and the words say which cap and what to do; the text stays as the draft.
    const before = calls;
    await assert.rejects(service.send({ text: "第三轮", request_id: "work-budget-3", work_id: sent.work.work_id }, {}),
      (error: unknown) => error instanceof AssistantError && error.code === "assistant.budget" && /这项工作已用 1,220 tokens，达到给它设的上限 1,000/.test(error.message));
    assert.equal(calls, before, "no model call ran");
    assert.equal((await service.read(sent.work.work_id)).work.draft, "第三轮");

    // Raised, it goes on; cleared, the work has no cap of its own (the daily cap still applies as before).
    await service.saveWorkBudget(sent.work.work_id, 5000);
    await service.send({ text: "第三轮", request_id: "work-budget-4", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 3 && view.work.state === "completed"; }, "third round");
    const cleared = await service.saveWorkBudget(sent.work.work_id, null);
    assert.equal(cleared.work.budget_tokens, undefined);
    assert.equal(cleared.usage?.budget_tokens, null);
    assert.equal((await service.usage()).today.rounds, 3, "the daily count sees the same rounds");

    // A stop at the round's token limit, in a work with a cap, is that cap in the person's words.
    assert.match(stopInWords("AGENT_BUDGET_EXCEEDED: This run already used 1200 of its 390 tokens; nothing was sent.", 1000), /这项工作的用量上限（1,000 tokens）/);
    assert.match(stopInWords("This run already used 1200 of its 390 tokens; nothing was sent."), /这一轮的用量上限/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});
