import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentReviewQueue, createPrologueNodeAdapter, PrologueAgentAdapter } from "@molis-ai/molis-work-service-agent-host";
import { composeAgentHost, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses, storageOwnerResources } from "./fixtures/home-storage-owner.js";

const app = { appId: "io.molis.work", appVersion: "0.0.0" };
const noModel = async (): Promise<never> => { throw new Error("Cleanup tests must not call a model"); };

function home(t: TestContext, finish: () => Promise<void>) {
  t.after(finish);
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t);
  const directory = mkdtempSync(join(tmpdir(), "agent-initialization-cleanup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, root: join(directory, "agent-runtime"), peers, resources };
}

/** Fail after real MCP subscription and one real review subscription; both keep their production cleanup callbacks. */
function failurePorts() {
  const initializationFailure = new Error("Initialization refused after MCP and review subscriptions");
  const cleanupFailure = new Error("MCP unsubscribe temporarily refused");
  const state = { initializationFails: true, cleanupFailures: 1, subscriptions: 0, unsubscribes: 0, refreshes: 0, detached: 0 };
  const subscribeMcpConnections = () => {
    state.subscriptions++;
    return () => {
      state.unsubscribes++;
      if (state.cleanupFailures > 0) { state.cleanupFailures--; throw cleanupFailure; }
    };
  };
  const install = (queue: AgentReviewQueue) => {
    const register = queue.registerRefresh.bind(queue);
    queue.registerRefresh = handler => {
      state.refreshes++;
      if (state.initializationFails && state.refreshes === 2) throw initializationFailure;
      const detach = register(handler);
      return () => { state.detached++; detach(); };
    };
    return queue;
  };
  const initialError = (error: unknown) => error instanceof AggregateError
    && error.errors.length === 2 && error.errors[0] === initializationFailure && error.errors[1] === cleanupFailure;
  return { state, subscribeMcpConnections, install, initialError, cleanupFailure };
}

test("RAC-105-A-11: failed initialization keeps a retryable handle, returns only its borrow, and skips completed cleanup", { timeout: 30_000 }, async t => {
  const fault = failurePorts();
  let initialization: ReturnType<typeof createPrologueNodeAdapter> | undefined, normal: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  const f = home(t, async () => { fault.state.cleanupFailures = 0; await initialization?.close(); await normal?.close(); });
  const owner = f.resources.acquire(f.root), peer = await f.peers.start(f.root);
  const inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino;
  initialization = createPrologueNodeAdapter({ app, storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel,
    subscribeMcpConnections: fault.subscribeMcpConnections, reviewQueue: fault.install(new AgentReviewQueue()) });
  await assert.rejects(initialization, fault.initialError);
  assert.equal(fault.state.subscriptions, 1);
  assert.equal(fault.state.unsubscribes, 1);
  assert.equal(fault.state.detached, 1, "the successfully cleaned review subscription is observable");
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  const close = initialization.close();
  assert.equal(initialization.close(), close, "concurrent explicit cleanup shares this attempt");
  await close;
  assert.equal(fault.state.unsubscribes, 2, "the failed real MCP unsubscribe was retried");
  assert.equal(fault.state.detached, 1, "completed cleanup was not repeated");
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "returning the borrow leaves its parent live");
  normal = await createPrologueNodeAdapter({ app, storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel });
  await normal.close(); owner.release();
  const acquired = await peer.request("acquire");
  assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
  const next = f.resources.acquire(f.root); next.release();
});

