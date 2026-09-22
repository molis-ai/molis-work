import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter, PrologueAgentAdapter, type PrologueRuntimePort, type PrologueEvent, type PrologueRunTiming } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { board_id: "recovery-board", plugin_id: "io.molis.work.coding", install_id: "recovery-install" };
const model = { protocol: "anthropic-compatible", endpoint: "https://127.0.0.1:1/v1/messages", model: "offline-fixture", credential_ref: "fixture" };

for (const result of ["saved", "failed"] as const) {
  test(`steer ${result}: control route waits for the SDK receipt and propagates failure`, async () => {
    const receipt = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const runtime: PrologueRuntimePort = {
      sessions: { create: async () => ({ ref: { id: "steer-session" } }) },
      startAgentRun: async () => ({
        run: { ref: { id: "steer-run" }, subscribe: () => () => {}, cancel: async () => {} },
        control: { state: "running", stop() {}, pause() {}, resume() {}, subscribe: () => () => {},
          steer: async ({ text }) => { assert.equal(text, "不要改测试"); entered.resolve(); await receipt.promise; } },
      }), shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
    const directory = { canonical_path: "/tmp/steer", realpath_verified: true };
    const session = await adapter.createSession({ ...owner, actor_id: "user", title: "steer", directory });
    const handle = await adapter.start({ ...owner, actor_id: "user", session, directory, task: "read", role_id: "reader",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: [], prompts: [] } });
    let accepted = false;
    const submission = adapter.control(handle.ref, { kind: "steer", text: "不要改测试" }).then(() => { accepted = true; });
    await entered.promise;
    assert.equal(accepted, false);
    if (result === "saved") { receipt.resolve(); await submission; assert.equal(accepted, true); }
    else { receipt.reject(new Error("receipt failed")); await assert.rejects(submission, /receipt failed/); assert.equal(accepted, false); }
    await adapter.close();
  });
}

test("packed SDK: failed terminal ledger and frozen ownership survive restart without provider calls", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-sdk-recovery-"));
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.recovery-test", appVersion: "0.1.0" },
    storageRoot: join(root, "runtime"), modelConfiguration: async () => model,
    // Private endpoints are rejected by SDK network policy before dispatch.
    resolveCredential: () => "fixture-not-a-real-provider-key" });
  let adapter = await make();
  try {
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, actor_id: "local-user", title: "保留失败与草稿", directory });
    const request: AgentStartRequest = { ...owner, actor_id: "local-user", session, directory, task: "记住需求，不要把失败当成完成", role_id: "reader",
      role: { role_id: "reader", version: 7, execution: "read-only", host_tools: [], prompts: [{ prompt_id: "base", version: 2, layer: "base", body: "Report evidence, never invent success." }] } };
    const handle = await adapter.start(request);
    const before = await new Promise<Awaited<ReturnType<typeof adapter.read>>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SDK failed to settle rejected network request")), 10_000);
      let off = () => {};
      off = adapter.observe(handle.ref, view => {
        if (!["failed", "completed", "cancelled"].includes(view.phase)) return;
        clearTimeout(timer); queueMicrotask(() => off()); resolve(view);
      });
    });
    assert.equal(before.phase, "failed");
    await adapter.close(); adapter = await make();
    const restored = await adapter.readSession(session);
    assert.deepEqual(restored.owner, owner);
    assert.equal(restored.recovery, undefined);
    assert.deepEqual(restored.runs, [handle.ref]);
    assert.equal(restored.latest_run?.phase, "failed");
    assert.deepEqual(restored.latest_run?.frozen, handle.frozen);
    assert.deepEqual(restored.latest_run?.turns.map(t => [t.kind, t.text]), before.turns.map(t => [t.kind, t.text]));
    assert.equal(restored.latest_run?.stop_reason, before.stop_reason);
    assert.ok(before.ended_at);
    assert.equal(restored.latest_run?.ended_at, before.ended_at);
    assert.deepEqual(restored.latest_run?.turns, before.turns);
    assert.deepEqual(restored.latest_run?.activity, before.activity);
    await assert.rejects(adapter.control(handle.ref, { kind: "resume" }), /历史执行没有活动控制句柄/);
    const next = await adapter.start({ ...request, task: "这是明确的新一轮" });
    assert.notEqual(next.ref.run_id, handle.ref.run_id);
    assert.equal(next.ref.session_id, session.session_id);
    await adapter.control(next.ref, { kind: "cancel" });
    // A delayed stop aimed at an older run must not overwrite the newer run's
    // persisted start index with the old control closure's captured snapshot.
    // This older handle was restored and correctly refuses control.
    await assert.rejects(adapter.control(handle.ref, { kind: "stop" }), /历史执行没有活动控制句柄/);
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("incomplete SDK recovery remains readable but refuses a blind restart or stale control", async () => {
  let starts = 0;
  const ref = { run_id: "interrupted-run", session_id: "interrupted-session" };
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => { throw new Error("not used"); }, restore: async () => ({ title: "中断", owner,
      recovery: { required: true, reason: "结果未知，需要核对" }, runs: [{ ref, task: "原始要求", started_at: "2026-09-20T00:00:00Z",
        frozen: { role_id: "builder", role_version: 1, execution: "workspace-write", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null,
          directory: { canonical_path: "/tmp/original", realpath_verified: true } } }] }) },
    startAgentRun: async () => { starts++; throw new Error("must not start"); }, shutdown: async () => {},
  };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
  const session = { session_id: ref.session_id, runtime_id: "prologue" };
  const [first, second] = await Promise.all([adapter.readSession(session), adapter.readSession(session)]);
  assert.deepEqual(first, second);
  assert.equal(first.latest_run?.phase, "reconcile-required");
  assert.equal(first.latest_run?.ended_at, null);
  assert.equal(first.latest_run?.turns[0]?.text, "原始要求");
  await assert.rejects(adapter.start({ session } as AgentStartRequest), /结果未知/);
  await assert.rejects(adapter.control(ref, { kind: "stop" }), /历史执行没有活动控制句柄/);
  assert.equal(starts, 0);
});

