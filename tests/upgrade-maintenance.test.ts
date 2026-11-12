// UPG1-11, UPG1-13 (the MCP's production path), UPG1-15: the port that answers while the Homes upgrade (upgrade-chain-design §4.2, §4.3).
// The refusals are in tests/security-invariants-upgrade-maintenance.test.ts. Temporary Homes and ports the system picks, never 4173, 4207 or 4208.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, realpathSync, statfsSync, truncateSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { createServer, get as httpGet, type Server } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { Worker } from "node:worker_threads";
import { createMcpResidentStarter, pendingUpgradeUnits, planHomeUpgrade, runHomeUpgrade, runUpgradeMaintenance, sendWebHealth, upgradeHomesForMaintenance, WEB_CONTROL_TOKEN_RELATIVE_PATH, type UpgradeMaintenanceMessage } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import { ADD_TAG, ledgerFile, ledgerOf, notesDescriptor, present, seedStore, sha256, upgradeTestHome, useDescriptors, V2, versionOf } from "./fixtures/home-upgrade-home.js";

const WORKER = new URL("./fixtures/upgrade-maintenance-worker.mjs", import.meta.url);
const TOKEN = randomBytes(32).toString("base64url");

const withToken = (home: string) => {
  mkdirSync(join(home, "config"), { recursive: true });
  writeFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), `${TOKEN}\n`, { mode: 0o600 });
};

function slowStep(t: TestContext, milliseconds: number) {
  const before = process.env.MOLIS_TEST_UPGRADE_STEP_MS;
  process.env.MOLIS_TEST_UPGRADE_STEP_MS = String(milliseconds);
  t.after(() => { if (before === undefined) delete process.env.MOLIS_TEST_UPGRADE_STEP_MS; else process.env.MOLIS_TEST_UPGRADE_STEP_MS = before; });
}

function maintenance(home: string, plan = planHomeUpgrade(home)) {
  let address: (value: string) => void = () => {};
  const origin = new Promise<string>(resolve => { address = resolve; });
  const finished = runUpgradeMaintenance({ home, port: 0, plan, workerEntry: WORKER, onListening: info => address(`http://127.0.0.1:${info.port}`) });
  return { origin, finished };
}

const listenOn = (server: Server, port: number) => new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });

test("UPG1-11: the owner lock can be taken and given back in a thread, and another thread of the process sees it as held", async t => {
  const { lock } = upgradeTestHome(t);
  mkdirSync(lock, { recursive: true });
  const worker = new Worker(new URL("./fixtures/storage-owner-worker.mjs", import.meta.url), { workerData: { lock } });
  t.after(() => worker.terminate());
  const next = () => new Promise<string>(resolve => worker.once("message", resolve));
  assert.equal(await next(), "held");
  assert.throws(() => acquireStorageOwner(lock), { code: "storage.owner.busy" });
  const released = next();
  worker.postMessage("release");
  assert.equal(await released, "released");
  acquireStorageOwner(lock).release();
});

test("UPG1-11: while it upgrades the port says so with a proof a client can check; afterwards the listener is gone and the store is new", async t => {
  const { home } = upgradeTestHome(t), file = seedStore(home, "notes");
  withToken(home);
  useDescriptors(t, notesDescriptor("notes"));
  slowStep(t, 1_500);
  const plan = planHomeUpgrade(home);
  assert.deepEqual(plan, { needed: true, homes: [realpathSync(home)], total: 1 });
  const { origin, finished } = maintenance(home, plan), url = await origin;
  const started = Date.now();
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 503);
  const health = await response.json() as { status: string; process_id: number; upgrade: { done: number; total: number; started_at: number } };
  assert.equal(health.status, "upgrading");
  assert.equal(health.process_id, process.pid);
  assert.deepEqual([health.upgrade.done, health.upgrade.total], [0, 1]);
  assert.ok(Math.abs(health.upgrade.started_at - started) < 60_000);
  assert.ok(Date.now() - started < 1_400, "the answer did not wait for the upgrade");
  const business = await fetch(`${url}/api/projects`);
  assert.equal(business.status, 503);
  assert.equal(business.headers.get("retry-after"), "1");
  assert.equal(((await business.json()) as { code: string }).code, "storage.upgrade_in_progress");
  await finished;
  assert.equal(versionOf(file), 2);
  await assert.rejects(fetch(`${url}/health`));
});