test("RAC-105-A-11: repeated initialization cleanup failure retains an independent owner until actual recovery", { timeout: 30_000 }, async t => {
  const fault = failurePorts(); fault.state.cleanupFailures = 2;
  let initialization: ReturnType<typeof createPrologueNodeAdapter> | undefined, normal: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  const f = home(t, async () => { fault.state.cleanupFailures = 0; await initialization?.close(); await normal?.close(); });
  const peer = await f.peers.start(f.root);
  initialization = createPrologueNodeAdapter({ app, storageRoot: f.root, modelConfiguration: noModel,
    subscribeMcpConnections: fault.subscribeMcpConnections, reviewQueue: fault.install(new AgentReviewQueue()) });
  await assert.rejects(initialization, fault.initialError);
  const inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino;
  await assert.rejects(initialization.close(), error => error instanceof AggregateError && error.errors[0] === fault.cleanupFailure);
  assert.equal(fault.state.unsubscribes, 2); assert.equal(fault.state.detached, 1);
  assert.throws(() => acquireStorageOwner(f.root), { code: "storage.owner.busy" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await assert.rejects(createPrologueNodeAdapter({ app, storageRoot: f.root, modelConfiguration: noModel }), { code: "agent.storage_busy" });
  const recovered = initialization.close(); assert.equal(initialization.close(), recovered); await recovered;
  assert.equal(fault.state.unsubscribes, 3); assert.equal(fault.state.detached, 1);
  const acquired = await peer.request("acquire");
  assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
  normal = await createPrologueNodeAdapter({ app, storageRoot: f.root, modelConfiguration: noModel });
  await normal.close(); const next = f.resources.acquire(f.root); next.release();
});

test("RAC-105-A-11: normal close retry does not repeat a successful MCP unsubscribe", { timeout: 30_000 }, async t => {
  const original = PrologueAgentAdapter.prototype.close, failure = new Error("close acknowledgement temporarily refused");
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined, attempts = 0, unsubscribes = 0;
  const f = home(t, async () => { PrologueAgentAdapter.prototype.close = original; await adapter?.close(); });
  PrologueAgentAdapter.prototype.close = async function () { await original.call(this); if (++attempts === 1) throw failure; };
  const owner = f.resources.acquire(f.root), peer = await f.peers.start(f.root);
  adapter = await createPrologueNodeAdapter({ app, storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel,
    subscribeMcpConnections: () => () => { unsubscribes++; } });
  await assert.rejects(adapter.close(), error => error === failure);
  assert.equal(unsubscribes, 1);
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  const retry = adapter.close(); assert.equal(adapter.close(), retry); await retry;
  assert.equal(unsubscribes, 1); owner.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("RAC-105-A-12: Host close retries rejected initialization before releasing the Home owner", { timeout: 30_000 }, async t => {
  const fault = failurePorts(); fault.state.cleanupFailures = 2;
  let host: MolisWorkLocalHost | undefined;
  const f = home(t, async () => { fault.state.cleanupFailures = 0; await host?.close(); });
  host = new MolisWorkLocalHost({ completeText: null });
  const service = host.ensureAgentService(f.directory, owner => composeAgentHost({ localHost: host!, homeDirectory: f.directory, workspaceFor: () => null,
    prologue: { storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel, subscribeMcpConnections: fault.subscribeMcpConnections } }));
  fault.install(service.agentHost.reviews);
  const ready = service.ready; assert.equal(service.ready, ready);
  await assert.rejects(ready, fault.initialError);
  const peer = await f.peers.start(f.root), inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino;
  await assert.rejects(host.close(), error => error instanceof AggregateError && error.errors[0] === fault.cleanupFailure);
  assert.equal(fault.state.unsubscribes, 2); assert.equal(fault.state.subscriptions, 1); assert.equal(fault.state.detached, 1);
  assert.throws(() => acquireStorageOwner(f.root), { code: "storage.owner.busy" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await assert.rejects(service.ready, /Agent 服务已关闭/);
  const close = host.close(); assert.equal(host.close(), close); await close;
  assert.equal(fault.state.unsubscribes, 3); assert.equal(fault.state.detached, 1);
  const acquired = await peer.request("acquire");
  assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
  host = new MolisWorkLocalHost({ completeText: null });
  const next = host.ensureAgentService(f.directory, owner => composeAgentHost({ localHost: host!, homeDirectory: f.directory, workspaceFor: () => null,
    prologue: { storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel } }));
  await next.ready; await host.close();
  const owner = f.resources.acquire(f.root); owner.release();
});

test("RAC-105-A-12: an explicit Host ready retry cleans the old instance before creating exactly one replacement", { timeout: 30_000 }, async t => {
  const fault = failurePorts();
  let service: ReturnType<typeof composeAgentHost> | undefined, host: MolisWorkLocalHost | undefined;
  const f = home(t, async () => { fault.state.cleanupFailures = 0; await service?.dispose(); await host?.close(); });
  const owner = f.resources.acquire(f.root), peer = await f.peers.start(f.root);
  host = new MolisWorkLocalHost({ completeText: null });
  service = composeAgentHost({ localHost: host, homeDirectory: f.directory, workspaceFor: () => null,
    prologue: { storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel, subscribeMcpConnections: fault.subscribeMcpConnections } });
  fault.install(service.agentHost.reviews);
  await assert.rejects(service.ready, fault.initialError);
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  fault.state.initializationFails = false;
  const ready = service.ready; assert.equal(service.ready, ready); await ready;
  assert.equal(fault.state.subscriptions, 2); assert.equal(fault.state.unsubscribes, 2); assert.equal(fault.state.detached, 1);
  assert.equal(service.agentHost.descriptors().filter(item => item.runtime_id === "prologue").length, 1);
  await service.dispose(); assert.equal(fault.state.unsubscribes, 3); owner.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("RAC-105-A-12: close during initialization waits for that instance and never registers it or releases early", { timeout: 30_000 }, async t => {
  const original = PrologueAgentAdapter.prototype.close;
  const entered = Promise.withResolvers<void>(), allowed = Promise.withResolvers<void>();
  let service: ReturnType<typeof composeAgentHost> | undefined, host: MolisWorkLocalHost | undefined, disposal: Promise<void> | undefined;
  let subscriptions = 0, unsubscribes = 0;
  const f = home(t, async () => { allowed.resolve(); PrologueAgentAdapter.prototype.close = original; await service?.dispose(); await host?.close(); });
  PrologueAgentAdapter.prototype.close = async function () { entered.resolve(); await allowed.promise; await original.call(this); };
  const owner = f.resources.acquire(f.root), peer = await f.peers.start(f.root);
  host = new MolisWorkLocalHost({ completeText: null });
  service = composeAgentHost({ localHost: host, homeDirectory: f.directory, workspaceFor: () => null,
    prologue: { storageRoot: f.root, storageOwner: owner, modelConfiguration: noModel, subscribeMcpConnections: () => {
      subscriptions++; disposal = service!.dispose(); return () => { unsubscribes++; };
    } } });
  const ready = service.ready; assert.equal(service.ready, ready);
  await entered.promise;
  await ready; // A start accepted before close retains its original settlement contract.
  assert.equal(service.dispose(), disposal); assert.equal(subscriptions, 1); assert.equal(unsubscribes, 0);
  assert.equal(service.agentHost.descriptors().some(item => item.runtime_id === "prologue"), false);
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await assert.rejects(service.ready, /Agent 服务已关闭/);
  allowed.resolve(); await disposal;
  assert.equal(unsubscribes, 1); owner.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});
