import assert from "node:assert/strict";
import test from "node:test";
import { PrologueAgentAdapter, type PrologueRuntimePort, type PrologueRestoredSession, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";

const owner = { board_id: "status-board", plugin_id: "io.molis.work.coding", install_id: "status-install", actor_id: "person" };
const frozen = { role_id: "reader", role_version: 1, execution: "read-only" as const, model_id: "fixture", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null };
const ref = { session_id: "status-session", runtime_id: "prologue" };

for (const scenario of [
  { name: "empty", events: null, expected: null },
  { name: "complete", events: [{ type: "completed" }], expected: "completed" },
  { name: "failed", events: [{ type: "failed", error: { code: "FIXTURE", safeMessage: "saved failure" } }], expected: "failed" },
  { name: "stopped", events: [{ type: "cancelled" }], stop: "stopped", expected: "stopped" },
  { name: "sealed short progress", events: [{ type: "text-delta", text: "saved prefix" }], expected: "failed" },
  { name: "unknown pending", events: [{ type: "awaiting-input", pendingRef: { id: "p", revision: 1 }, kind: "text", why: "saved question" }], interrupted: true, expected: "reconcile-required" },
] as const) {
  test(`cold status matches detail recovery: ${scenario.name}`, async () => {
    let restores = 0, starts = 0, modelReads = 0;
    const run: PrologueRestoredSession["runs"][number] = { ref: { session_id: ref.session_id, run_id: "last" }, frozen, task: "saved task", started_at: "2026-09-30T00:00:00Z",
      terminal: !("interrupted" in scenario), events: (scenario.events ?? []) as PrologueEvent[],
      ...("stop" in scenario ? { stop_intent: scenario.stop } : {}) };
    const saved: PrologueRestoredSession = { title: "原会话", owner, runs: scenario.events ? [run] : [],
      ...("interrupted" in scenario ? { recovery: { required: true, reason: "结果未知，必须核对" } } : {}) };
    const runtime: PrologueRuntimePort = {
      sessions: { create: async () => { throw new Error("unused"); },
        restore: async () => { restores++; return saved; },
        readStatus: async () => ({ owner, latest: saved.runs.at(-1), recovery: saved.recovery }), },
      startAgentRun: async () => { starts++; throw new Error("passive status must not execute"); }, shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => { modelReads++; return null; } });
    try {
      const cold = await adapter.readSessionStatus(ref);
      assert.equal(cold.status.latest_phase, scenario.expected);
      assert.equal(cold.status.recovery, "interrupted" in scenario);
      assert.equal(restores, 0);
      const detail = await adapter.readSession(ref);
      assert.equal(detail.latest_run?.phase ?? null, scenario.expected);
      assert.deepEqual(await adapter.readSessionStatus(ref), cold);
      assert.equal(restores, 1); assert.equal(starts, 0); assert.equal(modelReads, 0);
    } finally { await adapter.close(); }
  });
}

test("status reads only the latest projection and keeps full history available on demand", async () => {
  let restores = 0;
  const runs = Array.from({ length: 100 }, (_, i) => ({ ref: { session_id: ref.session_id, run_id: "run-" + i }, frozen,
    task: "历史 " + i, started_at: "2026-09-30T00:00:00Z", terminal: true,
    events: [{ type: "text-delta", text: "保存的正文 " + i }, { type: "completed" }] as PrologueEvent[] }));
  const adapter = new PrologueAgentAdapter({ modelConfiguration: async () => { throw new Error("passive read"); }, runtime: {
    sessions: { create: async () => { throw new Error("unused"); }, restore: async () => { restores++; return { title: "100 轮", owner, runs }; },
      readStatus: async () => ({ owner, latest: runs.at(-1) }) },
    startAgentRun: async () => { throw new Error("no dispatch"); }, shutdown: async () => {},
  } });
  try {
    assert.equal((await adapter.readSessionStatus(ref)).status.latest_phase, "completed");
    assert.equal(restores, 0);
    const detail = await adapter.readSession(ref);
    assert.equal(detail.runs.length, 100); assert.equal(restores, 1);
    assert.equal((await adapter.read(runs[0]!.ref)).turns.find(turn => turn.kind === "assistant")?.text, "保存的正文 0");
    await assert.rejects(adapter.control(runs[0]!.ref, { kind: "resume" }), /历史执行没有活动控制句柄/);
  } finally { await adapter.close(); }
});
