import assert from "node:assert/strict";
import test from "node:test";
import { PrologueAgentAdapter, type PrologueControlPort, type PrologueEvent, type PrologueRunTiming, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { project_id: "timing-project", plugin_id: "io.molis.work.coding", install_id: "timing-install", actor_id: "user" };
const model = { protocol: "anthropic-compatible", endpoint: "https://127.0.0.1:1/v1/messages", model: "offline-fixture", credential_ref: "fixture" };

for (const phase of ["completed", "failed", "cancelled", "stopped"] as const) for (const persistence of ["delayed", "failed"] as const) {
  test(`QEA-19/20 ${phase}: ${persistence} display timing does not block the next run or change its facts`, async t => {
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
    round.control.state = phase; round.changed();
    assert.equal((await adapter.read(first.ref)).phase, "running");
    await assert.rejects(adapter.start({ ...request, task: "Too early" }), { code: "agent.session_busy" });
    assert.equal(writes.length, 0);
    round.emit(phase === "stopped" ? { type: "circuit-tripped", reason: "repeated-calls", count: 3 } : { type: phase });
    await saving.promise;
    const ended = await adapter.read(first.ref);
    assert.equal(ended.phase, phase, "SDK terminal facts do not wait for display metadata");
    assert.ok(ended.ended_at);
    assert.doesNotMatch(ended.stop_reason ?? "", /正在保存显示时间/);
    const second = await adapter.start({ ...request, task: "Second request" });
    rounds[1]!.emit({ type: "text-delta", text: "Second result in progress." });
    const before = (await adapter.readSession(session)).latest_run!;
    assert.equal(before.ref.run_id, second.ref.run_id); assert.equal(before.phase, "running");
    let released = false;
    const published = Promise.withResolvers<void>();
    const off = adapter.observe(first.ref, () => { if (released) published.resolve(); });
    released = true;
    if (persistence === "failed") commit.reject(new Error("private timing storage details")); else commit.resolve();
    await published.promise; off();
    assert.deepEqual((await adapter.readSession(session)).latest_run, before, "the old timing receipt cannot change the new run");
    const final = await adapter.read(first.ref);
    assert.equal(final.phase, phase); assert.equal(final.ended_at, ended.ended_at);
    assert.deepEqual(final.turns, ended.turns);
    assert.doesNotMatch(final.stop_reason ?? "", /private timing storage details/);
    if (persistence === "failed") assert.match(final.stop_reason ?? "", /显示时间未能保存/);
    await adapter.read(first.ref);
    assert.equal(writes.filter(write => write.run_id === first.ref.run_id).length, 1);
    assert.equal(writes[0]!.timing.ended_at, ended.ended_at);
    rounds[1]!.emit({ type: "completed" });
  });
}
