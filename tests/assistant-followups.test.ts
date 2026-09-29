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

test("a standing request is kept by Prologue's durable queue: it runs once per due time, a busy work skips, a missed time is reported and not replayed", { timeout: 60_000 }, async t => {
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
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user");
  const schedule = adapter.schedule!;
  try {
    assert.equal(await service.attachSchedule(), true);
    const sent = await service.send({ text: "帮我跟进今天的工作", request_id: "req-followups-1" }, { project_ref: project });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    // Added the way the Assistant adds it: through its own action, attached to the work its round acts for.
    const actions = new ActionService();
    registerAssistantRuleActions(actions, () => service);
    const due = new Date(Date.now() + 700);
    await actions.invoke({ actor_id: "web-user", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [], audit_actor_id: `assistant:${sent.work.work_id}` },
      ASSISTANT_FOLLOW_UP_ACTIONS.add, { text: "汇总今天的进展", at: due.toISOString(), repeat: "daily", label: "每天六点汇总" });
    const [followUp] = service.followUps(sent.work.work_id);
    const key = `fu-${followUp!.followup_id}-${due.getTime()}`;
    assert.deepEqual([schedule.find(key)?.kind, schedule.find(key)?.state], ["assistant.follow-up", "queued"], "the time lives in the runtime's queue");

    const second = await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "timed round");
    assert.match(second.rounds[1]!.text, /每天六点汇总.*汇总今天的进展/);
    const after = service.followUps(sent.work.work_id)[0]!;
    assert.equal(after.last?.outcome, "started");
    assert.equal(after.next_at, new Date(due.getTime() + 86_400_000).toISOString(), "tomorrow at the same time");
    assert.equal(schedule.find(`fu-${after.followup_id}-${due.getTime() + 86_400_000}`)?.state, "queued", "and that time is queued");
    assert.equal(schedule.find(key)?.state, "done");
    // The same due time scheduled again is the same task: it does not run twice.
    await schedule.enqueue({ key, session_id: sent.work.session_id!, kind: "assistant.follow-up", payload: { followup_id: after.followup_id }, due_at: due.toISOString() });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal((await service.read(sent.work.work_id)).rounds.length, 2);

    // The Host was not running at a due time: when the queue hands it over hours late, it is reported, not replayed.
    const late = new Date(Date.now() - 2 * 3600_000);
    store.saveFollowUp("web-user", { ...after, next_at: late.toISOString() });
    const before = requests.length;
    await service.attachSchedule();
    const missed = await until(() => service.followUps(sent.work.work_id)[0]!.last?.outcome === "missed" ? service.followUps(sent.work.work_id)[0] : undefined, "missed");
    assert.equal(requests.length, before, "a missed time starts nothing late");
    assert.equal((await service.read(sent.work.work_id)).rounds.length, 2);
    assert.match(service.notices(null).find(notice => notice.work_id === sent.work.work_id && /错过/.test(notice.text))!.text, /错过了「每天六点汇总」/);
    assert.ok(Date.parse(missed!.next_at!) > Date.now(), "the next time is in the future");
    await assert.rejects(service.saveFollowUp({ work_id: sent.work.work_id, text: "x", at: "2026-09-01T00:00:00.000Z", label: "过去" }), /之后/);

    // The person is still in a round of this work when a time comes: this time is skipped, not queued behind it.
    let release!: () => void;
    hold = new Promise(resolve => { release = resolve; });
    await service.send({ work_id: sent.work.work_id, text: "再补一句", request_id: "req-followups-2" }, {});
    await until(async () => (await service.read(sent.work.work_id)).work.state === "running", "the person's round");
    const soon = await service.saveFollowUp({ work_id: sent.work.work_id, text: "看一眼", at: new Date(Date.now() + 400).toISOString(), label: "一会儿看一眼" });
    const skipped = await until(() => service.followUps(sent.work.work_id).find(item => item.followup_id === soon.followup_id && item.last) , "skipped");
    assert.deepEqual([skipped.last!.outcome, skipped.last!.detail, skipped.enabled], ["skipped", "上一轮还没结束，这一次没有开始", false]);
    hold = null; release();
    const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "the person's round ends");
    assert.equal(done.rounds.length, 3, "only the person's own round ran");

    // A time that came while no runner was attached (the Host still starting) is decided when it attaches: on time
    // enough it runs, otherwise it is reported as missed — never left silently undone.
    const orphan = await service.saveFollowUp({ work_id: sent.work.work_id, text: "迟到的一次", at: new Date(Date.now() + 60_000).toISOString(), label: "没接上的一次" });
    const orphanKey = `fu-${orphan.followup_id}-${Date.parse(orphan.next_at!)}`;
    await schedule.cancel(orphanKey);
    store.saveFollowUp("web-user", { ...orphan, next_at: new Date(Date.now() - 3 * 3600_000).toISOString() });
    const staleKey = `fu-${orphan.followup_id}-${Date.parse(service.followUps(sent.work.work_id).find(item => item.followup_id === orphan.followup_id)!.next_at!)}`;
    // Simulate the queue having given up on it: a task under that key that already failed.
    const unhandled = schedule.handle("assistant.follow-up", async () => { throw new Error("没有处理者"); });
    await schedule.enqueue({ key: staleKey, session_id: sent.work.session_id!, kind: "assistant.follow-up", payload: { followup_id: orphan.followup_id }, due_at: new Date(Date.now() - 3 * 3600_000).toISOString(), max_attempts: 1 });
    await until(() => schedule.find(staleKey)?.state === "failed", "the queue gave up");
    unhandled();
    const service2 = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目", timeZone: "Asia/Shanghai" }, "web-user");
    await service2.attachSchedule();
    assert.equal(service2.followUps(sent.work.work_id).find(item => item.followup_id === orphan.followup_id)!.last?.outcome, "missed");

    // Cancelling takes it out of the queue.
    const standing = service.followUps(sent.work.work_id).find(item => item.followup_id === after.followup_id)!;
    await service.removeFollowUp(standing.followup_id);
    assert.equal(schedule.find(`fu-${standing.followup_id}-${Date.parse(standing.next_at!)}`)?.state, "cancelled");
    assert.equal(service.followUps(sent.work.work_id).some(item => item.followup_id === standing.followup_id), false);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("a daily time keeps the person's wall-clock time across a daylight-saving change", () => {
  // 2026-10-31 18:00 PDT; clocks go back on 2026-11-01, so the next six o'clock is 18:00 PST (02:00Z).
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-11-01T01:00:00.000Z"), 1, "America/Los_Angeles")).toISOString(), "2026-11-02T02:00:00.000Z");
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-09-29T10:00:00.000Z"), 7, "Asia/Shanghai")).toISOString(), "2026-10-06T10:00:00.000Z");
  assert.equal(new Date(sameLocalTimeLater(Date.parse("2026-09-29T10:00:00.000Z"), 1, "Not/AZone")).toISOString(), "2026-09-30T10:00:00.000Z", "an unknown zone falls back to 24 hours");
});
