import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { AgentReviewQueue, createPrologueNodeAdapter, guardNodeDispatch, type ReviewDecisionControl } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function until<T>(read: () => Promise<T | undefined>, message: string): Promise<T> {
  for (const limit = Date.now() + 12_000; ;) {
    const result = await read(); if (result !== undefined) return result;
    assert.ok(Date.now() < limit, message); await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function fixture(t: TestContext, tool: "run-command" | "start-command", execution: AgentStartExecution) {
  const root = await mkdtemp(join(tmpdir(), "molis-run-dispatch-")), queue = new AgentReviewQueue();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => ++requests === 1
    ? cogniaScriptedResponse({ name: tool, input: { executable: "node", argv: ["-e", "require('node:fs').writeFileSync('effect.txt','executed')"] } })
    : cogniaScriptedResponse(undefined, "Finished checking the command receipt."));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.run-dispatch", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "fixture", actor_id: "person" }, directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Original dispatch" });
  const started = await adapter.start({ ...owner, session, directory, role_id: "worker", task: "Run the specified command once.", budget: { max_turns: 2 },
    role: { role_id: "worker", version: 1, execution: "workspace-write", prompts: [], host_tools: [tool] } }, execution);
  const review = await until(async () => queue.list(owner.project_id, "pending")[0], "command did not reach original SDK approval");
  assert.equal(review.kind, "command");
  return { root, queue, adapter, started, review,
    approve: () => queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: owner.actor_id }),
    settled: () => until(async () => { const view = await adapter.read(started.ref); return ["completed", "failed", "cancelled", "stopped"].includes(view.phase) ? view : undefined; }, "original run did not settle"),
  };
}

for (const tool of ["run-command", "start-command"] as const) {
  test(`APR-11: ${tool} retains its original authority across approval and the last dispatch await`, { timeout: 30_000 }, async t => {
    let active = true, armed = false, waiting = false; const release = deferred();
    t.after(() => release.resolve());
    const f = await fixture(t, tool, { assertBeforeDispatch: () => { if (!active) throw new Error("original authority revoked"); },
      beforeDispatch: async () => { if (armed) { waiting = true; await release.promise; } } });
    armed = true; const approval = await f.approve();
    await until(async () => waiting ? true : undefined, "no final dispatch authority check");
    await assert.rejects(readFile(join(f.root, "effect.txt")), { code: "ENOENT" });
    active = false; release.resolve(); await f.settled();
    await assert.rejects(readFile(join(f.root, "effect.txt")), { code: "ENOENT" });
    assert.equal(approval.status, "approved", "the refusal happened after the original human approval");
  });

  test(`APR-11: unchanged ${tool} still performs the approved real command`, { timeout: 30_000 }, async t => {
    const f = await fixture(t, tool, { beforeDispatch: async () => {}, assertBeforeDispatch: () => {} });
    await f.approve();
    const value = await until(async () => readFile(join(f.root, "effect.txt"), "utf8").catch(error => { if (error.code === "ENOENT") return undefined; throw error; }), "approved command never wrote its result");
    assert.equal(value, "executed"); await f.settled();
  });
}

test("APR-11: cancelling an approved background command during dispatch preparation never spawns it", { timeout: 30_000 }, async t => {
  let armed = false, waiting = false; const release = deferred();
  t.after(() => release.resolve());
  const f = await fixture(t, "start-command", { beforeDispatch: async () => { if (armed) { waiting = true; await release.promise; } } });
  armed = true; await f.approve();
  await until(async () => waiting ? true : undefined, "background dispatch did not reach its wait");
  await f.adapter.control(f.started.ref, { kind: "stop" });
  release.resolve(); await f.settled();
  await assert.rejects(readFile(join(f.root, "effect.txt")), { code: "ENOENT" });
});