test("durable interrupted prefix retains content, settled tools and one closed question without claiming a live stream", async () => {
  const ref = { run_id: "prefix-run", session_id: "prefix-session" };
  const frozen = { role_id: "builder", role_version: 1, execution: "workspace-write" as const, model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/original", realpath_verified: true } };
  const prefix: PrologueEvent[] = [
    { type: "prompt", role: "user", text: "原要求" },
    { type: "text-delta", text: "读取文件后再问你。" },
    { type: "tool-call", call: { id: "read-1", name: "read", input: { path: "README.md" } } },
    { type: "tool-result", callId: "read-1", name: "read", text: "真实文件内容", outcome: "returned" },
    { type: "tool-call", call: { id: "ask-1", name: "ask-user", input: { why: "是否执行测试？" } } },
    { type: "awaiting-input", pendingRef: { id: "question", revision: 1 }, kind: "text", why: "是否执行测试？" },
    { type: "text-delta", text: "已显示但尚未收尾的正文。" },
    { type: "prompt", role: "user", text: "不要改动测试", steerId: "steer-1" },
  ];
  for (const closed of [false, true]) {
    const runtime: PrologueRuntimePort = {
      readPendingQuestion: async () => ({ pending_id: "question", pending_revision: 1, kind: "text", prompt: "是否执行测试？", options: [], allows_free_text: true, answerable: false, unavailable_reason: "等待已关闭" }),
      sessions: { create: async () => { throw new Error("unused"); }, restore: async () => ({ title: "原会话", owner,
        ...(closed ? {} : { recovery: { required: true as const, reason: "中断需核对" } }),
        runs: [{ ref, frozen, task: "原要求", started_at: "2026-09-20T00:00:00Z",
          original_questions: [{ pending_id: "question", pending_revision: 1, kind: "text", why: "是否执行测试？" }],
          events: [...prefix, ...(closed ? [
            { type: "run-recovered", atMs: 1789900000000, transcript: "durable-prefix", operations: [], questions: [{ ref: { id: "question", revision: 1 }, kind: "text", prompt: "是否执行测试？" }] },
            { type: "failed", error: { code: "RUN_INTERRUPTED", safeMessage: "Interrupted" } },
          ] as PrologueEvent[] : [])] }] }) },
      startAgentRun: async () => { throw new Error("must not replay"); }, shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
    try {
      const { latest_run: view } = await adapter.readSession({ session_id: ref.session_id, runtime_id: "prologue" });
      assert.equal(view?.phase, closed ? "failed" : "reconcile-required");
      assert.deepEqual(view?.turns.find(turn => turn.text === "不要改动测试")?.steer, { id: "steer-1", state: "unconfirmed" });
      assert.deepEqual(view?.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text), ["读取文件后再问你。", "已显示但尚未收尾的正文。"]);
      assert.equal(view?.activity.find(activity => activity.call_id === "read-1")?.state, "completed");
      assert.equal(view?.activity.find(activity => activity.call_id === "ask-1")?.state, "unknown");
      assert.equal(view?.awaiting_input.length, 1);
      assert.equal(view?.awaiting_input[0]?.answerable, false);
      assert.match(view!.usage.unavailable_reason!, /未完整/);
      if (closed) assert.match(view!.turns.at(-1)!.text, /已保存的正文/);
      await assert.rejects(adapter.control(ref, { kind: "resume" }), /历史执行没有活动控制句柄/);
    } finally { await adapter.close(); }
  }
});


test("replay maps user stop intent only after an actual SDK cancellation, never over completion or unknown work", async () => {
  for (const terminal of ["cancelled", "completed", "failed", "unknown"] as const) {
    const ref = { run_id: "stopped-run", session_id: "stopped-session" };
    const runtime: PrologueRuntimePort = {
      sessions: { create: async () => { throw new Error("unused"); }, restore: async () => ({ title: "停止", owner, runs: [{
        ref, task: "继续保留已发生的工作", started_at: "2026-09-20T00:00:00Z", stop_intent: "stopped",
        frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/original", realpath_verified: true } },
        ...(terminal === "unknown" ? {} : { events: [{ type: "text-delta", text: "已读到的正文" }, { type: terminal }] }),
      }] }) },
      startAgentRun: async () => { throw new Error("no replay execution"); }, shutdown: async () => {},
    };
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
    const view = await adapter.readSession({ session_id: ref.session_id, runtime_id: "prologue" });
    assert.equal(view.latest_run?.phase, terminal === "cancelled" ? "stopped" : terminal === "unknown" ? "reconcile-required" : terminal);
    if (terminal === "cancelled") assert.equal(view.latest_run?.stop_reason, "已停止");
  }
});


test("packed SDK: a late stop on an ended live handle preserves later attempts across restart", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-sdk-late-stop-"));
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.late-stop-test", appVersion: "0.1.0" }, storageRoot: join(root, "runtime"), modelConfiguration: async () => model, resolveCredential: () => "fixture-not-a-real-provider-key" });
  let adapter = await make();
  try {
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, actor_id: "user", title: "迟到停止", directory });
    const request: AgentStartRequest = { ...owner, actor_id: "user", session, directory, task: "保留每次失败", role_id: "reader", role: { role_id: "reader", version: 1, execution: "read-only", host_tools: [], prompts: [] } };
    const settle = (ref: { run_id: string; session_id: string }) => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("run did not end")), 10_000);
      let off = () => {};
      off = adapter.observe(ref, view => { if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { clearTimeout(timeout); queueMicrotask(() => off()); resolve(); } });
    });
    const first = await adapter.start(request); await settle(first.ref);
    const second = await adapter.start({ ...request, task: "第二轮不能被旧控制抹掉" }); await settle(second.ref);
    await adapter.control(first.ref, { kind: "stop" });
    await adapter.close(); adapter = await make();
    const restored = await adapter.readSession(session);
    assert.deepEqual(restored.runs, [first.ref, second.ref]);
    assert.equal(restored.recovery, undefined);
    assert.equal(restored.latest_run?.turns[0]?.text, "第二轮不能被旧控制抹掉");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

