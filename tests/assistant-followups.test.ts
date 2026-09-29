import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService, sameLocalTimeLater } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { ASSISTANT_FOLLOW_UP_ACTIONS, registerAssistantRuleActions } from "../apps/local-host/src/assistant/assistant-rule-actions.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 400; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
function reply(text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

test("a standing request runs once per due time while the Host runs; a time missed is reported, never replayed late", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-followups-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  const requests: any[] = [];
  let hold: Promise<void> | null = null;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { if (hold) await hold; requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array))); return reply("今天完成了三件事。"); });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-followups-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  let clock = new Date("2026-09-29T08:00:00.000Z");
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user", () => clock);
  try {
    const sent = await service.send({ text: "帮我跟进今天的工作", request_id: "req-followups-1" }, { project_ref: project });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    // Added the way the Assistant adds it: through its own action, attached to the work its round acts for.
    const actions = new ActionService();
    registerAssistantRuleActions(actions, () => service);
    await actions.invoke({ actor_id: "web-user", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [], audit_actor_id: `assistant:${sent.work.work_id}` },
      ASSISTANT_FOLLOW_UP_ACTIONS.add, { text: "汇总今天的进展", at: "2026-09-29T10:00:00.000Z", repeat: "daily", label: "每天六点汇总" });
    const [followUp] = service.followUps(sent.work.work_id);
    assert.equal(followUp?.next_at, "2026-09-29T10:00:00.000Z");

    assert.deepEqual(await service.runDueFollowUps(), [], "nothing before its time");
    clock = new Date("2026-09-29T10:00:30.000Z");
    const ran = await service.runDueFollowUps();
    assert.deepEqual(ran.map(row => row.outcome), ["started"]);
    const second = await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "timed round");
    assert.match(second.rounds[1]!.text, /每天六点汇总.*汇总今天的进展/);
    assert.equal(service.followUps(sent.work.work_id)[0]!.next_at, "2026-09-30T10:00:00.000Z", "the next one is tomorrow at the same time");
    assert.deepEqual(await service.runDueFollowUps(), [], "the same due time never starts twice");

    // The Host was not running at tomorrow's time: when it comes back hours later, the time is reported as missed.
    clock = new Date("2026-09-30T14:00:00.000Z");
    const before = requests.length;
    assert.deepEqual((await service.runDueFollowUps()).map(row => row.outcome), ["missed"]);
    assert.equal(requests.length, before, "a missed time starts nothing late");
    assert.equal((await service.read(sent.work.work_id)).rounds.length, 2);
    assert.match(service.notices(null).find(notice => notice.work_id === sent.work.work_id && /错过/.test(notice.text))!.text, /错过了「每天六点汇总」/);
    assert.equal(service.followUps(sent.work.work_id)[0]!.next_at, "2026-10-01T10:00:00.000Z");
    assert.deepEqual(service.followUps(sent.work.work_id)[0]!.last?.outcome, "missed");
    assert.throws(() => service.saveFollowUp({ work_id: sent.work.work_id, text: "x", at: "2026-09-01T00:00:00.000Z", label: "过去" }), /之后/);

    // The person is still in a round of this work when the time comes: this time is skipped, not queued behind it.
    let release!: () => void;
    hold = new Promise(resolve => { release = resolve; });
    clock = new Date("2026-10-01T09:59:00.000Z");
    await service.send({ work_id: sent.work.work_id, text: "再补一句", request_id: "req-followups-2" }, {});
    await until(async () => (await service.read(sent.work.work_id)).work.state === "running", "the person's round");
    clock = new Date("2026-10-01T10:00:30.000Z");
    assert.deepEqual((await service.runDueFollowUps()).map(row => row.outcome), ["skipped"]);
    assert.equal(service.followUps(sent.work.work_id)[0]!.last?.detail, "上一轮还没结束，这一次没有开始");
    hold = null; release();
    const after = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "the person's round ends");
    assert.equal(after.rounds.length, 3, "only the person's own round ran");
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a daily time keeps the person's wall-clock time across a daylight-saving change", () => {
  // 2026-10-31 18:00 PDT; clocks go back on 2026-11-01, so the next six o'clock is 18:00 PST (02:00Z).
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-11-01T01:00:00.000Z"), 1, "America/Los_Angeles")).toISOString(), "2026-11-02T02:00:00.000Z");
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-09-29T10:00:00.000Z"), 7, "Asia/Shanghai")).toISOString(), "2026-10-06T10:00:00.000Z");
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-09-29T10:00:00.000Z"), 1, "Not/AZone")).toISOString(), "2026-09-30T10:00:00.000Z", "an unknown zone falls back to 24 hours");
});