function commandBoundary() {
  const calls: string[] = [], cancelled: string[] = [], guards = new AsyncLocalStorage<ReviewDecisionControl>();
  const original: Parameters<typeof guardNodeDispatch>[0] = {
    async runCommand(input) { calls.push(input.commandId!); return { exitCode: 0, stdout: "", stderr: "", truncated: false, timedOut: false, cancelled: false }; },
    async startBackgroundCommand(input) { calls.push(input.commandId!); return { commandId: input.commandId! }; },
    async cancelCommand(id) { cancelled.push(id); return false; },
  };
  const host = guardNodeDispatch(original, guards), request: Parameters<typeof host.runCommand>[0] = {
    commandId: "original-command", rootRef: { kind: "authorized-root", id: "original-root", revision: 1 }, executable: "node", argv: [], cwd: ".", envAllowlist: [], timeoutMs: 1000,
  };
  return { calls, cancelled, guards, host, request };
}

test("APR-11: a single command cancelled before it has a pid cannot spawn after preparation", async () => {
  const f = commandBoundary(), entered = deferred(), release = deferred(), roundLive = true;
  const control: ReviewDecisionControl = { assertCurrent() { assert.equal(roundLive, true); }, beforeEffect: async () => { entered.resolve(); await release.promise; } };
  const result = f.guards.run(control, () => f.host.runCommand(f.request));
  const refused = assert.rejects(result, { code: "CANCELLED" });
  await entered.promise;
  assert.equal(await f.host.cancelCommand(f.request.commandId!), false, "the process owner has not registered a pid yet");
  assert.equal(roundLive, true, "single-call timeout does not stop the whole Run");
  release.resolve(); await refused;
  assert.deepEqual(f.cancelled, [f.request.commandId]); assert.deepEqual(f.calls, []);
  await f.guards.run(control, () => f.host.runCommand(f.request));
  assert.deepEqual(f.calls, [f.request.commandId], "the completed preparation retains no cancellation entry");
});

test("APR-11: cancellation belongs to the original command; duplicate and missing ids cannot share preparation", async () => {
  const f = commandBoundary(), entered = deferred(), release = deferred();
  const control: ReviewDecisionControl = { assertCurrent() {}, beforeEffect: async () => { entered.resolve(); await release.promise; } };
  const original = f.guards.run(control, () => f.host.runCommand(f.request));
  await entered.promise;
  await assert.rejects(f.guards.run(control, () => f.host.runCommand(f.request)), { code: "agent.review_not_permitted" });
  await assert.rejects(f.guards.run(control, () => f.host.runCommand({ ...f.request, commandId: undefined })), { code: "agent.review_not_permitted" });
  await f.host.cancelCommand("another-command"); release.resolve(); await original;
  assert.deepEqual(f.calls, [f.request.commandId]);
  await assert.rejects(f.host.runCommand({ ...f.request, commandId: "without-control" }), { code: "agent.review_not_permitted" });
  assert.deepEqual(f.calls, [f.request.commandId]);
});

test("APR-11: replacement async context cannot rescue an old command after its authority changed", async () => {
  const f = commandBoundary(), entered = deferred(), release = deferred(); let active = true;
  const old: ReviewDecisionControl = { assertCurrent() { if (!active) throw new Error("old authority revoked"); }, beforeEffect: async () => { entered.resolve(); await release.promise; } };
  const result = f.guards.run(old, () => f.host.runCommand(f.request)), refused = assert.rejects(result, /old authority revoked/);
  await entered.promise; active = false;
  await f.guards.run({ beforeEffect() {}, assertCurrent() {} }, async () => { release.resolve(); await refused; });
  assert.deepEqual(f.calls, []);
  await f.guards.run({ beforeEffect() {}, assertCurrent() {} }, () => f.host.runCommand(f.request));
  assert.deepEqual(f.calls, [f.request.commandId], "authority failure also releases only its own preparation entry");
});

test("APR-11: an async final Run fence is refused before a model request", { timeout: 20_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-run-sync-fence-")); let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return cogniaScriptedResponse(); });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.run-sync-fence", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "fixture", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Bad final fence" });
  const handle = await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", task: "Say done", role: {
    role_id: "reader", version: 1, workspace: "none", execution: "read-only", prompts: [], host_tools: [] } }, { assertBeforeDispatch: async () => {} });
  const failed = await until(async () => { const view = await adapter.read(handle.ref); return view.phase === "failed" ? view : undefined; }, "asynchronous authority was not refused");
  assert.match(failed.stop_reason ?? "", /EFFECT_NOT_AUTHORIZED/);
  assert.equal(requests, 0);
});
