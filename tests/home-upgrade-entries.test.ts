// UPG1-13, UPG1-15 (the `bootstrapSpace` half): every entry that takes the Home's lock, and what each does with an older store
// (specs/upgrade-continuity/upgrade-chain-design.md §4.3). The refusals themselves are in tests/security-invariants-home-upgrade.test.ts.
// Every action URL here is a closed local port.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopUninstallService, inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  acquireUpgradedHomeOwner, createHomeSnapshot, createMolisWorkLocalHost, homeStores, LocalMcpServer, MolisWorkWebServiceManager, restoreHomeSnapshot, runHomeUpgrade, WEB_CONTROL_TOKEN_RELATIVE_PATH, runLocalCli, runV1Cli, RuntimeIntegrationService,
} from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, ensureStorageSpace, HOME_RESTORE_JOURNAL, homeSqlitePath, MEMORY_LEDGER_STORE, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { assertSnapshotRefused, smallSnapshotHome, snapshotBusinessFingerprint } from "./fixtures/home-snapshot-small.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import {
  ADD_TAG, catalogFile, catalogHome, catalogVersionOf, failingBaseline, homeIdentityOf, ledgerFile, notesDescriptor, onStore, present, raiseCatalogBaseline, raiseProjectBaseline, seedStore, sha256, stampFile, unitOf, upgradeTestHome, useDescriptors, V2, versionOf,
} from "./fixtures/home-upgrade-home.js";

const CLOSED_PORT = "http://127.0.0.1:9";
const LAUNCHER = "#!/usr/bin/env node\n// molis-work-home-launcher-v1\n";

const captureLog = (t: TestContext) => { const lines: string[] = []; t.mock.method(console, "log", (line: string) => { lines.push(line); }); return lines; };

function captureStderr(t: TestContext) {
  const lines: string[] = [], real = process.stderr.write.bind(process.stderr);
  t.mock.method(process.stderr, "write", (chunk: string | Uint8Array, ...rest: []) => { if (typeof chunk === "string") lines.push(chunk); return real(chunk, ...rest); });
  return lines;
}

const snapshotArgs = (database: string, project_id: string) => ["snapshot", "--db", database, "--json", JSON.stringify({ project_id })];

async function withPeer<T>(t: TestContext, lock: string, use: () => Promise<T> | T): Promise<T> {
  const peer = await storageOwnerProcesses(t).start(lock);
  try { assert.equal((await peer.request("acquire")).state, "held"); return await use(); }
  finally { await peer.stop(); }
}

function assertLockFree(lock: string) { acquireStorageOwner(lock).release(); }

const uninstaller = (home: string, area: string) => createDesktopUninstallService({ homeDirectory: home,
  runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: area,
    runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } }),
  webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: area, platform: "linux" }) });

test("UPG1-13: the CLI upgrades an older catalog in place, says so on one line of stderr, and finishes the command", async t => {
  const f = await catalogHome(t);
  raiseCatalogBaseline(t);
  const output = captureLog(t), stderr = captureStderr(t);
  assert.equal(await runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), 0);
  assert.equal(JSON.parse(output.at(-1)!).board.project_id, f.project.project_id);
  assert.equal(catalogVersionOf(f.catalog), 2);
  assert.equal(present(stampFile(f.home)), true);
  assert.equal(stderr.filter(line => line.includes("升级")).length, 1);
  assertLockFree(f.lock);
});

test("UPG1-13: the CLI on a Home someone else holds says it is upgrading, and changes nothing", async t => {
  const f = await catalogHome(t), before = sha256(f.catalog);
  raiseCatalogBaseline(t);
  await withPeer(t, f.lock, () => assert.rejects(runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), { code: "storage.upgrade_in_progress" }));
  assert.equal(sha256(f.catalog), before);
  assert.equal(present(ledgerFile(f.home)), false);
});

test("UPG1-13: a catalog newer than the program goes straight back through the CLI: no lock, no upgrade, no change", async t => {
  await t.test("the catalog's own number", async t => {
    const f = await catalogHome(t);
    onStore(f.catalog, db => db.prepare("UPDATE catalog_meta SET value = '99' WHERE key = 'schema_version'").run());
    const before = sha256(f.catalog);
    await withPeer(t, f.lock, () => assert.rejects(runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), { code: "storage.store_too_new" }));
    assert.equal(sha256(f.catalog), before);
    assert.equal(present(ledgerFile(f.home)), false);
  });
  await t.test("the baseline's number", async t => {
    const f = await catalogHome(t, 3), before = sha256(f.catalog);
    raiseCatalogBaseline(t);
    await withPeer(t, f.lock, () => assert.rejects(runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), { code: "storage.store_too_new" }));
    assert.equal(sha256(f.catalog), before);
    assert.equal(present(ledgerFile(f.home)), false);
  });
});

