import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHomeSnapshot, createMolisWorkLocalHost, MolisWorkUninstallService, MolisWorkWebServiceManager, RuntimeIntegrationService,
  type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createDesktopUninstallService, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { acquireStorageOwner, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";

const fixture = fileURLToPath(new URL("./fixtures/home-snapshot-entry-window.ts", import.meta.url));
const cli = fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url));

function pausedEntry(t: TestContext, mode: "snapshot" | "cli" | "ledger", home: string, target: string) {
  const gate = join(dirname(home), ".entry-gate-" + randomUUID());
  execFileSync("mkfifo", [gate]);
  const child = spawn(process.execPath, ["--import", "tsx", fixture, mode, home, target, gate],
    { env: process.env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let stderr = "";
  child.stdout!.resume();
  child.stderr!.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  t.after(async () => { kill(); await closed; });
  t.signal.addEventListener("abort", kill, { once: true });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { kill(); reject(new Error("entry did not reach its barrier: " + stderr)); }, 15_000);
    child.once("message", value => { clearTimeout(timer); assert.deepEqual(value, { phase: { snapshot: "snapshot-payload", cli: "cli-runtime", ledger: "ledger-commit" }[mode] }); resolve(); });
    child.once("error", reject);
    void closed.then(value => { clearTimeout(timer); reject(new Error("entry closed before its barrier: " + JSON.stringify(value) + stderr)); });
  });
  return { ready,
    async release() { await fs.writeFile(gate, "x"); assert.deepEqual(await closed, { code: 0, signal: null }, stderr); },
    async terminate() { kill(); assert.deepEqual(await closed, { code: null, signal: "SIGKILL" }, stderr); },
  };
}

function uninstallOptions(home: string, area: string, localHost?: MolisWorkLocalHost) {
  return { homeDirectory: home, localHost,
    runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: area,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: area, platform: "linux" }),
  };
}

function uninstaller(home: string, area: string, localHost?: MolisWorkLocalHost) {
  return createDesktopUninstallService(uninstallOptions(home, area, localHost));
}

function snapshotPeer(home: string, destination: string) {
  return spawnSync(process.execPath, ["--import", "tsx", cli, "home", "snapshot", "--home", home, "--to", destination, "--json"],
    { env: process.env, encoding: "utf8", timeout: 15_000 });
}

test("RAC-105-S-06 S-07: snapshot refuses confirmed uninstall and purge before receipts or installation effects; the same plan retries", { timeout: 60_000 }, async t => {
  for (const purge of [false, true]) await t.test(purge ? "purge" : "ordinary", async t => {
    const f = await smallSnapshotHome(t);
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
    const project = await catalog.createProject({ display_name: "Retained user project", actor_id: "fixture" });
    catalog.close();
    await f.file("images/assets/kept.bin");
    await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
    const originalOwner = acquireStorageOwner(join(f.home, "agent-runtime")); originalOwner.release();
    const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: purge });
    assert.equal(plan.status, "ready");
    const entry = pausedEntry(t, "snapshot", f.home, f.snapshot);
    await entry.ready;
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
    const before = await snapshotBusinessFingerprint(f.home);
    const input = { plan_id: plan.plan_id, decision: "confirmed" as const,
      ...(purge ? { purge_confirmation: { home_directory: f.home, user_project_count: plan.user_project_count } } : {}) };
    await assert.rejects(service.confirm(input), { code: "storage.owner.busy" });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal((await fs.stat(project.database_path)).isFile(), true);
    assert.equal(existsSync(service.receiptPath), false);
    await entry.release();
    assert.equal((await service.confirm(input)).status, purge ? "purged" : "uninstalled");
    assert.equal(existsSync(join(f.home, "bin", "molis-work")), false);
  });
});