test("UPG3-05 while it upgrades the port answers the opening page and its two numbers, only to this computer", async t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes");
  useDescriptors(t, notesDescriptor("notes"));
  slowStep(t, 1_500);
  const { origin, finished } = maintenance(home), url = await origin;
  const page = await fetch(`${url}/`, { headers: { accept: "text/html" } });
  assert.equal(page.status, 503, "the opening page is still the maintenance answer");
  assert.match(page.headers.get("content-type") ?? "", /^text\/html\b/u);
  const html = await page.text();
  assert.match(html, /data-upgrade-opening/u);
  assert.match(html, /mw-bar-status/u);
  assert.match(html, /href="\/assets\/molis-work-arrival\.css"/u);
  assert.doesNotMatch(html, /notes|molis-work-page-session/u, "no store name and no token reach the page");
  const css = await fetch(`${url}/assets/molis-work-arrival.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /^text\/css\b/u);
  const progress = await fetch(`${url}/upgrade-progress`);
  assert.equal(progress.status, 200);
  const body = await progress.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["done", "started_at", "state", "total"], "only the numbers and the state");
  assert.deepEqual([body.done, body.total, body.state], [0, 1, "upgrading"]);
  const foreign = await new Promise<number>((resolve, reject) => {
    const { port } = new URL(url);
    httpGet({ host: "127.0.0.1", port, path: "/upgrade-progress", headers: { host: "evil.example" } }, response => { response.resume(); resolve(response.statusCode ?? 0); }).on("error", reject);
  });
  assert.ok(foreign >= 400, `a request named for another host is refused (S-02), got ${foreign}`);
  const crossOrigin = await fetch(`${url}/upgrade-progress`, { headers: { origin: "https://evil.example" } });
  assert.ok(crossOrigin.status >= 400, "a page of another origin reads nothing (S-01)");
  await finished;
});

test("UPG1-11: `/health`'s progress counts up as stores finish", async t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes");
  withToken(home);
  useDescriptors(t, notesDescriptor("notes"));
  slowStep(t, 400);
  const plan = planHomeUpgrade(home);
  const seen: number[] = [];
  const { origin, finished } = maintenance(home, { ...plan, total: 2 }), url = await origin;
  let running = true;
  void finished.then(() => { running = false; });
  while (running) {
    try { seen.push(((await (await fetch(`${url}/health`)).json()) as { upgrade: { done: number } }).upgrade.done); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await finished;
  assert.equal(seen[0], 0);
  assert.deepEqual([...seen].sort((a, b) => a - b), seen, "it only goes up");
});

test("UPG1-13: the MCP takes `upgrading` for starting: it starts nothing, and goes on when the Host is ready", async t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes");
  withToken(home);
  useDescriptors(t, notesDescriptor("notes"));
  slowStep(t, 800);
  const { origin, finished } = maintenance(home), url = await origin, starter = createMcpResidentStarter();
  t.after(() => starter.close());
  // No bin/molis-work-web here: treating it as absent would fail with `mcp.startup_entry_missing`.
  const ready = starter.ensure(home, url, AbortSignal.timeout(15_000));
  await finished;
  const after = createServer((request, response) => sendWebHealth(response, 200, { status: "ok", desktop_tui: true }, TOKEN, new URL(request.url!, "http://localhost").searchParams.get("challenge")));
  t.after(() => { after.closeAllConnections(); after.close(); });
  await listenOn(after, Number(new URL(url).port));
  await ready;
});

test("UPG1-13: still upgrading after the 20 seconds an MCP call waits: it says that, and does not stretch the call", { timeout: 40_000 }, async t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes");
  withToken(home);
  useDescriptors(t, notesDescriptor("notes"));
  slowStep(t, 22_000);
  const { origin, finished } = maintenance(home), url = await origin, starter = createMcpResidentStarter();
  t.after(() => starter.close());
  const started = Date.now();
  await assert.rejects(starter.ensure(home, url, AbortSignal.timeout(30_000)), error => {
    assert.equal((error as { code?: string }).code, "actions.service_unavailable");
    assert.match((error as Error).message, /正在升级/);
    return true;
  });
  assert.ok(Date.now() - started < 21_500);
  await finished;
});

test("UPG1-15: account Homes go up at the start, before anyone signs in, the root Home first", async t => {
  const { home } = upgradeTestHome(t);
  const rootStore = seedStore(home, "notes");
  const space = personalStorageSpace("https://auth.example", "work", "alice"), account = join(home, "spaces", space.spaceId);
  mkdirSync(account, { recursive: true, mode: 0o700 });
  ensureStorageSpace(account, space);
  const accountStore = seedStore(account, "notes", { space });
  withToken(home);
  useDescriptors(t, notesDescriptor("notes"));
  const plan = planHomeUpgrade(home);
  assert.deepEqual(plan.homes, [realpathSync(home), realpathSync(account)]);
  assert.equal(plan.total, 2);
  await maintenance(home, plan).finished;
  assert.equal(versionOf(rootStore), 2);
  assert.equal(versionOf(accountStore), 2);
  assert.equal(present(ledgerFile(account)), true, "each Home keeps its own record");
});

test("UPG1-15: one account Home's store fails, another's lock is taken, a third has no room, one says nothing of itself: each stays its own, and the rest go up", async t => {
  const { home } = upgradeTestHome(t), rootStore = seedStore(home, "notes");
  const account = (name: string) => {
    const space = personalStorageSpace("https://auth.example", "work", name), directory = join(home, "spaces", space.spaceId);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    ensureStorageSpace(directory, space);
    return { directory, file: seedStore(directory, "notes", { space }) };
  };
  const failing = account("failing"), busy = account("busy"), full = account("full"), fine = account("fine");
  const unclaimed = join(home, "spaces", "no-identity"), unclaimedStore = seedStore(unclaimed, "notes", { space: null }), unclaimedBefore = sha256(unclaimedStore);
  useDescriptors(t, notesDescriptor("notes", { baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { if (db.prepare("SELECT 1 FROM notes WHERE id = 'fail'").get()) throw new Error("no"); db.exec(ADD_TAG); } }] } }));
  const poison = new DatabaseSync(failing.file);
  poison.exec("INSERT INTO notes (id, body) VALUES ('fail', 'x')");
  poison.close();
  const failingBefore = sha256(failing.file), busyBefore = sha256(busy.file);
  const { bavail, bsize } = statfsSync(home);
  truncateSync(full.file, bavail * bsize);
  const busyLock = join(busy.directory, "agent-runtime");
  mkdirSync(busyLock, { recursive: true });
  const peer = await storageOwnerProcesses(t).start(busyLock);
  assert.equal((await peer.request("acquire")).state, "held");
  const plan = planHomeUpgrade(home);
  assert.equal(plan.homes[0], realpathSync(home), "the root Home first");
  assert.equal(plan.homes.includes(realpathSync(unclaimed)), false, "no identity file: left for the open that knows who to expect");
  assert.equal(plan.total, 5);
  const messages: UpgradeMaintenanceMessage[] = [];
  upgradeHomesForMaintenance(plan.homes, message => messages.push(message));
  await peer.stop();
  assert.equal(versionOf(rootStore), 2);
  assert.equal(versionOf(fine.file), 2);
  assert.equal(sha256(failing.file), failingBefore);
  assert.equal(ledgerOf(failing.directory).units[0]?.state, "failed");
  assert.equal(sha256(busy.file), busyBefore);
  assert.equal(present(ledgerFile(busy.directory)), false);
  assert.equal(ledgerOf(full.directory).units[0]?.error?.code, "storage.upgrade_no_space");
  assert.equal(sha256(unclaimedStore), unclaimedBefore);
  assert.deepEqual(messages.filter(message => message.kind === "failed").map(message => (message as { code: string }).code), ["storage.owner.busy"], "only the Home that could not be taken stops, and only itself");
});

test("UPG1-15: nothing waiting means no maintenance, and the scan changes nothing", t => {
  const { home } = upgradeTestHome(t);
  const file = seedStore(home, "notes", { version: 2 }), before = sha256(file);
  useDescriptors(t, notesDescriptor("notes"));
  assert.deepEqual(planHomeUpgrade(home), { needed: false, homes: [], total: 0 });
  assert.equal(pendingUpgradeUnits(home), 0);
  assert.equal(sha256(file), before);
  assert.equal(runHomeUpgrade(home).stamped, true);
  assert.equal(pendingUpgradeUnits(home), 0);
});

test("UPG1-15: a store that already failed under this build is not a reason for maintenance at every start", t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes");
  useDescriptors(t, notesDescriptor("notes", { baseline: { version: 2, schema: "", upgrades: [{ from: 1, run: () => { throw new Error("no"); } }] } }));
  assert.equal(pendingUpgradeUnits(home), 1);
  runHomeUpgrade(home);
  assert.equal(pendingUpgradeUnits(home), 0);
});

test("UPG1-13: another process has the root Home: maintenance changes nothing and hands over to the ordinary start's own refusal", async t => {
  const { home, lock } = upgradeTestHome(t), file = seedStore(home, "notes"), before = sha256(file);
  useDescriptors(t, notesDescriptor("notes"));
  const peer = await storageOwnerProcesses(t).start(lock);
  assert.equal((await peer.request("acquire")).state, "held");
  await maintenance(home).finished;
  assert.equal(sha256(file), before);
  assert.equal(present(ledgerFile(home)), false);
  await peer.stop();
});

test("UPG1-13: the port is already taken: the upgrade is not started from here", async t => {
  const { home } = upgradeTestHome(t), file = seedStore(home, "notes"), before = sha256(file);
  useDescriptors(t, notesDescriptor("notes"));
  const taken = createNetServer();
  await new Promise<void>(resolve => taken.listen(0, "127.0.0.1", resolve));
  t.after(() => taken.close());
  const { port } = taken.address() as { port: number };
  await runUpgradeMaintenance({ home, port, plan: planHomeUpgrade(home), workerEntry: WORKER });
  assert.equal(sha256(file), before);
});
