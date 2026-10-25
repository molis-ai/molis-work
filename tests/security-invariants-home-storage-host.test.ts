import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Server } from "node:http";
import { MolisWorkLocalHost, LocalHost, HomePluginHost, ensureSystemAgentService, captureHostLog, hostLog, type HomeInitializationFailure } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost, openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PrologueAgentAdapter } from "@molis-ai/molis-work-service-agent-host";
import { deferred, homeProbe } from "./fixtures/home-runtime.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import { homeStorageTree, homeBusinessTree, runtimeBusinessEntries } from "./fixtures/home-storage-files.js";
import { homeContextHost } from "./fixtures/home-context-host.js";

test("RAC-105-A-07: an idle Host owns its Home before Agent startup; an offline process and Host exclude each other in both orders", { timeout: 60_000 }, async t => {
  const hosts: MolisWorkLocalHost[] = [];
  t.after(async () => { for (const host of hosts) await host.close(); });
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-owner-host-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, "agent-runtime"), first = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); hosts.push(first);
  ensureSystemAgentService(first, home, withMolisWorkProjectCatalog);
  assert.deepEqual(runtimeBusinessEntries(root), [], "a lazy Host creates no SDK storage/key beyond the owner lock and SQLite sidecars");
  const inode = statSync(join(root, ".molis-runtime-owner.db")).ino, peer = await peers.start(root), original = homeStorageTree(home);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  assert.deepEqual(homeStorageTree(home), original, "refusal does not touch any business or backup bytes");
  await first.close();
  assert.equal((await peer.request("acquire")).state, "held");
  const offline = homeStorageTree(home);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
  assert.deepEqual(homeStorageTree(home), offline);
  await peer.stop();
  const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); hosts.push(restarted);
  await restarted.close();
  assert.equal(statSync(join(root, ".molis-runtime-owner.db")).ino, inode);
});

test("RAC-105-A-07: a Host without a Home must acquire ownership before a later catalog or service binding", { timeout: 30_000 }, async t => {
  const host = new MolisWorkLocalHost({ completeText: null }); t.after(() => host.close());
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-owner-late-home-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const peer = await peers.start(join(home, "agent-runtime"));
  await peer.request("acquire"); const original = homeStorageTree(home);
  assert.throws(() => host.ensureWebCatalog(home, openMolisWorkProjectCatalog), { code: "storage.owner.busy" });
  assert.throws(() => ensureSystemAgentService(host, home, withMolisWorkProjectCatalog), { code: "storage.owner.busy" });
  assert.deepEqual(homeStorageTree(home), original);
  await peer.stop();
  const access = host.ensureWebCatalog(home, openMolisWorkProjectCatalog);
  await access.warm();
  assert.deepEqual(await access.withCatalog({ homeDirectory: home }, catalog => catalog.listProjects()), []);
  const other = join(home, "other");
  assert.throws(() => ensureSystemAgentService(host, other, withMolisWorkProjectCatalog), { code: "actions.home_mismatch" });
});

test("RAC-105-A-08: concurrent plugin and Host closes wait for the real stop hook before relinquishing the Home", { timeout: 60_000 }, async t => {
  const entered = deferred(), finish = deferred(), probe = homeProbe("ownerstop");
  let host: MolisWorkLocalHost | undefined;
  t.after(async () => { finish.resolve(); await host?.close(); });
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-owner-stop-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [probe.definition] } });
  await host.homePlugins!.ready();
  probe.behavior.stop = async () => { entered.resolve(); await finish.promise; };
  const peer = await peers.start(join(home, "agent-runtime"));
  const pluginsClosing = host.homePlugins!.close(); await entered.promise;
  assert.equal(host.homePlugins!.close(), pluginsClosing);
  let closed = false; const closing = host.close().then(() => { closed = true; });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  assert.equal(closed, false);
  finish.resolve(); await Promise.all([pluginsClosing, closing]);
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
  assert.equal(probe.stopped.length, 1);
});