test("RAC-105-S-07 S-07: purge keeps the original lock directory and inode until all cleanup completes and after release", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t);
  await f.file("images/assets/kept.bin");
  const initial = acquireStorageOwner(join(f.home, "agent-runtime")); initial.release();
  await f.file("agent-runtime/records/fixture/item.json", "business payload to purge");
  const lock = join(f.home, "agent-runtime", ".molis-runtime-owner.db");
  const identity = await fs.lstat(lock), directory = await fs.lstat(dirname(lock));
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  const remove = fs.rm;
  let reached = false;
  t.mock.method(fs, "rm", async (...args: Parameters<typeof fs.rm>) => {
    if (args[0] === service.receiptPath) {
      reached = true;
      const peer = snapshotPeer(f.home, f.snapshot);
      assert.equal(peer.status, 1, peer.stderr);
      assert.match(peer.stderr, /占用|所有权|使用/u);
      assert.equal(existsSync(f.snapshot), false);
      assert.equal((await fs.lstat(lock)).ino, identity.ino);
      assert.equal((await fs.lstat(dirname(lock))).ino, directory.ino);
      assert.throws(() => acquireStorageOwner(dirname(lock)), { code: "storage.owner.busy" });
    }
    return remove(...args);
  });
  assert.equal((await service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
    purge_confirmation: { home_directory: f.home, user_project_count: 0 } })).status, "purged");
  assert.equal(reached, true);
  assert.equal(existsSync(join(f.home, "images")), false);
  assert.equal(existsSync(join(f.home, "agent-runtime", "records")), false);
  assert.equal((await fs.lstat(lock)).ino, identity.ino);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
});

test("RAC-105-S-08 S-07: a Home CLI init fallback refuses before mkdir while snapshot owns Home, then really writes after release", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const entry = pausedEntry(t, "snapshot", f.home, f.snapshot); await entry.ready;
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
  const database = join(f.home, "projects", "entry-window", "molis-work.db");
  const before = await snapshotBusinessFingerprint(f.home);
  const invoke = () => spawnSync(process.execPath, ["--import", "tsx", cli, "v1", "init", "--db", database,
    "--json", JSON.stringify({ project_id: "entry-window", idempotency_key: "entry-window" })],
    { env: { ...process.env, MOLIS_WORK_HOME: f.home }, encoding: "utf8", timeout: 15_000 });
  const refused = invoke();
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /占用|所有权|使用/u);
  assert.equal(existsSync(dirname(database)), false);
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  await entry.release();
  const accepted = invoke(); assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal((await fs.stat(database)).isFile(), true);
});

test("RAC-105-S-08 S-07: a real Home CLI write window refuses snapshot before staging and releases with its Host", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const database = join(f.home, "projects", "entry-window", "molis-work.db");
  const entry = pausedEntry(t, "cli", f.home, database); await entry.ready;
  const peer = snapshotPeer(f.home, f.snapshot);
  assert.equal(peer.status, 1, peer.stderr);
  assert.equal(existsSync(f.snapshot), false);
  assert.deepEqual((await fs.readdir(f.area)).filter(name => name.startsWith(".molis-home-snapshot-")), []);
  await entry.release();
  assert.equal((await fs.stat(database)).isFile(), true);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
});

test("RAC-105-S-08: an unrelated standalone database still initializes while the selected Home is owned by snapshot", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const entry = pausedEntry(t, "snapshot", f.home, f.snapshot); await entry.ready;
  const database = join(f.area, "standalone", "project.db");
  const result = spawnSync(process.execPath, ["--import", "tsx", cli, "v1", "init", "--db", database,
    "--json", JSON.stringify({ project_id: "standalone", idempotency_key: "standalone" })],
    { env: { ...process.env, MOLIS_WORK_HOME: f.home }, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await fs.stat(database)).isFile(), true);
  await entry.release();
});