test("UPG1-13: when the catalog's upgrade fails the CLI says this store failed, not that an upgrade is still to come", async t => {
  const f = await catalogHome(t), before = sha256(f.catalog);
  raiseCatalogBaseline(t, failingBaseline().upgrades);
  captureLog(t);
  await assert.rejects(runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), (error: Error & { code?: string; details?: { reason?: string } }) => {
    assert.equal(error.code, "storage.upgrade_failed");
    assert.equal(error.details?.reason, "step_failed", "what the record says went wrong, now that the catalog has one");
    return true;
  });
  assert.equal(sha256(f.catalog), before, "put back byte for byte");
  assert.equal(present(stampFile(f.home)), false);
  assertLockFree(f.lock);
});

test("UPG1-13: a current catalog and another older store: the CLI's ordinary lock upgrades it", async t => {
  const f = await catalogHome(t), notes = seedStore(f.home, "notes");
  useDescriptors(t, notesDescriptor("notes"));
  const output = captureLog(t);
  assert.equal(await runV1Cli(snapshotArgs(f.project.database_path, f.project.project_id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), 0);
  assert.equal(JSON.parse(output.at(-1)!).board.project_id, f.project.project_id);
  assert.equal(versionOf(notes), 2);
});

test("UPG1-13: a project outside the Home with an older catalog still upgrades: `fallback` alone would not take the lock", async t => {
  const f = await catalogHome(t), external = join(f.outside, "project.db");
  const output = captureLog(t);
  assert.equal(await runV1Cli(["init", "--db", external, "--json", JSON.stringify({ project_id: "external", idempotency_key: "initialize" })], { homeDirectory: f.home }), 0);
  raiseCatalogBaseline(t);
  assert.equal(await runV1Cli(snapshotArgs(external, "external"), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), 0);
  assert.equal(JSON.parse(output.at(-1)!).board.project_id, "external");
  assert.equal(catalogVersionOf(f.catalog), 2);
  assertLockFree(f.lock);
});

/** The project baseline has no `upgrades` of its own yet, so there is nothing for `t.mock.property` to replace. */
test("UPG1-13: a project store outside this Home is not this Home's to upgrade: it is refused and left alone", async t => {
  const f = await catalogHome(t), external = join(f.outside, "project.db");
  captureLog(t);
  assert.equal(await runV1Cli(["init", "--db", external, "--json", JSON.stringify({ project_id: "external", idempotency_key: "initialize" })], { homeDirectory: f.home }), 0);
  raiseProjectBaseline(t);
  const before = sha256(external);
  await assert.rejects(runV1Cli(snapshotArgs(external, "external"), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), { code: "storage.upgrade_pending" });
  assert.equal(sha256(external), before);
  assert.equal(versionOf(external), 1);
  assert.equal(versionOf(f.project.database_path), 1, "this command took no lock on the Home, so its own store waits for the next start");
  assertLockFree(f.lock);
});

test("UPG1-16: a project in the recycle bin is upgraded with the rest, and opens once it is back", async t => {
  const f = await catalogHome(t), id = f.project.project_id;
  captureLog(t);
  const change = async (operation_id: string, recycled: boolean) => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
    try { await catalog.commit(() => catalog.recycle.change({ project_id: id, actor_id: "fixture", operation_id, expected_state: catalog.recycle.inspect(id).state, recycled, confirmed: true }, () => {})); }
    finally { catalog.close(); }
  };
  await change("to-the-bin", true);
  raiseProjectBaseline(t);
  assert.equal(versionOf(f.project.database_path), 1);
  const report = runHomeUpgrade(f.home);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.state]), [[relative(f.home, f.project.database_path), "committed"]]);
  assert.equal(versionOf(f.project.database_path), 2);
  await change("back-again", false);
  assert.equal(await runV1Cli(snapshotArgs(f.project.database_path, id), { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), 0);
});

