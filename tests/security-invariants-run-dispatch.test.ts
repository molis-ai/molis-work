import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { AgentReviewQueue, createCommandDispatchGuard, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
type NodeHostModule = {
  createNodeHost(options?: { beforeCommandDispatch?: ReturnType<typeof createCommandDispatchGuard> }): {
    declareSandbox(input: { posture: "workspace-write" }): Promise<void>;
    authorizeRoot(input: { path: string }): Promise<{ readonly ref: { readonly kind: "authorized-root"; readonly id: string; readonly revision: number } }>;
    runCommand(input: {
      commandId?: string;
      rootRef: { readonly kind: "authorized-root"; readonly id: string; readonly revision: number };
      executable: string;
      argv: readonly string[];
      cwd: string;
      envAllowlist: readonly string[];
      timeoutMs: number;
    }): Promise<{ exitCode: number; stdout: string; stderr: string; truncated: boolean; timedOut: boolean; cancelled: boolean }>;
    startBackgroundCommand(input: {
      commandId?: string;
      rootRef: { readonly kind: "authorized-root"; readonly id: string; readonly revision: number };
      executable: string;
      argv: readonly string[];
      cwd: string;
      envAllowlist: readonly string[];
      timeoutMs: number;
    }): Promise<{ commandId: string }>;
    openInteractive(input: {
      commandId?: string;
      rootRef: { readonly kind: "authorized-root"; readonly id: string; readonly revision: number };
      executable: string;
      argv: readonly string[];
      cwd: string;
      envAllowlist: readonly string[];
      timeoutMs: number;
    }): Promise<{ sessionId: string }>;
    closeInteractive(sessionId: string): Promise<void>;
    cancelCommand(commandId: string): Promise<boolean>;
    closeStorage(): Promise<void>;
  };
};
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node")) as NodeHostModule;

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

test("APR-07/08/11: the original command is reused across rounds and restart; changed argv stays pending", { timeout: 65_000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "molis-command-permission-")));
  const owner = { project_id: "project", plugin_id: "fixture.coding", install_id: "fixture", actor_id: "person" };
  const directory = { canonical_path: root, realpath_verified: true };
  const output = "original-output";
  const pending = [{ name: "run-command", input: { executable: "node", argv: ["-e", "require('node:fs').appendFileSync('receipt.txt', 'ran\\n')"] } }];
  let send = true, directoryAvailable = true, waitDispatch = false, waiting = false;
  const barrier = deferred();
  t.mock.method(globalThis, "fetch", async () => {
    if (send) { send = false; return cogniaScriptedResponse(pending[0]); }
    return cogniaScriptedResponse(undefined, "Finished checking the command receipt.");
  });
  const check = () => { if (!directoryAvailable) throw new Error("original directory revoked"); };
  const make = async () => {
    const queue = new AgentReviewQueue();
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.command-permission", appVersion: "1.0.0" },
      storageRoot: join(root, "runtime"), reviewQueue: queue,
      checks: { holdCommandWorkspace: async (project, id, path) => {
        assert.deepEqual([project, id, path], [owner.project_id, output, root]);
        check();
        return { assertCurrent: check, beforeEffect: check };
      } },
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "test-only" });
    return { queue, adapter };
  };
  let { adapter, queue } = await make();
  t.after(async () => { barrier.resolve(); await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const session = await adapter.createSession({ ...owner, directory, title: "Original Coding session" });
  const subject = { kind: "work" as const, actor_id: owner.actor_id, project_id: owner.project_id,
    work: { owner_id: owner.plugin_id, id: session.session_id },
    executor: { plugin_id: owner.plugin_id, install_id: owner.install_id, role_id: "worker", installation_generation: "original" } };
  const start = async (beforeDispatch?: () => Promise<void>) => {
    send = true;
    return adapter.start({ ...owner, session, directory, role_id: "worker", task: "Run the specified local fixture.", budget: { max_turns: 2 },
      role: { role_id: "worker", version: 1, execution: "workspace-write", prompts: [], host_tools: ["run-command"],
        directories: { output, inputs: [], directories_revision: "original", execution: { kind: "output" } } } }, {
      delegation: { subject, session_owner_id: owner.project_id }, beforeDispatch,
    });
  };
  const settle = (run: Awaited<ReturnType<typeof start>>) => until(async () => {
    const view = await adapter.read(run.ref);
    return ["completed", "failed", "cancelled", "stopped"].includes(view.phase) ? view : undefined;
  }, "the original command round did not settle");
  const proposal = (run: Awaited<ReturnType<typeof start>>) => until(async () => queue.list(owner.project_id, "pending").find(row =>
    row.run?.run_id === run.ref.run_id && queue.hasExactPermission(row.review_id)), "no live original command candidate");
  const first = await start(), review = await proposal(first);
  await assert.rejects(readFile(join(root, "receipt.txt")), { code: "ENOENT" });
  const held = queue.exactPermission(review.review_id, review.reference.version)!;
  assert.equal(held.scope.kind, "command-exact");
  assert.deepEqual(held.subject, subject);
  const previous = (await adapter.delegations.read(subject))!;
  const control = { assertCurrent: held.assertPending, beforeEffect: held.beforeEffect };
  const selected = await adapter.delegations.grant(subject, { expected_version: previous.storage_version, mode: "automatic",
    scopes: [held.scope], expires_at: null }, control);
  await settle(first);
  await assert.rejects(readFile(join(root, "receipt.txt")), { code: "ENOENT" });

  for (const restart of [false, true]) {
    if (restart) { await adapter.close(); ({ adapter, queue } = await make()); }
    const run = await start();
    await settle(run); await queue.refresh(owner.project_id);
    const actual = queue.list(owner.project_id).find(row => row.run?.run_id === run.ref.run_id);
    assert.ok(actual);
    const receipt = queue.receipt(actual.review_id);
    assert.equal(receipt?.source?.kind, "delegation", JSON.stringify(receipt));
    if (receipt.source?.kind === "delegation") assert.equal(receipt.source.delegation.id, selected.selection_id);
    assert.equal(await readFile(join(root, "receipt.txt"), "utf8"), "ran\n".repeat(restart ? 2 : 1));
  }

  const originalArgs = pending[0]!.input.argv;
  pending[0]!.input.argv = ["-e", "require('node:fs').writeFileSync('different.txt', 'new input')"];
  const different = await start(), differentReview = await proposal(different);
  await assert.rejects(readFile(join(root, "different.txt")), { code: "ENOENT" });
  await queue.respond({ review_id: differentReview.review_id, version: differentReview.reference.version, actor_id: owner.actor_id, decision: "reject" });
  await settle(different);
  pending[0]!.input.argv = originalArgs;
  waitDispatch = true;
  const same = await start(async () => {
    const row = queue.list(owner.project_id).at(-1);
    if (waitDispatch && row && queue.receipt(row.review_id)?.source?.kind === "delegation") {
      waiting = true;
      await barrier.promise;
    }
  });
  await until(async () => waiting ? true : undefined, "authorized command did not reach the dispatch boundary");
  directoryAvailable = false;
  barrier.resolve();
  await settle(same);
  assert.equal(await readFile(join(root, "receipt.txt"), "utf8"), "ran\nran\n", "loss of the exact directory at the final wait prevents a new process");
});