test("RAC-105-A-08: a Host retains ownership after its SDK fails to close and retries the actual adapter only explicitly", { timeout: 60_000 }, async t => {
  let host: MolisWorkLocalHost | undefined;
  t.after(async () => { await host?.close(); });
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-owner-close-failure-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const originalClose = PrologueAgentAdapter.prototype.close, failure = new Error("injected real adapter close failure");
  let closes = 0;
  PrologueAgentAdapter.prototype.close = async function () { closes++; if (closes === 1) throw failure; await originalClose.call(this); };
  t.after(() => { PrologueAgentAdapter.prototype.close = originalClose; });
  host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const service = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await service.ready;
  const peer = await peers.start(join(home, "agent-runtime"));
  await assert.rejects(host.close(), error => error === failure);
  assert.equal(closes, 1);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await assert.rejects(service.ready, /已关闭/);
  assert.equal(closes, 1, "a refused ready query cannot retry cleanup");
  await host.close();
  assert.equal(closes, 2);
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("RAC-105-A-08: closing a borrowed Web Host waits for its actual catalog and retries a failed SQLite close", { timeout: 60_000 }, async t => {
  const peers = storageOwnerProcesses(t), resident = await homeContextHost(t);
  const failure = new Error("injected open SQLite handle close failure");
  let closes = 0;
  await resident.catalog({ homeDirectory: resident.home }, catalog => {
    const close = catalog.close.bind(catalog);
    catalog.close = () => { closes++; if (closes === 1) throw failure; close(); };
  });
  const peer = await peers.start(join(resident.home, "agent-runtime"));
  await assert.rejects(resident.host.close(), error => error === failure);
  assert.equal(resident.server.listening, false);
  assert.equal(closes, 1);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await resident.host.close();
  assert.equal(closes, 2);
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("RAC-105-A-07: an early lease never makes an existing SDK or unknown business Home eligible for fresh memory adoption", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), parent = mkdtempSync(join(tmpdir(), "home-owner-existing-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  for (const name of ["storage.key", "unknown.sqlite"]) {
    const home = join(parent, name + "-home"), root = join(home, "agent-runtime"), peer = await peers.start(root);
    await peer.request("acquire"); await peer.request("release");
    writeFileSync(join(root, name), "original unadopted SDK or business bytes");
    const original = homeBusinessTree(home);
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "memory.unavailable" });
    assert.equal((await peer.request("acquire")).state, "held", "synchronous memory preflight has closed its ledger and constructed no other resource");
    assert.deepEqual(homeBusinessTree(home), original);
    await peer.stop();
  }
});

/** Real constructor/upgrade failure and public resource-close seams; failed objects are captured only for after-hook teardown. */
function failedConstruction(t: TestContext, options: { mode: "host" | "web"; pending: boolean; reason: unknown; borrowed?: boolean; configureFailure?: boolean }) {
  const { mode, pending, reason, borrowed = false, configureFailure = false } = options;
  const gate = deferred(), entered = deferred();
  const originalHostClose = MolisWorkLocalHost.prototype.close, originalPluginsClose = HomePluginHost.prototype.close;
  const originalConfigure = MolisWorkLocalHost.prototype.configurePersonalPlanning;
  const originalKernelClose = LocalHost.prototype.close, originalOn = Server.prototype.on, originalServerClose = Server.prototype.close;
  const teardownOnly = new Set<MolisWorkLocalHost>();
  let failure: HomeInitializationFailure | undefined, borrowedHost: MolisWorkLocalHost | undefined;
  const state = { pluginCloses: 0, kernelCloses: 0, serverCloses: 0, hostCloses: 0, upgradeRefused: false, rejectRemaining: pending ? 0 : 2 };
  const cleanupFailure = new Error("temporary actual Home plugin cleanup refusal");
  t.after(async () => {
    state.rejectRemaining = 0; gate.resolve(); Server.prototype.on = originalOn;
    try {
      if (typeof failure?.close === "function") await failure.close();
      // This is test teardown after assertion failure, never the API used to prove product recovery.
      for (const host of teardownOnly) await originalHostClose.call(host);
      await borrowedHost?.close();
    } finally {
      MolisWorkLocalHost.prototype.close = originalHostClose; HomePluginHost.prototype.close = originalPluginsClose;
      MolisWorkLocalHost.prototype.configurePersonalPlanning = originalConfigure;
      LocalHost.prototype.close = originalKernelClose; Server.prototype.close = originalServerClose;
    }
  });
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-failed-construction-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  MolisWorkLocalHost.prototype.close = function () { state.hostCloses++; teardownOnly.add(this); return originalHostClose.call(this); };
  MolisWorkLocalHost.prototype.configurePersonalPlanning = function (...args: Parameters<typeof originalConfigure>) { teardownOnly.add(this); if (configureFailure) throw reason; return originalConfigure.apply(this, args); };
  LocalHost.prototype.close = function () { state.kernelCloses++; return originalKernelClose.call(this); };
  HomePluginHost.prototype.close = async function () {
    state.pluginCloses++; entered.resolve();
    if (state.pluginCloses === 1) await gate.promise;
    if (state.rejectRemaining > 0) { state.rejectRemaining--; throw cleanupFailure; }
    return originalPluginsClose.call(this);
  };
  if (borrowed) borrowedHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  Server.prototype.on = function (event: string, listener: (...args: never[]) => void) {
    if (event === "upgrade" && !state.upgradeRefused) { state.upgradeRefused = true; throw reason; }
    Reflect.apply(originalOn, this, [event, listener]); return this;
  };
  Server.prototype.close = function (...args: Parameters<typeof Server.prototype.close>) { state.serverCloses++; originalServerClose.apply(this, args); return this; };
  try {
    if (mode === "host") new MolisWorkLocalHost({ homeDirectory: home, completeText: null, get functions(): never { throw reason; } });
    else createDesktopWebHost({ ptyClientFilePath: () => join(home, "unused-pty.js") })({ homeDirectory: home, localHost: borrowedHost });
    assert.fail("the real initialization fault must be reached");
  } catch (error) {
    assert.ok(error instanceof Error && "close" in error && typeof error.close === "function", "the thrown public failure must retain its actual cleanup entry");
    failure = error as HomeInitializationFailure;
  }
  assert.ok(failure);
  return { home, root: join(home, "agent-runtime"), peers, failure, state, cleanupFailure, gate, entered,
    borrowedHost, restoreUpgrade: () => { Server.prototype.on = originalOn; } };
}

for (const scenario of [{ mode: "host", pending: false }, { mode: "host", pending: true }, { mode: "web", pending: false }, { mode: "web", pending: true }, { mode: "web", pending: false, configureFailure: true }] as const) {
  const { mode, pending } = scenario;
  const beforeTransport = "configureFailure" in scenario;
  test(`RAC-105-A-13: ${mode}${beforeTransport ? " before transport registration" : ""} initialization exposes ${pending ? "pending" : "failed"} cleanup and only then permits same-Home reopening`, { timeout: 30_000 }, async t => {
    const cause = new Error("initial construction cause");
    const reason = new ActionError("actions.input_invalid", "late initializer refusal", { cause });
    const f = failedConstruction(t, { ...scenario, reason });
    assert.equal(f.failure, reason); assert.ok(f.failure instanceof ActionError);
    assert.equal(f.failure.code, "actions.input_invalid"); assert.equal(f.failure.message, reason.message); assert.equal(f.failure.cause, cause);
    assert.equal(Object.getOwnPropertyDescriptor(f.failure, "close")?.enumerable, false);
    if (mode === "web") assert.equal(f.state.upgradeRefused, !beforeTransport);
    await f.entered.promise;
    const inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino, peer = await f.peers.start(f.root);
    const first = f.failure.close(); assert.equal(f.failure.close(), first);
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }), { code: "storage.owner.busy" });
    f.gate.resolve();
    if (pending) await first;
    else {
      await assert.rejects(first, error => error === f.cleanupFailure);
      const retry = f.failure.close(); assert.equal(f.failure.close(), retry);
      await assert.rejects(retry, error => error === f.cleanupFailure);
      assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
      await f.failure.close();
    }
    assert.equal(f.state.pluginCloses, pending ? 1 : 3);
    assert.equal(f.state.kernelCloses, 1, "successfully closed real Kernel resources are not closed again on retry");
    if (mode === "web") assert.equal(f.state.serverCloses, beforeTransport ? 0 : 1, "only the HTTP listener that actually existed was closed, exactly once");
    f.restoreUpgrade();
    const next = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "the same process can reopen immediately after cleanup, and excludes the peer again");
    await next.close();
    const acquired = await peer.request("acquire"); assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
  });
}