test("UPG1-13: `demo` from cli-project-maintenance upgrades and finishes", async t => {
  const f = await catalogHome(t);
  raiseCatalogBaseline(t);
  const output = captureLog(t);
  const options = { defaultSourceDirectory: () => f.outside, withCatalog: withMolisWorkProjectCatalog, runPlugin: () => Promise.reject(new Error("no plugin command here")) };
  assert.equal(await runLocalCli(["demo", "create", "--home", f.home, "--json"], options), 0);
  assert.equal(JSON.parse(output.at(-1)!).status, "ready");
  assert.equal(catalogVersionOf(f.catalog), 2);
});

const mcpCall = (database_path: string, project_id: string) => ({ id: 1, method: "tools/call", params: { name: "molis_work_v1_initialize",
  arguments: { database_path, project_id, idempotency_key: `project-catalog-create-${project_id}` } } });

/**
 * The Host starts unbound, as this path's does, so nothing but the entry under test can take the lock. The Home is an installed one whose
 * resident is not running: it has its control token (since #1932 a management MCP with an action service connects only with it), and
 * nothing answers at the closed port, so the call takes the path with nothing to start.
 */
async function withMcp<T>(home: string, use: (mcp: LocalMcpServer) => Promise<T>): Promise<T> {
  mkdirSync(dirname(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH)), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), "upgrade-entries-control-token-0123456789\n", { mode: 0o600 });
  // Not port 9: `fetch` refuses that port before connecting, which reads as a delivery that may have happened. A port just closed is refused.
  const probe = createServer(), port = await new Promise<number>(resolve => { probe.listen(0, "127.0.0.1", () => resolve((probe.address() as AddressInfo).port)); });
  await new Promise<void>(resolve => { probe.close(() => resolve()); });
  const host = createMolisWorkLocalHost({ completeText: null });
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "management", null, { homeDirectory: home, runtimeContext: { runtime_id: "upgrade-test", stable_work_context_id: "upgrade-test", host_declares_stable: true } }, host, `http://127.0.0.1:${port}`);
  try { return await use(mcp); }
  finally { await mcp.close(); await host.close(); }
}

test("UPG1-13: the management MCP with nothing to start upgrades through its own Host and answers", async t => {
  const f = await catalogHome(t);
  raiseCatalogBaseline(t);
  const reply = await withMcp(f.home, mcp => mcp.handleMessage(mcpCall(f.project.database_path, f.project.project_id))) as { result: { isError?: boolean } };
  assert.notEqual(reply.result.isError, true, JSON.stringify(reply.result));
  assert.equal(catalogVersionOf(f.catalog), 2);
  assert.equal(present(stampFile(f.home)), true);
});

test("UPG1-13: the management MCP on a Home someone else holds says it is upgrading, and changes nothing", async t => {
  const f = await catalogHome(t), before = sha256(f.catalog);
  raiseCatalogBaseline(t);
  const reply = await withPeer(t, f.lock, () => withMcp(f.home, mcp => mcp.handleMessage(mcpCall(f.project.database_path, f.project.project_id))));
  assert.match(JSON.stringify(reply), /storage\.upgrade_in_progress/);
  assert.equal(sha256(f.catalog), before);
});

test("UPG1-13: the catalog entry upgrades before it opens, unless it was handed a lock, whose holder has already", async t => {
  await t.test("no lock given", async t => {
    const f = await catalogHome(t);
    raiseCatalogBaseline(t);
    assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: f.home }, async catalog => catalog.listProjects().length), 1);
    assert.equal(catalogVersionOf(f.catalog), 2);
  });
  await t.test("the open form", async t => {
    const f = await catalogHome(t);
    raiseCatalogBaseline(t);
    (await openMolisWorkProjectCatalog({ homeDirectory: f.home })).close();
    assert.equal(catalogVersionOf(f.catalog), 2);
  });
  await t.test("a lock given: refused, not upgraded", async t => {
    const f = await catalogHome(t), before = sha256(f.catalog);
    raiseCatalogBaseline(t);
    const owner = acquireStorageOwner(f.lock);
    try { await assert.rejects(withMolisWorkProjectCatalog({ homeDirectory: f.home, storageOwner: owner }, async () => 0), { code: "storage.upgrade_pending" }); }
    finally { owner.release(); }
    assert.equal(sha256(f.catalog), before);
    assert.equal(present(ledgerFile(f.home)), false);
  });
  await t.test("the lock held elsewhere", async t => {
    const f = await catalogHome(t), before = sha256(f.catalog);
    raiseCatalogBaseline(t);
    await withPeer(t, f.lock, () => assert.rejects(withMolisWorkProjectCatalog({ homeDirectory: f.home }, async () => 0), { code: "storage.upgrade_in_progress" }));
    assert.equal(sha256(f.catalog), before);
  });
});