test("replay keeps original question order and does not invent missing event timestamps", async () => {
  const ref = { run_id: "ordered-run", session_id: "ordered-session" };
  const started = "2026-09-20T00:00:00.000Z";
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => { throw new Error("unused"); }, restore: async () => ({ title: "过期问题", owner, runs: [{
      ref, task: "请提问", started_at: started,
      frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/original", realpath_verified: true } },
      events: [
        { type: "prompt", role: "user", text: "请提问", atMs: Date.parse(started) },
        { type: "tool-call", call: { id: "ask", name: "ask-user" } },
        { type: "awaiting-input", pendingRef: { id: "question", revision: 1 }, kind: "text", why: "名称是什么？" },
        { type: "tool-result", callId: "ask", name: "ask-user", outcome: "failed", text: "expired" },
        { type: "text-delta", text: "未收到答案。" },
        { type: "completed" },
      ],
    }] }) },
    readPendingQuestion: async () => ({ pending_id: "question", pending_revision: 1, kind: "text", prompt: "名称是什么？", options: [], allows_free_text: true, answerable: false, unavailable_reason: "已过期" }),
    startAgentRun: async () => { throw new Error("must not execute history"); }, shutdown: async () => {},
  };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
  const view = await adapter.read(ref);
  assert.deepEqual(view.turns.map(turn => [turn.sequence, turn.at]), [[0, started], [3, null]]);
  assert.equal(view.activity[0]?.sequence, 1);
  assert.equal(view.activity[0]?.at, null);
  assert.equal(view.awaiting_input[0]?.sequence, 2, "reading the original Pending must preserve its event position");
  assert.equal(view.ended_at, null, "the recovery clock is not the original completion time");
});