test("RAC-105-A-14: a failed borrowed Web transport never closes or releases its existing Host", { timeout: 30_000 }, async t => {
  const reason = new Error("late borrowed Web upgrade refusal"), f = failedConstruction(t, { mode: "web", pending: true, reason, borrowed: true });
  assert.equal(f.failure, reason); assert.ok(f.borrowedHost);
  const first = f.failure.close(); assert.equal(f.failure.close(), first); await first;
  assert.equal(f.state.hostCloses, 0); assert.equal(f.state.pluginCloses, 0);
  assert.equal(f.borrowedHost.lifecycle(), "running");
  const inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino, peer = await f.peers.start(f.root);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  f.restoreUpgrade();
  const server = createDesktopWebHost({ ptyClientFilePath: () => join(f.home, "unused-pty.js") })({ homeDirectory: f.home, localHost: f.borrowedHost });
  await new Promise<void>(resolve => { server.listen(0, "127.0.0.1", resolve); });
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); });
  assert.equal(f.borrowedHost.lifecycle(), "running"); assert.equal(f.state.hostCloses, 0);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  f.gate.resolve(); await f.borrowedHost.close();
  const acquired = await peer.request("acquire"); assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
});

test("RAC-105-A-14: non-extensible errors, existing close properties and primitive reasons preserve their original cause", { timeout: 30_000 }, async t => {
  const cause = new Error("original wrapped cause"), frozen = Object.freeze(new ActionError("actions.input_invalid", "frozen initial failure", { cause, kind: "invalid" }));
  let foreignCloseCalls = 0;
  const foreign = Object.assign(new Error("initial failure with an unrelated close"), { close: () => { foreignCloseCalls++; } });
  for (const [name, reason] of [["frozen ActionError", frozen], ["foreign close", foreign], ["falsy reason", 0]] as const) await t.test(name, async t => {
    const f = failedConstruction(t, { mode: "host", pending: true, reason });
    assert.notEqual(f.failure, reason); assert.equal(f.failure.cause, reason);
    if (reason === frozen) {
      assert.ok(f.failure instanceof ActionError); assert.equal(f.failure.code, frozen.code); assert.equal(f.failure.kind, frozen.kind);
      assert.equal(f.failure.message, frozen.message); assert.ok(f.failure.cause instanceof ActionError); assert.equal(f.failure.cause.cause, cause);
      const records: Parameters<typeof captureHostLog>[0] = [], restore = captureHostLog(records);
      try { hostLog.error("host", "initialization_caller", f.failure); } finally { restore(); }
      assert.deepEqual(records[0]?.error, { name: "ActionError", code: "actions.input_invalid" });
    } else assert.ok(f.failure instanceof AggregateError);
    await f.entered.promise; const close = f.failure.close(); f.gate.resolve(); await close;
    assert.equal(foreignCloseCalls, 0);
    const next = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }); await next.close();
  });
});

