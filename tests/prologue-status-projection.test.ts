import assert from "node:assert/strict";
import test from "node:test";
import { PrologueAgentAdapter, type PrologueRuntimePort, type PrologueRestoredSession, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";

const owner = { project_id: "status-board", plugin_id: "io.molis.work.coding", install_id: "status-install", actor_id: "person" };
const frozen = { role_id: "reader", role_version: 1, execution: "read-only" as const, model_id: "fixture", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null };
const ref = { session_id: "status-session", runtime_id: "prologue" };
type SavedRun = NonNullable<Awaited<ReturnType<NonNullable<PrologueRuntimePort["sessions"]["restore"]>>>>["runs"][number];
const savedFrozen: SavedRun["frozen"] = { ...frozen, workspace: "none" };

test("warm status reads the current phase after an asynchronous step board lookup", async () => {
  let emit: (event: PrologueEvent) => void = () => {};
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const plan = { source: { artifact_id: "warm-plan", version: 1 }, title: "Plan", steps: [{ id: "step-1", title: "Read", acceptance: "Read the result" }] };
  const adapter = new PrologueAgentAdapter({
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://fixture.invalid/messages", model: "fixture", credential_ref: "fixture" }),
    runtime: {
      sessions: { create: async () => ({ ref: { id: "warm-status" } }) },
      readStepBoard: async () => { enter(); await held; return undefined; },
      startAgentRun: async () => ({
        run: { ref: { id: "warm-run" }, subscribe: listener => { emit = listener; return () => {}; }, cancel: async () => {} },
        control: { state: "running", stop: () => {}, pause: () => {}, resume: () => {}, steer: () => {}, subscribe: () => () => {} },
      }),
      shutdown: async () => {},
    },
  });
  try {
    const directory = { canonical_path: "/tmp/warm-status", realpath_verified: true };
    const session = await adapter.createSession({ ...owner, title: "Warm status", directory });
    await adapter.start({ ...owner, session, directory, task: "Read", role_id: "reader",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: ["board-read", "board-report"], prompts: [] },
      execution_plan: plan, text_materials: [{ material_id: "plan", title: plan.title, source_artifact_id: plan.source.artifact_id, source_version: 1, text: JSON.stringify(plan) }],
    });
    const pending = adapter.readSessionStatus(session);
    await entered;
    emit({ type: "completed" });
    release();
    const result = await pending;
    assert.equal(result.status.latest_phase, "completed");
    assert.equal(result.status.recovery, false);
  } finally { release(); await adapter.close(); }
});

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

test("a session nobody has read for a while is let go and restored from the ledger on the next read", async () => {
  let clock = Date.parse("2026-11-25T00:00:00Z"), restores = 0;
  const sessionRuns = (id: string): SavedRun[] => [{ ref: { session_id: id, run_id: id + "-run" }, frozen: savedFrozen, task: "保存的任务", started_at: "2026-11-25T00:00:00Z", terminal: true,
    events: [{ type: "text-delta", text: "保存的正文 " + id }, { type: "completed" }] }];
  const adapter = new PrologueAgentAdapter({ now: () => new Date(clock), modelConfiguration: async () => { throw new Error("passive read"); }, runtime: {
    sessions: { create: async () => { throw new Error("unused"); }, restore: async id => { restores++; return { title: id, owner, runs: sessionRuns(id) }; },
      readStatus: async id => ({ owner, latest: sessionRuns(id).at(-1) }) },
    startAgentRun: async () => { throw new Error("no dispatch"); }, shutdown: async () => {},
  } });
  const [a, b, c] = ["rest-a", "rest-b", "rest-c"].map(session_id => ({ session_id, runtime_id: "prologue" }));
  try {
    await adapter.readSession(a!); await adapter.readSession(b!);
    assert.equal(restores, 2);
    // Read recently, or followed by someone: kept.
    clock += 4 * 60_000;
    await adapter.readSession(c!); await adapter.readSession(a!);
    assert.equal(restores, 3);
    const stop = adapter.observe({ session_id: "rest-c", run_id: "rest-c-run" }, () => {});
    clock += 5 * 60_000 + 1;
    await adapter.readSession(c!);
    assert.equal(restores, 3, "the session being read is kept");
    await adapter.readSession(b!);
    assert.equal(restores, 4, "b rested past the limit, was let go and is restored from the ledger");
    await adapter.readSession(c!);
    assert.equal(restores, 4, "c is followed, so it stays");
    stop();
    // Once no one follows it, c goes too; a went with b and reads back the same history as before.
    clock += 5 * 60_000 + 1;
    await adapter.readSession(b!);
    const again = await adapter.readSession(a!);
    assert.equal(restores, 5);
    assert.equal(again.latest_run?.phase, "completed");
    assert.equal((await adapter.read({ session_id: "rest-a", run_id: "rest-a-run" })).turns.find(turn => turn.kind === "assistant")?.text, "保存的正文 rest-a");
    assert.equal((await adapter.readSessionStatus(c!)).status.latest_phase, "completed");
  } finally { await adapter.close(); }
});

test("streamed text reaches a follower gathered, while a phase change goes at once", async () => {
  let emit: (event: PrologueEvent) => void = () => {};
  const adapter = new PrologueAgentAdapter({
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://fixture.invalid/messages", model: "fixture", credential_ref: "fixture" }),
    runtime: {
      sessions: { create: async () => ({ ref: { id: "stream-session" } }) },
      startAgentRun: async () => ({
        run: { ref: { id: "stream-run" }, subscribe: listener => { emit = listener; return () => {}; }, cancel: async () => {} },
        control: { state: "running", stop: () => {}, pause: () => {}, resume: () => {}, steer: async () => ({ steerId: "steer-1", replayed: false }), subscribe: () => () => {} },
      }),
      shutdown: async () => {},
    },
  });
  try {
    const directory = { canonical_path: "/tmp/stream-notify", realpath_verified: true };
    const session = await adapter.createSession({ ...owner, title: "Stream", directory });
    const handle = await adapter.start({ ...owner, session, directory, task: "Answer", role_id: "reader",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: [], prompts: [] } });
    const seen: string[] = [];
    const stop = adapter.observe(handle.ref, view => { seen.push(`${view.phase}:${view.turns.at(-1)?.text ?? ""}`); });
    assert.equal(seen.length, 1);
    for (let i = 0; i < 20; i++) emit({ type: "text-delta", text: "字" });
    assert.equal(seen.length, 1, "deltas are gathered");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(seen.length, 2);
    assert.match(seen[1]!, /字{20}$/);
    emit({ type: "text-delta", text: "尾" });
    emit({ type: "completed" });
    assert.equal(seen.length, 3, "the ending goes at once, with the text before it");
    assert.match(seen[2]!, /^completed:.*尾$/);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(seen.length, 3, "nothing left over after the ending");
    stop();
  } finally { await adapter.close(); }
});