test("RAC-105-S-08 S-07: Home and database aliases retain the same ownership boundary before creating a new directory", { timeout: 60_000 }, async t => {
  const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
  const alias = join(f.area, "home-alias"); await fs.symlink(f.home, alias, "dir");
  const database = join(f.home, "projects", "alias", "molis-work.db");
  const entry = pausedEntry(t, "snapshot", f.home, f.snapshot); await entry.ready;
  assert.throws(() => acquireStorageOwner(join(alias, "agent-runtime")), { code: "storage.owner.busy" });
  const before = await snapshotBusinessFingerprint(f.home);
  const invoke = (home: string, target: string) => spawnSync(process.execPath, ["--import", "tsx", cli, "v1", "init", "--db", target,
    "--json", JSON.stringify({ project_id: "alias", idempotency_key: "alias" })],
    { env: { ...process.env, MOLIS_WORK_HOME: home }, encoding: "utf8", timeout: 15_000 });
  for (const [home, target] of [[f.home, join(alias, "projects", "alias", "molis-work.db")], [alias, database]]) {
    const refused = invoke(home!, target!);
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stderr, /占用|所有权|使用/u);
    assert.equal(existsSync(dirname(database)), false);
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  }
  await entry.release();
  const result = invoke(alias, database); assert.equal(result.status, 0, result.stderr);
  assert.equal((await fs.stat(database)).isFile(), true);
});

test("RAC-105-S-08 S-07: a catalog-owned project's never-delivered resident call cannot bypass snapshot through fallback", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const project = await catalog.createProject({ display_name: "Registered fallback", actor_id: "fixture" }); catalog.close();
  await f.file("images/assets/kept.bin");
  assert.equal(existsSync(join(f.home, "config", "web-control-token")), false, "without a control token this call is never sent to a resident");
  const entry = pausedEntry(t, "snapshot", f.home, f.snapshot); await entry.ready;
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
  const before = await snapshotBusinessFingerprint(f.home);
  const invoke = () => spawnSync(process.execPath, ["--import", "tsx", cli, "v1", "snapshot", "--db", project.database_path,
    "--json", JSON.stringify({ project_id: project.project_id })],
    { env: { ...process.env, MOLIS_WORK_HOME: f.home }, encoding: "utf8", timeout: 15_000 });
  const refused = invoke(); assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /占用|所有权|使用/u);
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  await entry.release();
  const result = invoke(); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).board.project_id, project.project_id);
});

test("RAC-105-S-09 S-07: an accepted ordinary uninstall retains the real parent until settlement when Host.close interleaves", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ completeText: null });
  host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog);
  await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
  let inspected = 0, entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = new MolisWorkUninstallService({ ...uninstallOptions(f.home, f.area, host), projects: {
    inspect: async () => {
      if (++inspected === 2) { entered(); await gate; }
      return { projects: [], conflict: null };
    },
    removeDemos: async () => assert.fail("there is no demo in this Home"),
  } });
  const plan = await service.prepare();
  const operation = service.confirm({ plan_id: plan.plan_id, decision: "confirmed" });
  let closing: Promise<void> | undefined;
  try {
    await Promise.race([reached, operation.then(() => assert.fail("uninstall skipped its inspection"))]);
    let closed = false;
    closing = host.close().then(() => { closed = true; });
    // This Host has no runtime, plugin or open Catalog connection: absent the retained operation its close needs only microtasks.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(closed, false);
    assert.equal(host.lifecycle(), "closing");
    assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
    const secondPlan = await service.prepare();
    await assert.rejects(service.confirm({ plan_id: secondPlan.plan_id, decision: "confirmed" }), { code: "host.closed" });
    assert.equal(existsSync(service.receiptPath), false);
    release();
    assert.equal((await operation).status, "uninstalled");
    await closing;
    const reopened = acquireStorageOwner(join(f.home, "agent-runtime")); reopened.release();
  } finally { release(); await Promise.allSettled([operation, closing, host.close()]); }
});