type GuardStore = Parameters<typeof createCommandDispatchGuard>[0];
type GuardControl = NonNullable<ReturnType<GuardStore["getStore"]>>;

async function commandBoundary(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "molis-node-dispatch-")));
  const guards: GuardStore = new AsyncLocalStorage<GuardControl>();
  const host = createNodeHost({ beforeCommandDispatch: createCommandDispatchGuard(guards) });
  await host.declareSandbox({ posture: "workspace-write" });
  const { ref: rootRef } = await host.authorizeRoot({ path: root });
  t.after(async () => {
    await host.closeStorage().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const marker = join(root, "ran.txt");
  const request = {
    commandId: "original-command",
    rootRef,
    executable: "node",
    argv: ["-e", "require('node:fs').appendFileSync('ran.txt','ok\\n')"],
    cwd: ".",
    envAllowlist: ["PATH"] as readonly string[],
    timeoutMs: 5000,
  };
  return { root, marker, guards, host, rootRef, request };
}

test("APR-11: a single command cancelled before it has a pid cannot spawn after preparation", async t => {
  const f = await commandBoundary(t);
  const entered = deferred();
  const release = deferred();
  const roundLive = true;
  const control: GuardControl = {
    assertCurrent() {
      assert.equal(roundLive, true);
    },
    beforeEffect: async () => {
      entered.resolve();
      await release.promise;
    },
  };
  const result = f.guards.run(control, () => f.host.runCommand(f.request));
  const refused = assert.rejects(result, { code: "CANCELLED" });
  await entered.promise;
  assert.equal(await f.host.cancelCommand(f.request.commandId), true, "the real NodeHost cancels the preparing command before spawn");
  assert.equal(roundLive, true, "single-call timeout does not stop the whole Run");
  release.resolve();
  await refused;
  await assert.rejects(readFile(f.marker, "utf8"), { code: "ENOENT" });
  const ok = await f.guards.run(control, () => f.host.runCommand(f.request));
  assert.equal(ok.exitCode, 0);
  assert.equal(await readFile(f.marker, "utf8"), "ok\n", "the completed preparation retains no cancellation entry");
});

test("APR-11: cancellation belongs to the original command; duplicate and missing ids cannot share preparation", async t => {
  const f = await commandBoundary(t);
  const entered = deferred();
  const release = deferred();
  const control: GuardControl = {
    assertCurrent() {},
    beforeEffect: async () => {
      entered.resolve();
      await release.promise;
    },
  };
  const original = f.guards.run(control, () => f.host.runCommand(f.request));
  await entered.promise;
  await assert.rejects(f.guards.run(control, () => f.host.runCommand(f.request)), { code: "COMMAND_DENIED" });
  await assert.rejects(f.guards.run(control, () => f.host.runCommand({ ...f.request, commandId: undefined })), { code: "agent.review_not_permitted" });
  await f.host.cancelCommand("another-command");
  release.resolve();
  const completed = await original;
  assert.equal(completed.exitCode, 0);
  assert.equal(await readFile(f.marker, "utf8"), "ok\n");
  await assert.rejects(f.host.runCommand({ ...f.request, commandId: "without-control" }), { code: "agent.review_not_permitted" });
  assert.equal(await readFile(f.marker, "utf8"), "ok\n");
});

test("APR-11: replacement async context cannot rescue an old command after its authority changed", async t => {
  const f = await commandBoundary(t);
  const entered = deferred();
  const release = deferred();
  let active = true;
  const old: GuardControl = {
    assertCurrent() {
      if (!active) throw new Error("old authority revoked");
    },
    beforeEffect: async () => {
      entered.resolve();
      await release.promise;
    },
  };
  const result = f.guards.run(old, () => f.host.runCommand(f.request));
  const refused = assert.rejects(result, /old authority revoked/);
  await entered.promise;
  active = false;
  await f.guards.run({ beforeEffect() {}, assertCurrent() {} }, async () => {
    release.resolve();
    await refused;
  });
  await assert.rejects(readFile(f.marker, "utf8"), { code: "ENOENT" });
  const ok = await f.guards.run({ beforeEffect() {}, assertCurrent() {} }, () => f.host.runCommand(f.request));
  assert.equal(ok.exitCode, 0);
  assert.equal(await readFile(f.marker, "utf8"), "ok\n", "authority failure also releases only its own preparation entry");
});

test("APR-11: interactive spawns are fail-closed without control, with revoked non-stdio control, or with revoked stdio transport", async t => {
  const f = await commandBoundary(t);
  const interactiveMarker = join(f.root, "interactive.txt");
  const interactiveRequest = {
    rootRef: f.rootRef,
    executable: "node",
    argv: ["-e", "require('node:fs').appendFileSync('interactive.txt','spawned\\n'); setTimeout(() => {}, 5000);"],
    cwd: ".",
    envAllowlist: ["PATH"] as readonly string[],
    timeoutMs: 5000,
  };

  // 1. Missing control must fail closed (never fall through to open spawn).
  await assert.rejects(f.host.openInteractive(interactiveRequest), { code: "agent.review_not_permitted" });
  await assert.rejects(readFile(interactiveMarker, "utf8"), { code: "ENOENT" });

  // 2. Non-stdio control whose beforeEffect or post-await assertCurrent fails must refuse before spawn.
  let live = true;
  const nonStdioRevoked: GuardControl = {
    assertCurrent() {
      if (!live) throw new Error("non-stdio interactive revoked");
    },
    async beforeEffect() {
      live = false;
    },
  };
  await assert.rejects(f.guards.run(nonStdioRevoked, () => f.host.openInteractive(interactiveRequest)), /non-stdio interactive revoked/);
  await assert.rejects(readFile(interactiveMarker, "utf8"), { code: "ENOENT" });

  // 3. Stdio MCP maintenance control still runs dual synchronous fence and rejects when transport is revoked.
  const stdioRevoked: GuardControl = {
    assertCurrent() {},
    beforeEffect() {},
    mcp: {
      maintenance: {
        kind: "stdio",
        source: "test-mcp",
        connection: "conn-1",
        control: {
          assertCurrent() {
            throw new Error("stdio transport revoked");
          },
          beforeEffect() {},
        },
      },
    },
  };
  await assert.rejects(f.guards.run(stdioRevoked, () => f.host.openInteractive(interactiveRequest)), /stdio transport revoked/);
  await assert.rejects(readFile(interactiveMarker, "utf8"), { code: "ENOENT" });

  // 4. Valid control allows interactive spawn and cleanly closes it.
  let beforeEffectCalls = 0;
  const activeControl: GuardControl = {
    assertCurrent() {},
    beforeEffect() {
      beforeEffectCalls += 1;
    },
  };
  const opened = await f.guards.run(activeControl, () => f.host.openInteractive(interactiveRequest));
  t.after(() => f.host.closeInteractive(opened.sessionId));
  assert.equal(beforeEffectCalls, 1);
  await f.host.closeInteractive(opened.sessionId);
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