/** Empties the memory settings, so the memory store can only be prepared after a step that puts them back has run. */
function memoryNeedsTheUpgradeFirst(home: string) {
  const memory = homeSqlitePath(home, MEMORY_LEDGER_STORE);
  const rows = onStore(memory, db => db.prepare("SELECT * FROM memory_prefs").all().map(row => ({ ...row })));
  onStore(memory, db => db.exec("DELETE FROM memory_prefs"));
  assert.ok(rows.length > 0);
  return () => onStore(memory, db => { for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO memory_prefs (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...(Object.values(row) as string[]));
  } });
}

const closeServer = (server: Server) => new Promise<void>(resolve => { server.close(() => resolve()); });

test("UPG1-13: the Web server with no Host upgrades before it prepares the memory store, and refuses without changing anything when held", async t => {
  const f = await catalogHome(t), notes = seedStore(f.home, "notes"), putBack = memoryNeedsTheUpgradeFirst(f.home);
  const web = () => createMolisWorkWebServer({ homeDirectory: f.home, controlToken: "synthetic-upgrade-entry-control-0123456789" });
  assert.throws(web, { code: "memory.unavailable" }, "this Home really cannot be prepared before the step has run");
  useDescriptors(t, notesDescriptor("notes", { baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { db.exec(ADD_TAG); putBack(); } }] } }));
  const before = sha256(notes);
  await withPeer(t, f.lock, () => assert.throws(web, { code: "storage.upgrade_in_progress" }));
  assert.equal(sha256(notes), before);
  const server = web();
  t.after(() => closeServer(server));
  assert.equal(versionOf(notes), 2);
});

test("UPG1-15: an account Home is compared before it is upgraded", async t => {
  const alice = personalStorageSpace("https://auth.example", "work", "alice"), bob = personalStorageSpace("https://auth.example", "work", "bob");
  await t.test("its own: upgraded", t => {
    const f = upgradeTestHome(t);
    ensureStorageSpace(f.home, alice);
    const notes = seedStore(f.home, "notes", { space: alice });
    useDescriptors(t, notesDescriptor("notes"));
    acquireUpgradedHomeOwner(f.home, undefined, alice).release();
    assert.equal(versionOf(notes), 2);
    assert.equal(present(stampFile(f.home)), true);
  });
  await t.test("another account's: refused with nothing upgraded, and the lock given back", t => {
    const f = upgradeTestHome(t);
    ensureStorageSpace(f.home, bob);
    const notes = seedStore(f.home, "notes", { space: bob }), before = sha256(notes);
    useDescriptors(t, notesDescriptor("notes"));
    assert.throws(() => acquireUpgradedHomeOwner(f.home, undefined, alice), /SPACE_OWNERSHIP_MISMATCH/);
    assert.equal(sha256(notes), before);
    assert.equal(present(join(f.home, "upgrade")), false);
    assertLockFree(f.lock);
  });
  await t.test("no identity file yet: upgraded", t => {
    const f = upgradeTestHome(t), notes = seedStore(f.home, "notes", { space: alice });
    useDescriptors(t, notesDescriptor("notes"));
    acquireUpgradedHomeOwner(f.home, undefined, alice).release();
    assert.equal(versionOf(notes), 2);
  });
  await t.test("no identity file, and a store of another account: this store fails, on its own", t => {
    const f = upgradeTestHome(t), notes = seedStore(f.home, "notes", { space: bob }), before = sha256(notes);
    useDescriptors(t, notesDescriptor("notes"));
    acquireUpgradedHomeOwner(f.home, undefined, alice).release();
    assert.equal(sha256(notes), before);
    assert.equal(unitOf(f.home, "notes")?.state, "failed");
  });
});

