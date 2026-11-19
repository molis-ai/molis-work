import assert from "node:assert/strict";
import test from "node:test";
import { PrologueAgentAdapter, type PrologueControlPort, type PrologueEvent, type PrologueRunTiming, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { project_id: "timing-project", plugin_id: "io.molis.work.coding", install_id: "timing-install", actor_id: "user" };
const model = { protocol: "anthropic-compatible", endpoint: "https://127.0.0.1:1/v1/messages", model: "offline-fixture", credential_ref: "fixture" };

const scenarios = ["completed", "failed", "cancelled", "stopped", "reconcile-required"] as const;
for (const scenario of scenarios) for (const persistence of ["delayed", "failed"] as const) {
  const reconcile = scenario === "reconcile-required", phase = reconcile ? "completed" : scenario;
  test(`QEA-19/20/83 ${scenario}: ${persistence} display timing does not change execution or reconciliation facts`, async t => {
    const commit = Promise.withResolvers<void>(), saving = Promise.withResolvers<void>();
    const writes: Array<{ run_id: string; timing: PrologueRunTiming }> = [];
    const rounds: Array<{ control: PrologueControlPort; emit(event: PrologueEvent): void; changed(): void }> = [];
    const runtime: PrologueRuntimePort = {
      sessions: { create: async () => ({ ref: { id: "timing-session" } }) },
      saveRunTiming: async (run, timing) => {
        writes.push({ run_id: run.run_id, timing: structuredClone(timing) });
        if (run.run_id === "run-1") { saving.resolve(); await commit.promise; }
      },
      startAgentRun: async () => {
        let emit = (_event: PrologueEvent) => {}, changed = () => {};
        const control: PrologueControlPort = { state: "running", stop(reason) { control.state = reason; changed(); }, pause() {}, resume() {}, async steer() { throw new Error("Timing tests do not steer a run"); },
          subscribe(listener) { changed = listener; return () => {}; } };
        rounds.push({ control, emit: event => emit(event), changed: () => changed() });
        return { run: { ref: { id: `run-${rounds.length}` }, subscribe(listener) { emit = listener; return () => {}; }, cancel: async () => {} }, control };
      }, shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
    t.after(async () => { commit.resolve(); await adapter.close(); });
    const directory = { canonical_path: "/tmp/quality-audit-timing", realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Timing" });
    const request: AgentStartRequest = { ...owner, directory, session, task: "First request", role_id: "reader",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: [], prompts: [] } };
    const first = await adapter.start(request), round = rounds[0]!;
    round.emit({ type: "text-delta", text: "First result." });
    // QEA-20: a terminal control intent is not the SDK's committed execution record.
    round.control.state = scenario; round.changed();
    assert.equal((await adapter.read(first.ref)).phase, reconcile ? "reconcile-required" : "running");
    await assert.rejects(adapter.start({ ...request, task: "Too early" }), { code: "agent.session_busy" });
    assert.equal(writes.length, 0);
    round.emit(phase === "stopped" ? { type: "circuit-tripped", reason: "repeated-calls", count: 3 } : { type: phase });
    await saving.promise;
    const ended = await adapter.read(first.ref);
    assert.equal(ended.phase, scenario, "SDK execution can end while its effect still needs reconciliation");
    assert.ok(ended.ended_at);
    assert.doesNotMatch(ended.stop_reason ?? "", /正在保存显示时间/);
    if (reconcile) {
      await assert.rejects(adapter.start({ ...request, task: "Wait for original effect" }), { code: "agent.session_busy" });
      assert.equal(rounds.length, 1, "no new runtime round while the original effect is unknown");
    } else {
      const second = await adapter.start({ ...request, task: "Second request" });
      rounds[1]!.emit({ type: "text-delta", text: "Second result in progress." });
      assert.equal((await adapter.readSession(session)).latest_run!.ref.run_id, second.ref.run_id);
    }
    const before = (await adapter.readSession(session)).latest_run!;
    assert.equal(before.phase, reconcile ? "reconcile-required" : "running");
    let released = false;
    const published = Promise.withResolvers<void>();
    const off = adapter.observe(first.ref, () => { if (released) published.resolve(); });
    released = true;
    if (persistence === "failed") commit.reject(new Error("private timing storage details")); else commit.resolve();
    await published.promise; off();
    if (reconcile) {
      await assert.rejects(adapter.start({ ...request, task: "Timing saved but effect still unknown" }), { code: "agent.session_busy" });
      assert.equal(rounds.length, 1);
    } else assert.deepEqual((await adapter.readSession(session)).latest_run, before, "the old timing receipt cannot change the new run");
    const final = await adapter.read(first.ref);
    assert.equal(final.phase, scenario); assert.equal(final.ended_at, ended.ended_at);
    assert.deepEqual(final.turns, ended.turns);
    assert.doesNotMatch(final.stop_reason ?? "", /private timing storage details/);
    if (persistence === "failed") assert.match(final.stop_reason ?? "", /显示时间未能保存/);
    await adapter.read(first.ref);
    assert.equal(writes.filter(write => write.run_id === first.ref.run_id).length, 1);
    assert.equal(writes[0]!.timing.ended_at, ended.ended_at);
    rounds[1]?.emit({ type: "completed" });
  });
}
