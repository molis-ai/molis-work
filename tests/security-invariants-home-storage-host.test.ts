import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
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