test("UPG1-15: signing in to an account whose Home is older opens it upgraded", { timeout: 60_000 }, async t => {
  const f = upgradeTestHome(t);
  let transaction: { state: string } = { state: "" }, remote = "";
  const upstream = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/transactions") { transaction = JSON.parse(raw); res.end(JSON.stringify({ data: { loginUrl: `${remote}/login` } })); }
    else if (req.url === "/oauth2/token") res.end(JSON.stringify({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600 }));
    else if (req.url === "/api/v1/users/me") res.end(JSON.stringify({ data: { userId: "alice", displayName: "alice", emails: [], applicationId: "work", clientId: "web-test" } }));
    else res.end("{}");
  });
  const listen = (server: Server) => new Promise<string>(resolve => { server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)); });
  remote = await listen(upstream);
  t.after(() => closeServer(upstream));
  for (const [name, value] of [["MOLIS_WORK_AUTH_ORIGIN", remote], ["MOLIS_WORK_AUTH_CLIENT_ID", "web-test"], ["MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID", "desktop-test"], ["MOLIS_WORK_CLOUD_ORIGIN", remote]] as const) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  (await openMolisWorkProjectCatalog({ homeDirectory: f.home })).close();
  const space = personalStorageSpace(remote, "work", "alice"), directory = join(f.home, "spaces", space.spaceId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensureStorageSpace(directory, space);
  (await openMolisWorkProjectCatalog({ homeDirectory: directory })).close();
  const notes = seedStore(directory, "notes", { space });
  useDescriptors(t, notesDescriptor("notes"));

  const token = "synthetic-space-upgrade-control-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: f.home, controlToken: token });
  const origin = await listen(server);
  t.after(() => closeServer(server));
  let cookie = "", sequence = 0, viewToken = token;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(origin + path, { ...init, headers: { Cookie: cookie, ...init.headers } });
    if (response.headers.get("set-cookie")?.startsWith("molis-work-session=")) cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    return response;
  };
  const post = (path: string) => request(path, { method: "POST", body: "{}", headers: { Origin: origin, "content-type": "application/json",
    "x-molis-work-control-token": viewToken, "x-molis-work-idempotency-key": `upgrade-entry-${++sequence}` } });
  assert.equal((await post("/api/personal/login")).status, 200);
  assert.equal((await request(`/account/callback?code=synthetic&state=${transaction.state}`, { redirect: "manual" })).status, 303);
  viewToken = readFileSync(join(directory, "config/web-control-token"), "utf8").trim();
  // Since #1932 signing in prepares the account's Home at once; whatever opens it, it is opened upgraded, before any business store.
  assert.equal(versionOf(notes), 2, "the account's Home was opened by signing in, so it is already upgraded");
  assert.equal(present(stampFile(directory)), true);
  assert.equal((await post("/api/personal/space?kind=personal&userId=alice")).status, 200);
  assert.equal(versionOf(notes), 2);
  await request("/api/spaces");
});

test("UPG1-13: ordinary uninstall upgrades under its lock; a Home restore in the way stops it, with no receipt", async t => {
  await t.test("upgrades and finishes", async t => {
    const f = await catalogHome(t), notes = seedStore(f.home, "notes");
    mkdirSync(join(f.home, "bin"), { recursive: true });
    writeFileSync(join(f.home, "bin", "molis-work"), LAUNCHER);
    useDescriptors(t, notesDescriptor("notes"));
    const service = uninstaller(f.home, f.area), plan = await service.prepare();
    assert.equal(plan.status, "ready");
    assert.equal((await service.confirm({ plan_id: plan.plan_id, decision: "confirmed" })).status, "uninstalled");
    assert.equal(versionOf(notes), 2);
  });
  await t.test("a restore not yet finished", async t => {
    const f = await catalogHome(t), notes = seedStore(f.home, "notes"), before = sha256(notes);
    mkdirSync(join(f.home, "bin"), { recursive: true });
    writeFileSync(join(f.home, "bin", "molis-work"), LAUNCHER);
    useDescriptors(t, notesDescriptor("notes"));
    const service = uninstaller(f.home, f.area), plan = await service.prepare();
    assert.equal(plan.status, "ready");
    writeFileSync(join(f.lock, HOME_RESTORE_JOURNAL), '{"phase":"prepared"}', { mode: 0o600 });
    await assert.rejects(service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }), { code: "storage.owner.recovery_required" });
    assert.equal(sha256(notes), before);
    assert.equal(existsSync(service.receiptPath), false);
  });
});