test("RAC-105-S-09 S-07: a different Home cannot reuse a Host and a failed ordinary uninstall returns retention for explicit retry", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ completeText: null });
  host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog);
  try {
    const other = join(f.area, "other");
    await fs.mkdir(join(other, "bin"), { recursive: true });
    await fs.writeFile(join(other, "bin", "molis-work"), "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
    const foreign = uninstaller(other, f.area, host), foreignPlan = await foreign.prepare();
    const foreignBefore = await snapshotBusinessFingerprint(other);
    await assert.rejects(foreign.confirm({ plan_id: foreignPlan.plan_id, decision: "confirmed" }), { code: "actions.home_mismatch" });
    assert.deepEqual(await snapshotBusinessFingerprint(other), foreignBefore);
    const launcher = await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
    const service = uninstaller(f.home, f.area, host), remove = fs.rm;
    let failed = false;
    t.mock.method(fs, "rm", async (...args: Parameters<typeof fs.rm>) => {
      if (args[0] === launcher && !failed) { failed = true; throw new Error("fixture removal failure"); }
      return remove(...args);
    });
    const plan = await service.prepare();
    await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }), { code: "installer.uninstall.step_failed" });
    assert.equal(JSON.parse(await fs.readFile(service.receiptPath, "utf8")).state, "failed");
    const retry = await service.prepare();
    assert.equal((await service.confirm({ plan_id: retry.plan_id, decision: "confirmed" })).status, "uninstalled");
  } finally { await host.close(); }
  const owner = acquireStorageOwner(join(f.home, "agent-runtime")); owner.release();
});

test("RAC-105-S-09: a borrowed Host refuses to stop its own managed service before a receipt or service effect", async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ completeText: null });
  host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog);
  try {
    await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
    const options = uninstallOptions(f.home, f.area, host), web = options.webServiceManager;
    const detection = await web.prepare("remove");
    t.mock.method(web, "prepare", async () => ({ ...detection, status: "ready" as const, detection: { ...detection.detection, running: true } }));
    t.mock.method(web, "confirm", async () => assert.fail("the serving Host must never stop itself inside its retained uninstall"));
    const service = createDesktopUninstallService(options), plan = await service.prepare();
    const before = await snapshotBusinessFingerprint(f.home);
    await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }), { code: "installer.uninstall.conflict" });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  } finally { await host.close(); }
});

test("RAC-105-S-10 S-07: a committed business WAL invalidates the preview before any purge effect", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home }); catalog.close();
  await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  const writer = pausedEntry(t, "ledger", f.home, f.snapshot); await writer.ready;
  assert.ok((await fs.stat(join(f.home, "memory", "memory.db-wal"))).size > 32);
  assert.throws(() => acquireStorageOwner(join(f.home, "agent-runtime")), { code: "storage.owner.busy" });
  await writer.terminate();
  const before = await snapshotBusinessFingerprint(f.home);
  await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
    purge_confirmation: { home_directory: f.home, user_project_count: 0 } }), { code: "installer.uninstall.plan_stale" });
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  assert.equal(existsSync(service.receiptPath), false);
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try { assert.deepEqual(ledger.marker(LOCAL_PERSON_ACTOR_ID, "purge-preview-business-change")?.body, { value: "committed after preview" }); }
  finally { ledger.close(); }
});

test("RAC-105-S-11 S-07: purge with a live Host stays busy without consuming its plan or touching data", async t => {
  const f = await smallSnapshotHome(t), host = createMolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    await f.file("images/assets/kept.bin");
    const service = uninstaller(f.home, f.area, host), plan = await service.prepare({ purge_user_data: true });
    const before = await snapshotBusinessFingerprint(f.home);
    const input = { plan_id: plan.plan_id, decision: "confirmed" as const,
      purge_confirmation: { home_directory: f.home, user_project_count: plan.user_project_count } };
    for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(service.confirm(input), error => {
      assert.ok(error instanceof Error && "code" in error);
      assert.equal(error.code, "storage.owner.busy"); assert.match(error.message, /先关闭 App/u); return true;
    });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal(existsSync(service.receiptPath), false);
  } finally { await host.close(); }
});