for (const persistence of ["delayed", "failed"] as const) {
  test(`observation timing ${persistence}: keep SDK outcome and commit once before exposing completion`, async () => {
    let emit: (event: PrologueEvent) => void = () => {};
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const commit = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    let attempts = 0;
    let timing: PrologueRunTiming | undefined;
    let savedStart = "";
    const events: PrologueEvent[] = [];
    const ref = { run_id: "timed-run", session_id: "timed-session" };
    let frozenView: Awaited<ReturnType<PrologueAgentAdapter["start"]>>["frozen"];
    const runtime: PrologueRuntimePort = {
      sessions: { create: async () => ({ ref: { id: ref.session_id } }), restore: async () => ({ title: "timing", owner,
        runs: [{ ref, frozen: frozenView, started_at: savedStart, task: "read the actual result", events,
          ...(persistence === "delayed" ? { timing } : {}) }] }) },
      saveRunTiming: async (run, value) => { assert.deepEqual(run, ref); attempts++; timing = structuredClone(value); await commit; },
      startAgentRun: async input => {
        savedStart = input.provenance.started_at;
        return { run: { ref: { id: ref.run_id }, subscribe: listener => { emit = event => { events.push(event); listener(event); }; return () => {}; }, cancel: async () => {} },
          control: { state: "running", stop: () => {}, pause: () => {}, resume: () => {}, steer: () => {}, subscribe: () => () => {} } };
      }, shutdown: async () => {},
    };
    let clock = Date.parse("2026-09-20T00:00:00Z");
    const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model, now: () => new Date(clock += 1000) });
    const directory = { canonical_path: "/tmp/timing", realpath_verified: true };
    const session = await adapter.createSession({ ...owner, actor_id: "user", title: "timing", directory });
    const handle = await adapter.start({ ...owner, actor_id: "user", session, directory, task: "read the actual result", role_id: "reader",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: [], prompts: [] } });
    frozenView = handle.frozen;
    emit({ type: "text-delta", text: "Reading " });
    emit({ type: "text-delta", text: "now." });
    emit({ type: "tool-call", call: { id: "read-1", name: "read-file", input: { path: "src/cart.ts" } } });
    emit({ type: "tool-result", callId: "read-1", name: "read-file", text: "actual source", outcome: "returned" });
    emit({ type: "text-delta", text: "Here is the result." });
    emit({ type: "completed" });
    const holding = await adapter.read(handle.ref);
    assert.equal(holding.phase, "running");
    assert.equal(holding.ended_at, null);
    assert.match(holding.stop_reason!, /正在保存显示时间/);
    assert.equal(holding.activity[0]?.output, "actual source");
    if (persistence === "delayed") finish(); else fail(new Error("private storage details must not escape"));
    const final = await new Promise<Awaited<ReturnType<typeof adapter.read>>>(resolve => {
      let off = () => {};
      off = adapter.observe(handle.ref, view => { if (view.phase === "completed") { queueMicrotask(() => off()); resolve(view); } });
    });
    assert.equal(attempts, 1);
    assert.ok(final.ended_at);
    assert.equal(final.turns[1]?.at, holding.turns[1]?.at);
    assert.deepEqual(timing?.turns, final.turns.map(({ turn_id, at }) => ({ turn_id, at })));
    if (persistence === "failed") {
      assert.match(final.stop_reason!, /显示时间未能保存/);
      assert.doesNotMatch(final.stop_reason!, /private storage/);
    }
    await adapter.close();
    const restoredAdapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
    const restored = (await restoredAdapter.readSession(session)).latest_run!;
    assert.equal(restored.phase, "completed");
    assert.deepEqual(restored.turns.map(t => t.text), final.turns.map(t => t.text));
    assert.equal(restored.ended_at, persistence === "delayed" ? final.ended_at : null);
    if (persistence === "delayed") {
      assert.deepEqual(restored.turns, final.turns);
      assert.deepEqual(restored.activity, final.activity);
    }
    assert.equal(attempts, 1, "replay must not save new observation times");
    await restoredAdapter.close();
  });
}

