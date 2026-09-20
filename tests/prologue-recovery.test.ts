import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPrologueNodeAdapter, PrologueAgentAdapter, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { board_id: "recovery-board", plugin_id: "io.molis.work.coding", install_id: "recovery-install" };
const model = { protocol: "anthropic-compatible", endpoint: "https://127.0.0.1:1/v1/messages", model: "offline-fixture", credential_ref: "fixture" };

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