test("UPG1-13: purge goes through an older catalog with a demo project: no step runs, and nothing opens the catalog half way", async t => {
  const f = upgradeTestHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const demo = (await catalog.ensureDemoProject({ actor_id: "fixture", user_confirmed: true })).project;
  catalog.close();
  assert.equal(demo.data_class, "regenerable_demo");
  mkdirSync(join(f.home, "bin"), { recursive: true });
  writeFileSync(join(f.home, "bin", "molis-work"), LAUNCHER);
  let steps = 0;
  raiseCatalogBaseline(t, [{ from: 1, run: () => { steps += 1; } }]);
  const held = acquireStorageOwner(f.lock);
  try { await assert.rejects(withMolisWorkProjectCatalog({ homeDirectory: f.home, storageOwner: held }, async () => 0), { code: "storage.upgrade_pending" }, "without the skip, removing the demo would stop here"); }
  finally { held.release(); }
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  assert.equal(plan.status, "ready");
  assert.ok(plan.changes.some(change => change.target.endsWith("projects")), "the purge removes the catalog and the demo with it");
  assert.equal((await service.confirm({ plan_id: plan.plan_id, decision: "confirmed", purge_confirmation: { home_directory: f.home, user_project_count: plan.user_project_count } })).status, "purged");
  assert.equal(steps, 0);
  assert.equal(existsSync(join(f.home, "projects")), false);
});

test("UPG1-13: purge also removes `upgrade/`, and is not stopped by a bad record", async t => {
  const f = await catalogHome(t);
  mkdirSync(join(f.home, "upgrade"));
  writeFileSync(ledgerFile(f.home), "{broken");
  const service = uninstaller(f.home, f.area), plan = await service.prepare({ purge_user_data: true });
  assert.equal((await service.confirm({ plan_id: plan.plan_id, decision: "confirmed", purge_confirmation: { home_directory: f.home, user_project_count: plan.user_project_count } })).status, "purged");
  assert.equal(existsSync(join(f.home, "upgrade")), false);
});

const homeLedger = (home: string, state: string) => {
  mkdirSync(join(home, "upgrade"), { recursive: true, mode: 0o700 });
  writeFileSync(ledgerFile(home), JSON.stringify({ schema_version: 1, home_identity: homeIdentityOf(home), run_id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", from: null, to: "a".repeat(64), started_at: "2026-11-07T00:00:00.000Z",
    units: [{ kind: "sqlite", owner: "tests/notes", relative_path: "notes/notes.db", group: null, from: 1, to: 2, state, error: null }] }), { mode: 0o600 });
};

test("UPG1-13: `home snapshot` and `home restore` do not start on a round that has not finished, or on a record they cannot read", async t => {
  for (const [name, leave] of [["unfinished", (home: string) => { homeLedger(home, "snapshotted"); }], ["unreadable", (home: string) => { homeLedger(home, "committed"); writeFileSync(ledgerFile(home), "{broken"); }]] as const) {
    await t.test(name, async t => {
      const f = await smallSnapshotHome(t);
      (await openMolisWorkProjectCatalog({ homeDirectory: f.home })).close();
      assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
      const source = join(f.area, "good-snapshot");
      renameSync(f.snapshot, source);
      leave(f.home);
      await assertSnapshotRefused(f, "host.home_snapshot.maintenance_pending", /升级/);
      const before = await snapshotBusinessFingerprint(f.home);
      await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "host.home_snapshot.maintenance_pending" });
      assert.deepEqual(await snapshotBusinessFingerprint(f.home), before);
    });
  }
});

test("UPG1-13: a finished round's `upgrade/` is not in a snapshot, and is not what stops one", async t => {
  const f = await smallSnapshotHome(t);
  (await openMolisWorkProjectCatalog({ homeDirectory: f.home })).close();
  homeLedger(f.home, "committed");
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  assert.equal(existsSync(join(f.snapshot, "upgrade")), false);
  assert.ok(!readFileSync(join(f.snapshot, "manifest.json"), "utf8").includes('"upgrade/'));
  assert.equal(homeStores().get("upgrade")?.owner, "apps/local-host");
  assert.equal(present(ledgerFile(f.home)), true, "the Home keeps its record");
});

test("UPG1-13: a store that fails stays in the record and the entry goes on for the others", async t => {
  const f = await catalogHome(t), bad = seedStore(f.home, "bad"), good = seedStore(f.home, "good"), before = sha256(bad);
  useDescriptors(t, notesDescriptor("bad", { baseline: failingBaseline() }), notesDescriptor("good"));
  assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: f.home }, async catalog => catalog.listProjects().length), 1);
  assert.equal(sha256(bad), before);
  assert.equal(versionOf(good), 2);
  assert.equal(unitOf(f.home, "bad")?.state, "failed");
});