test("closing an inspected interruption refreshes the same session, excludes concurrent work and preserves failure", async () => {
  const ref = { run_id: "interrupted-close", session_id: "same-session" };
  let closed = false, calls = 0;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const atClose = new Promise<void>(resolve => { entered = resolve; });
  const frozen = { role_id: "builder", role_version: 1, execution: "workspace-write" as const, model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/original", realpath_verified: true } };
  const report = { session_id: ref.session_id, blockers: [], runs: [{ run_id: ref.run_id, version: 1, live: false, waiting: 0, can_close: true, blockers: [], operations: [] }] };
  const runtime: PrologueRuntimePort = {
    readPendingQuestion: async () => ({ pending_id: "question", pending_revision: 1, kind: "text", prompt: "是否执行测试？", options: [], allows_free_text: true, answerable: false, unavailable_reason: "原执行者已离线" }),
    recovery: { inspect: async () => report, close: async (_session, id, version) => {
      calls++; assert.equal(id, ref.run_id); assert.equal(version, 1); entered(); await held; closed = true;
      return { ...report, runs: [] };
    } },
    sessions: { create: async () => { throw new Error("unused"); }, restore: async () => ({ title: "原会话", owner,
      ...(closed ? {} : { recovery: { required: true as const, reason: "需要核对" } }),
      runs: [{ ref, frozen, original_questions: [{ pending_id: "question", pending_revision: 1, kind: "text", why: "是否执行测试？" }], task: "原要求", started_at: "2026-09-20T00:00:00Z", ...(closed ? { events: [
        { type: "run-recovered", atMs: 1789900000000, transcript: "opening-only", operations: [{ summary: "修改 cart.mjs", outcome: "completed" }] },
        { type: "failed", error: { code: "RUN_INTERRUPTED", safeMessage: "Interrupted" } },
      ] as PrologueEvent[] } : {}) }] }) },
    startAgentRun: async () => { throw new Error("must not replay"); }, shutdown: async () => {},
  };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => model });
  const session = { session_id: ref.session_id, runtime_id: "prologue" };
  try {
    assert.equal((await adapter.readSession(session)).latest_run?.phase, "reconcile-required");
    assert.equal((await adapter.read(ref)).awaiting_input[0]?.answerable, false);
    assert.equal((await adapter.read(ref)).awaiting_input[0]?.prompt, "是否执行测试？");
    await assert.rejects(adapter.recovery!.close(session, "another-run", 1), /不属于/);
    const closing = adapter.recovery!.close(session, ref.run_id, 1);
    await atClose;
    await assert.rejects(adapter.recovery!.close(session, ref.run_id, 1), /仍在执行/);
    await assert.rejects(adapter.start({ session } as AgentStartRequest), /需要核对/);
    release(); await closing;
    const view = await adapter.readSession(session);
    assert.equal(view.recovery, undefined);
    assert.equal(view.latest_run?.phase, "failed");
    assert.equal(view.latest_run?.turns[0]?.text, "原要求");
    assert.match(view.latest_run!.turns[1]!.text, /已执行：修改 cart.mjs/);
    assert.equal(view.latest_run!.turns[1]!.kind, "notice");
    assert.match(view.latest_run!.usage.unavailable_reason!, /中断/);
    assert.equal(view.latest_run?.ended_at, null, "恢复时刻不能冒充原执行结束时刻");
    assert.equal((await adapter.read(ref)).awaiting_input[0]?.prompt, "是否执行测试？");
    assert.equal(calls, 1);
  } finally { release(); await adapter.close(); }
});