test("RAC-105-A-14: borrowing a Host of another Home preserves its original refusal without allocating the requested Home", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-before-web-borrow-"));
  const other = mkdtempSync(join(tmpdir(), "home-before-web-refusal-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); rmSync(home, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); });
  assert.throws(() => createDesktopWebHost({ ptyClientFilePath: () => join(home, "unused-pty.js") })({ homeDirectory: other, localHost: host }), error => {
    assert.ok(error instanceof ActionError); assert.equal(error.code, "actions.scope_mismatch"); assert.equal("close" in error, false); return true;
  });
  assert.deepEqual(readdirSync(other), []); assert.equal(host.lifecycle(), "running");
  const peer = await peers.start(join(home, "agent-runtime"));
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await host.close(); assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

/** Advance only the production caller deadline; the resource and the peer's SQLite lock remain real. */
async function reachesCloseDeadline(t: TestContext, close: () => Promise<void>) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const first = close(); assert.equal(close(), first);
    let returned = false;
    const refused = assert.rejects(first, error => {
      returned = true; assert.ok(error instanceof ActionError); assert.equal(error.code, "host.close_timeout"); assert.equal(error.kind, "timeout"); return true;
    });
    t.mock.timers.tick(9_999); await Promise.resolve(); assert.equal(returned, false);
    t.mock.timers.tick(1); await refused;
  } finally { t.mock.timers.reset(); }
}

for (const resource of ["search", "placement"] as const) for (const lateFailure of [false, true]) {
  test(`RAC-105-A-15: pending ${resource} close times out without release or reentry, then ${lateFailure ? "a late refusal remains retryable" : "real completion releases the Home"}`, { timeout: 30_000 }, async t => {
    const peers = storageOwnerProcesses(t), home = mkdtempSync(join(tmpdir(), "home-close-deadline-"));
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const gate = deferred(), entered = deferred(), lateError = new Error("late resource close failure with private text /never-log");
    const records: Parameters<typeof captureHostLog>[0] = [], restoreLog = captureHostLog(records);
    t.after(async () => { gate.resolve(); await host.close(); restoreLog(); rmSync(home, { recursive: true, force: true }); });
    const selected = host[resource]!, actualClose = selected.close.bind(selected);
    let calls = 0;
    selected.close = async () => { calls++; if (calls === 1) { entered.resolve(); await gate.promise; if (lateFailure) throw lateError; } await actualClose(); };
    const root = join(home, "agent-runtime"), inode = statSync(join(root, ".molis-runtime-owner.db")).ino, peer = await peers.start(root);
    await reachesCloseDeadline(t, () => host.close()); await entered.promise;
    assert.equal(calls, 1); assert.equal(host.lifecycle(), "closing");
    assert.deepEqual(records.find(record => record.event === "home_close_timeout")?.fields, { timeout_ms: 10_000, pending: true });
    assert.deepEqual(records.find(record => record.event === "home_close_timeout")?.error, { name: "ActionError", code: "host.close_timeout" });
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
    await reachesCloseDeadline(t, () => host.close()); assert.equal(calls, 1, "a new bounded wait must not reenter pending resource cleanup");
    if (lateFailure) {
      gate.resolve();
      assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "late rejection is observed without a caller and retains the lock");
      assert.ok(records.some(record => record.event === "resource_close_failed" && record.fields?.resource === resource));
      assert.ok(records.some(record => record.event === "home_close_failed" && record.error?.name === "Error"));
      assert.equal(JSON.stringify(records).includes("/never-log"), false);
      await host.close(); assert.equal(calls, 2);
    } else {
      const waiting = host.close(); assert.equal(host.close(), waiting); assert.equal(calls, 1);
      gate.resolve(); await waiting; assert.equal(calls, 1);
    }
    const next = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }); await next.close();
    const acquired = await peer.request("acquire"); assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
  });
}

