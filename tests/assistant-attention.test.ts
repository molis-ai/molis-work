import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AssistantRule } from "@molis-ai/molis-work-contracts/services/assistant";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService, holdingRule } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ASSISTANT_RULE_ACTIONS, registerAssistantRuleActions } from "../apps/local-host/src/assistant/assistant-rule-actions.js";

const rule = (partial: Partial<AssistantRule>): AssistantRule => ({ rule_id: "r", kind: "quiet", surfaces: [], except: [], label: "规则", enabled: true, created_at: "2026-09-28T00:00:00.000Z", ...partial });

test("rules hold notices exactly as written: where, which kinds still come through, and a pause everywhere", () => {
  const writing = rule({ rule_id: "writing", surfaces: ["pages"], except: ["failed"], label: "写文档时不提醒，失败除外" });
  assert.equal(holdingRule([writing], "completed", "pages")?.rule_id, "writing");
  assert.equal(holdingRule([writing], "failed", "pages"), undefined, "a failure still comes through");
  assert.equal(holdingRule([writing], "completed", "coding"), undefined, "elsewhere the rule does not apply");
  assert.equal(holdingRule([writing], "completed", null), undefined);
  const pause = rule({ rule_id: "pause", kind: "pause", until: "2999-01-01T00:00:00.000Z", except: ["failed"] });
  assert.equal(holdingRule([pause], "needs-decision", "coding")?.rule_id, "pause");
  assert.equal(holdingRule([rule({ surfaces: [] })], "result", "goals")?.rule_id, "r", "a quiet rule with no surfaces is quiet everywhere");
});

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

test("a round that finishes while the person is elsewhere raises one notice; their rule holds it where it applies; nothing repeats", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-attention-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", board_id: "board", storage_key: "memory:project" };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(globalThis, "fetch", async () => { await gate; return reply(); });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-attention-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => host, authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "项目" }, "web-user");
  try {
    service.saveRule({ kind: "quiet", surfaces: ["pages"], except: ["failed"], label: "写文档时不提醒，失败除外" });
    const sent = await service.send({ text: "整理一下", request_id: "req-attention-1" }, { project_ref: project });
    await service.list();
    assert.deepEqual(service.notices("pages"), [], "a running round raises nothing");
    release();
    await until(async () => (await service.list()).find(work => work.work_id === sent.work.work_id)?.state === "completed", "completion");
    const onPages = service.notices("pages");
    assert.equal(onPages.length, 1);
    assert.equal(onPages[0]!.kind, "completed");
    assert.deepEqual(onPages[0]!.held, { rule_id: service.rules()[0]!.rule_id, reason: "写文档时不提醒，失败除外" }, "on Pages the person's rule holds it");
    assert.equal(service.notices("coding")[0]!.held, undefined, "elsewhere it comes through");
    await service.list(); await service.list();
    assert.equal(service.notices("coding").length, 1, "seeing the same state again raises nothing more");
    // A temporary pause holds it everywhere; removing the pause leaves the long-term rule as it was.
    const [, pause] = service.saveRule({ kind: "pause", surfaces: [], except: ["failed"], until: new Date(Date.now() + 3600_000).toISOString(), label: "这次先别提醒" });
    assert.equal(service.notices("coding")[0]!.held?.reason, "这次先别提醒");
    service.removeRule(pause!.rule_id);
    assert.equal(service.notices("coding")[0]!.held, undefined);
    assert.equal(service.notices("pages")[0]!.held?.reason, "写文档时不提醒，失败除外");
    assert.equal(service.settleNotices({ work_id: sent.work.work_id }, "seen"), 1);
    assert.deepEqual(service.notices("coding"), [], "seen is settled");
    assert.throws(() => service.saveRule({ kind: "pause", surfaces: [], except: [], label: "没有结束时间" }), /结束时间/);
    assert.throws(() => service.saveRule({ kind: "quiet", surfaces: ["pages"], except: [], label: "" }), /说法/);
  } finally { await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); }
});

test("the person's rules are the Assistant's own actions: found by agents, adding one is a change, the Host keeps it as written", async () => {
  const actions = new ActionService();
  const service = new AssistantService(new AssistantStore(new DatabaseSync(":memory:")), { host: async () => { throw new Error("not used"); }, authority: async () => { throw new Error("not used"); } }, "web-user");
  registerAssistantRuleActions(actions, () => service);
  const caller = { actor_id: "web-user", actor_kind: "runtime" as const, project_id: null, audience: "agent" as const, permissions: [] };
  const found = actions.discover(caller).filter(view => view.provider.provider_id === "io.molis.work.assistant.rules");
  assert.deepEqual(found.map(view => [view.capability_id, view.operation]).sort(), [["assistant.rules.add", "command"], ["assistant.rules.list", "query"], ["assistant.rules.remove", "command"]]);
  const added = await actions.invoke(caller, ASSISTANT_RULE_ACTIONS.add, { kind: "quiet", surfaces: ["pages"], except: ["failed"], label: "写文档时不要提醒，失败除外" }) as { rules: AssistantRule[] };
  assert.deepEqual(added.rules.map(item => [item.kind, item.surfaces, item.except, item.label]), [["quiet", ["pages"], ["failed"], "写文档时不要提醒，失败除外"]]);
  await assert.rejects(actions.invoke(caller, ASSISTANT_RULE_ACTIONS.add, { kind: "sometimes", label: "x" }), /kind|规则/);
  const removed = await actions.invoke(caller, ASSISTANT_RULE_ACTIONS.remove, { rule_id: added.rules[0]!.rule_id }) as { rules: AssistantRule[] };
  assert.deepEqual(removed.rules, []);
});