test("RAC-105-S-10 S-07: changing a nested business file invalidates the old purge plan while keeping the changed data", async t => {
  const f = await smallSnapshotHome(t), file = await f.file("images/assets/kept.bin", "before preview");
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  await fs.writeFile(file, "updated business content after preview");
  const before = await snapshotBusinessFingerprint(f.home);
  await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
    purge_confirmation: { home_directory: f.home, user_project_count: 0 } }), { code: "installer.uninstall.plan_stale" });
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  assert.equal(await fs.readFile(file, "utf8"), "updated business content after preview");
  assert.equal(existsSync(service.receiptPath), false);
});

test("RAC-105-S-11 S-07: successful purge leaves exactly the original empty lock skeleton and starts as a new Home", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  await catalog.createProject({ display_name: "Deleted project", actor_id: "fixture" }); catalog.close();
  const runtime = join(f.home, "agent-runtime"), lock = join(runtime, ".molis-runtime-owner.db");
  const owner = acquireStorageOwner(runtime); owner.release();
  const identity = await fs.lstat(lock), directory = await fs.lstat(runtime);
  await f.file("agent-runtime/storage.key", Buffer.alloc(32, 0x51));
  await f.file("agent-runtime/records/run/item.json", "retained SDK data must be deleted");
  await f.file("agent-runtime/cache/unknown.json", "cache is not in the retained lock list");
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  assert.equal(plan.status, "ready");
  const result = await service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
    purge_confirmation: { home_directory: f.home, user_project_count: plan.user_project_count } });
  assert.equal(result.status, "purged"); assert.match(result.message, /锁骨架.*未删除/u);
  assert.deepEqual(await fs.readdir(f.home), ["agent-runtime"]);
  assert.deepEqual(await fs.readdir(runtime), [".molis-runtime-owner.db"]);
  assert.equal((await fs.lstat(lock)).ino, identity.ino); assert.equal((await fs.lstat(runtime)).ino, directory.ino);
  // Only after release: reading/closing a second raw descriptor must never weaken a live POSIX owner lock.
  const technical = new DatabaseSync(lock, { readOnly: true });
  try { assert.deepEqual(technical.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(), []); }
  finally { technical.close(); }
  const host = createMolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const fresh = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
    try {
      assert.deepEqual(fresh.listProjects(), []);
      const project = await fresh.createProject({ display_name: "Fresh after purge", actor_id: "fixture" });
      assert.equal((await fs.stat(project.database_path)).isFile(), true);
    } finally { fresh.close(); }
    const ledger = openMemoryLedger({ homeDirectory: f.home });
    try { assert.deepEqual(ledger.marker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption")?.body, { origin: "new-home" }); }
    finally { ledger.close(); }
  } finally { await host.close(); }
  assert.equal((await fs.lstat(lock)).ino, identity.ino);
});

test("RAC-105-S-11 S-07: unknown Home, config and bin content refuses purge before deleting any owned data", async t => {
  for (const file of ["personal-note.txt", "config/personal-note.txt", "bin/personal-note.txt"]) await t.test(file, async t => {
    const f = await smallSnapshotHome(t); await f.file("images/assets/kept.bin");
    await f.file("bin/molis-work", "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n");
    const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
    assert.equal(plan.status, "ready");
    await f.file(file, "belongs to the person, not the installer");
    const before = await snapshotBusinessFingerprint(f.home);
    await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed",
      purge_confirmation: { home_directory: f.home, user_project_count: 0 } }), { code: "installer.uninstall.plan_stale" });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    assert.equal(existsSync(service.receiptPath), false);
    const next = await service.prepare({ purge_user_data: true }); assert.equal(next.status, "conflict");
    await assert.rejects(service.confirm({ plan_id: next.plan_id, decision: "confirmed",
      purge_confirmation: { home_directory: f.home, user_project_count: 0 } }), { code: "installer.uninstall.conflict" });
    assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
  });
});