for (const mode of ["host", "web"] as const) {
  test(`RAC-105-A-15: the failed ${mode} initializer's public cleanup has the same bounded wait and retains its pending work`, { timeout: 30_000 }, async t => {
    const reason = new ActionError("actions.input_invalid", "original initializer failure"), records: Parameters<typeof captureHostLog>[0] = [];
    const restoreLog = captureHostLog(records); t.after(restoreLog);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const f = failedConstruction(t, { mode, pending: true, reason });
    const first = f.failure.close(), refused = assert.rejects(first, { code: "host.close_timeout" });
    await f.entered.promise; t.mock.timers.tick(10_000); await refused; t.mock.timers.reset();
    assert.equal(f.failure, reason); assert.ok(f.failure instanceof ActionError); assert.equal(f.failure.message, "original initializer failure"); assert.equal(f.failure.code, "actions.input_invalid");
    const peer = await f.peers.start(f.root), inode = statSync(join(f.root, ".molis-runtime-owner.db")).ino;
    assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }); assert.equal(f.state.pluginCloses, 1);
    const retry = f.failure.close(); assert.equal(f.failure.close(), retry); assert.equal(f.state.pluginCloses, 1);
    f.gate.resolve(); await retry;
    const next = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }); await next.close();
    const acquired = await peer.request("acquire"); assert.equal(acquired.state, "held"); assert.equal(acquired.inode, inode); await peer.stop();
    assert.ok(records.some(record => record.event === "home_close_timeout")); assert.equal(f.state.pluginCloses, 2, "only the new successful Host adds a second actual plugin close");
  });
}
