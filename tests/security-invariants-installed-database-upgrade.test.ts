import assert from "node:assert/strict";
import { ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createHomeSnapshot, MolisWorkLocalHost, planHomeUpgrade, PLUGIN_INSTALL_PERMISSIONS, pluginInstallActions, readSandboxPackage, upgradeHomesForMaintenance, upgradeNoticeFor } from "@molis-ai/molis-work-app-local-host";
import { SANDBOX_VALIDATE_UPGRADE, sandboxOperationActions, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { newPublisher, PACKAGE_PLUGIN_ID, signedPackage } from "./fixtures/sandbox-package.js";
import { openTestHome, serveTestHost, type TestHome, type TestProject } from "./fixtures/test-home.js";

const schema1 = "CREATE TABLE upgrade_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);";
const schema2 = "CREATE TABLE upgrade_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'plain');";
const sql = "ALTER TABLE upgrade_notes ADD COLUMN format TEXT NOT NULL DEFAULT 'plain';";
const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
type Scope = "project" | "home";

function packageAt(publisher: ReturnType<typeof newPublisher>, scope: Scope, version: string, options: {
  allow?: boolean; upgradeSql?: string; validationSource?: string; modelRead?: boolean; compatible?: boolean; from?: string;
} = {}) {
  const initial = version.split("+")[0] === "1.0.0", from = options.from ?? "1.0.0";
  const database = { version: initial ? 1 : 2, schema: initial ? schema1 : schema2,
    ...(initial ? {} : { upgrades: [{ from: 1, sql: options.upgradeSql ?? sql }] }) };
  return signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const effect = scope === "home" ? "homeDatabase" : "projectDatabase";
    for (const operation of contract.operations) operation.effects = { [effect]: [operation.kind === "query" ? "read" : "write"] };
    if (options.modelRead) contract.operations[0]!.effects.modelSettings = ["read"];
    if (!initial) contract.operations.unshift({ id: SANDBOX_VALIDATE_UPGRADE, kind: "query", input: { type: "string" }, output: { type: "boolean" },
      effects: {}, errors: [], examples: [{ input: from, output: options.allow !== false }] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
      "notes.list": async (_, sdk) => (await sdk.${effect}.all("SELECT id, text FROM upgrade_notes", [])).map(row => ({...row, id: String(row.id)})),
      "notes.add": async (input, sdk) => { await sdk.${effect}.transaction([{sql: "INSERT INTO upgrade_notes (text) VALUES (?)", parameters: [input.text]}]); return true; },
      ${initial ? "" : `validateUpgrade: ${options.validationSource ?? `async version => version === ${JSON.stringify(from)} && ${options.allow !== false}`},`}
    };`;
    Object.assign(manifest, sandboxPluginManifest({
      pluginId: PACKAGE_PLUGIN_ID, name: manifest.name, publisher: manifest.publisher, version, presentation: false, contract,
      ...(scope === "home" ? { runtime: { scope: "home" }, homeDatabase: database } : { projectDatabase: database }),
      ...(initial ? {} : { upgradeCompatibility: { migratable_from_versions: [options.compatible ? "0.9.0" : from],
        ...(options.compatible ? { compatible_from_versions: ["1.2.0"] } : {}) } }),
      stateMachines: [{ machine_id: PACKAGE_PLUGIN_ID + ".note", version: 1, states: { active: "connected" }, initial: "active", terminal: ["active"] }],
    }));
  }, { version });
}

function person(project: TestProject) {
  return { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: PLUGIN_INSTALL_PERMISSIONS,
    user_action: { source: "management" as const, conversation_ref: "installed-upgrade", message_ref: "confirm" } };
}

async function install(home: TestHome, project: TestProject, bundle: PluginPackageBundle, control: Pick<ActionCallContext, "signal" | "assert_authority_current"> = {}) {
  const client = home.host.actionClient(project.reference);
  const caller = person(project);
  const preview = await client.invoke(caller, pluginInstallActions.preview, { bundle }) as { preview_id: string };
  return client.invoke({ ...caller, ...control }, pluginInstallActions.confirm, { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
}

function readDatabase(home: TestHome, project: TestProject, scope: Scope, bundle: PluginPackageBundle, query: string) {
  const store = bundle.payload.manifest.databases?.home?.store_name;
  const file = scope === "project" ? project.database_path : join(realpathSync(home.home), store!, store + ".db");
  assert.ok(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare(query).all().map(row => ({ ...row })); }
  finally { db.close(); }
}

async function assertUpgradeCard(home: Pick<TestHome, "origin">, path: string, scope: Scope, reason = "upgrade_failed") {
  const page = await fetch(home.origin + path, { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(new RegExp(`data-${scope}-plugin-unavailable`).test(html), `expected the ${scope} upgrade card on ${path}`);
  assert.ok(html.includes(`data-owner-unavailable="${reason}"`), `expected upgrade reason ${reason}`);
  assert.match(html, /data-copy-value="D-[0-9A-F]{8}"/u);
}

/** Intercepts the host-only commit handshake without running another SQL implementation. */
function interceptWorkerPublish(t: TestContext, intercept: (worker: ChildProcess) => boolean) {
  const prototype = ChildProcess.prototype as ChildProcess & { spawn(options: { args: readonly string[] }): void };
  const spawnChild = prototype.spawn;
  t.mock.method(prototype, "spawn", function(this: ChildProcess, options: { args: readonly string[] }) {
    const started = Reflect.apply(spawnChild, this, [options]);
    if (!options.args.some(arg => arg.endsWith("/project-statement-worker.js"))) return started;
    const send = this.send;
    t.mock.method(this, "send", function(this: ChildProcess, ...args: Parameters<ChildProcess["send"]>) {
      if ((args[0] as { publishUpgrade?: boolean })?.publishUpgrade && intercept(this)) return false;
      return Reflect.apply(send, this, args);
    });
    return started;
  });
}

test("SMP-12 UPG-09 signed package reconstruction keeps checked state and SQL declarations", () => {
  const publisher = newPublisher();
  for (const scope of ["home", "project"] as const) {
    const candidate = packageAt(publisher, scope, "1.1.0");
    const parsed = readSandboxPackage(candidate.payload).manifest;
    assert.deepEqual(parsed.databases, candidate.payload.manifest.databases);
    assert.deepEqual(parsed.state_machines, candidate.payload.manifest.state_machines);
    assert.deepEqual(parsed.upgrade_compatibility?.migratable_from_versions, ["1.0.0"]);
  }
});

test("UPG-09 refuses a signed migration validator with write access", () => {
  const publisher = newPublisher(), valid = packageAt(publisher, "project", "1.1.0");
  const bundle = signedPackage(publisher, (files, manifest) => {
    Object.assign(manifest, valid.payload.manifest);
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.push({ id: SANDBOX_VALIDATE_UPGRADE, kind: "query", input: { type: "string" }, output: { type: "boolean" },
      effects: { storage: ["write"] }, errors: [], examples: [] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  }, { version: "1.1.0" });
  assert.throws(() => readSandboxPackage(bundle.payload), /validateUpgrade|Queries cannot declare writes/);
});

test("UPG-09 a same-named ordinary operation remains callable without a migration declaration", () => {
  const publisher = newPublisher();
  const bundle = signedPackage(publisher, files => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.push({ id: SANDBOX_VALIDATE_UPGRADE, kind: "query", input: { type: "string" }, output: { type: "boolean" },
      effects: {}, errors: [], examples: [{ input: "example", output: true }] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  });
  const { contract } = readSandboxPackage(bundle.payload);
  assert.equal(sandboxOperationActions({ contract, buildId: "12345678", version: 1, title: "Test", scope: "project" })
    .find(action => action.action.local_id === SANDBOX_VALIDATE_UPGRADE)?.capability_id, "generated.12345678.validateUpgrade");
});

for (const scope of ["project", "home"] as const) {
  test(`UPG-02 UPG-03 UPG-09 signed ${scope} upgrade moves the installed edition and preserves data across a bounded worker commit`, mac, async t => {
    const home = await openTestHome(t);
    const project = await home.createProject("Upgrade notes");
    const publisher = newPublisher(), initial = packageAt(publisher, scope, "1.0.0");
    await install(home, project, initial);
    if (scope === "home") {
      const runtime = (await home.host.homePlugins!.ready()).runtime;
      const row = home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
      await runtime.regrant(row.install_id, "home-database:read", true);
      await runtime.regrant(row.install_id, "home-database:write", true);
    }
    const file = scope === "home" ? (() => {
      const name = initial.payload.manifest.databases!.home!.store_name;
      return join(home.home, name, name + ".db");
    })() : project.database_path;
    const writer = new DatabaseSync(file);
    try { writer.exec("INSERT INTO upgrade_notes (text) VALUES ('kept')"); } finally { writer.close(); }

    const refused = packageAt(publisher, scope, "1.1.0", { allow: false });
    await assert.rejects(install(home, project, refused), /旧私有数据校验失败|拒绝迁移/);
    assert.deepEqual(readDatabase(home, project, scope, initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "kept" }]);

    const next = packageAt(publisher, scope, "1.2.0");
    assert.deepEqual(await install(home, project, next), {
      plugin_id: PACKAGE_PLUGIN_ID, version: "1.2.0", publisher_key_id: publisher.identity,
    });
    assert.deepEqual(readDatabase(home, project, scope, initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "kept", format: "plain" }]);
    const client = scope === "home" ? home.host.homeActionClient() : home.host.actionClient(project.reference);
    const caller = { ...person(project), project_id: scope === "home" ? null : project.project_id,
      permissions: ["storage:private", "home-database:read", "home-database:write"] };
    const offered = (await client.discover(caller)).filter(view => view.provider.plugin_id === PACKAGE_PLUGIN_ID);
    const read = offered.find(view => view.capability_id.endsWith(".notes.list")), add = offered.find(view => view.capability_id.endsWith(".notes.add"));
    assert.ok(read && add, JSON.stringify(offered.map(view => view.action.local_id)));
    assert.equal(offered.some(view => view.capability_id.toLowerCase().includes("validateupgrade")), false);
    assert.deepEqual(read.action.permissions, scope === "project" ? ["storage:private"] : ["storage:private", "home-database:read"]);
    assert.deepEqual(add.action.permissions, scope === "project" ? ["storage:private"] : ["storage:private", "home-database:write"]);
    assert.deepEqual(await client.invoke(caller, { capability_id: read.capability_id, version: read.version, provider_id: read.provider.provider_id }, {}),
      [{ id: "1", text: "kept" }]);
    const runtimedb = new DatabaseSync(scope === "home" ? join(home.home, "plugin-runtime", "plugin-runtime.db") : project.database_path, { readOnly: true });
    try {
      const row = runtimedb.prepare("SELECT json_extract(record_json, '$.version') AS version FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = ?").get(PACKAGE_PLUGIN_ID);
      assert.equal(row?.version, "1.2.0");
    } finally { runtimedb.close(); }
    const compatible = packageAt(publisher, scope, "1.3.0", { compatible: true, allow: false });
    assert.equal((await install(home, project, compatible) as { version: string }).version, "1.3.0");
  });
}

test("UPG-04 UPG-06 UPG-09 an interrupted SQL worker leaves the old owned schema and install row", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Interrupted upgrade");
  const publisher = newPublisher(), initial = packageAt(publisher, "project", "1.0.0");
  await install(home, project, initial);
  let interrupted = false;
  interceptWorkerPublish(t, worker => {
    interrupted = true;
    worker.kill("SIGKILL");
    return true;
  });
  await assert.rejects(install(home, project, packageAt(publisher, "project", "1.1.0")), /进程|升级/);
  assert.equal(interrupted, true);
  const table = readDatabase(home, project, "project", initial, "PRAGMA table_info(upgrade_notes)");
  assert.deepEqual(table.map(row => row.name), ["id", "text"]);
  const records = readDatabase(home, project, "project", initial,
    "SELECT json_extract(record_json, '$.version') AS version, json_extract(record_json, '$.state') AS state FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = 'com.example.notes'");
  assert.deepEqual(records, [{ version: "1.0.0", state: "crashed" }]);
  await assertUpgradeCard(home, `/projects/${project.project_id}/`, "project");
});

test("UPG-04 UPG-05 an installed project library from a newer version stays untouched and shows the newer-store reason", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Newer library");
  const publisher = newPublisher(), initial = packageAt(publisher, "project", "1.0.0");
  await install(home, project, initial);
  const db = new DatabaseSync(project.database_path);
  try { db.prepare("UPDATE plugin_project_databases SET version = 9 WHERE plugin_id = ?").run(PACKAGE_PLUGIN_ID); }
  finally { db.close(); }
  await assert.rejects(install(home, project, packageAt(publisher, "project", "1.1.0")), { code: "plugin.project_database.store_too_new" });
  assert.deepEqual(readDatabase(home, project, "project", initial, "SELECT version FROM plugin_project_databases WHERE plugin_id = 'com.example.notes'"), [{ version: 9 }]);
  await assertUpgradeCard(home, `/projects/${project.project_id}/`, "project", "store_too_new");
});

test("UPG-03 a startup constraint and validator error leave the old library untouched and return no plugin text", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Activation preflight");
  const publisher = newPublisher(), initial = packageAt(publisher, "project", "1.0.0");
  await install(home, project, initial);
  await assert.rejects(install(home, project, packageAt(publisher, "project", "1.1.0", { modelRead: true })),
    /只给装在 Home 里的插件/);
  await assert.rejects(install(home, project, packageAt(publisher, "project", "1.2.0", {
    validationSource: "async () => { throw new Error('private-validation-text'); }",
  })), (error: Error) => /只读迁移校验未完成/.test(error.message) && !error.message.includes("private-validation-text"));
  const table = readDatabase(home, project, "project", initial, "PRAGMA table_info(upgrade_notes)");
  assert.deepEqual(table.map(row => row.name), ["id", "text"]);
});

test("UPG-04 UPG-09 switching the Home plugin off before publish keeps the original SQLite schema and edition", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Withdraw at publish");
  const publisher = newPublisher(), initial = packageAt(publisher, "home", "1.0.0");
  await install(home, project, initial);
  const host = home.host.homePlugins!, platform = await host.ready();
  const installId = host.installation(PACKAGE_PLUGIN_ID)!.install_id;
  const prototype = ChildProcess.prototype as ChildProcess & { spawn(options: { args: readonly string[] }): void };
  const spawnChild = prototype.spawn;
  let stopped: Promise<unknown> | undefined;
  t.mock.method(prototype, "spawn", function(this: ChildProcess, options: { args: readonly string[] }) {
    const started = Reflect.apply(spawnChild, this, [options]);
    if (options.args.some(arg => arg.endsWith("/project-statement-worker.js"))) this.prependListener("message", message => {
      if (!(message as { prepared?: boolean }).prepared) return;
      platform.supervisor.revoke(PACKAGE_PLUGIN_ID);
      stopped = platform.runtime.stop(installId);
    });
    return started;
  });
  await assert.rejects(install(home, project, packageAt(publisher, "home", "1.1.0")), { code: "actions.provider_replaced" });
  assert.ok(stopped);
  await stopped;
  assert.equal(host.installation(PACKAGE_PLUGIN_ID)?.version, "1.0.0");
  assert.equal(host.installation(PACKAGE_PLUGIN_ID)?.state, "disabled");
  const table = readDatabase(home, project, "home", initial, "PRAGMA table_info(upgrade_notes)");
  assert.deepEqual(table.map(row => row.name), ["id", "text"]);
});

// QEA-137: both scopes refuse cancelled or unauthorized replies after a real SQL commit.
test("UPG-06 UPG-09 cancellation after the SQL commit preserves the new installation and its action directory", mac, async t => {
  for (const scope of ["project", "home"] as const) {
    for (const mode of ["cancel", "authority"] as const) await t.test(`${scope}: ${mode}`, t => assertPostCommitAuthority(t, scope, mode));
  }
});

async function assertPostCommitAuthority(t: TestContext, scope: Scope, mode: "cancel" | "authority") {
  const home = await openTestHome(t), project = await home.createProject("Cancel after commit");
  const publisher = newPublisher(), initial = packageAt(publisher, scope, "1.0.0");
  const next = packageAt(publisher, scope, "1.1.0");
  await install(home, project, initial);
  if (scope === "home") {
    const runtime = (await home.host.homePlugins!.ready()).runtime;
    await runtime.regrant(home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!.install_id, "home-database:read", true);
  }
  const controller = new AbortController(), prototype = ChildProcess.prototype as ChildProcess & { spawn(options: { args: readonly string[] }): void };
  const spawnChild = prototype.spawn;
  let upgrade = false, commits = 0;
  t.mock.method(prototype, "spawn", function(this: ChildProcess, options: { args: readonly string[] }) {
    const started = Reflect.apply(spawnChild, this, [options]);
    if (options.args.some(arg => arg.endsWith("/project-statement-worker.js"))) {
      const send = this.send;
      t.mock.method(this, "send", function(this: ChildProcess, ...args: Parameters<ChildProcess["send"]>) {
        if ((args[0] as { op?: string })?.op === `upgrade-${scope}-database`) upgrade = true;
        return Reflect.apply(send, this, args);
      });
      this.prependListener("message", message => {
        if (!upgrade || !(message as { ok?: boolean }).ok) return;
        upgrade = false;
        commits++;
        if (mode === "cancel") controller.abort();
      });
    }
    return started;
  });
  await assert.rejects(install(home, project, next, {
    signal: controller.signal,
    assert_authority_current: () => { if (mode === "authority" && commits) throw new ActionError("actions.forbidden", "This test caller lost authority"); },
  }), { code: mode === "cancel" ? "actions.cancelled" : "actions.forbidden" });
  assert.equal(commits, 1, "the real SQL worker sent its success reply");
  const caller = { ...person(project), project_id: scope === "home" ? null : project.project_id, permissions: ["storage:private", "home-database:read"] };
  const client = scope === "home" ? home.host.homeActionClient() : home.host.actionClient(project.reference);
  const ready = (await client.discover(caller)).find(view => view.provider.plugin_id === PACKAGE_PLUGIN_ID && view.capability_id.endsWith(".notes.list"));
  assert.ok(ready?.availability.available);
  assert.deepEqual(await client.invoke(caller, { capability_id: ready.capability_id, version: ready.version, provider_id: ready.provider.provider_id }, {}), []);
  assert.deepEqual(readDatabase(home, project, scope, initial, "PRAGMA table_info(upgrade_notes)").map(row => row.name), ["id", "text", "format"]);
  const runtimePath = scope === "home" ? join(home.home, "plugin-runtime", "plugin-runtime.db") : project.database_path;
  const db = new DatabaseSync(runtimePath, { readOnly: true });
  try {
    const row = db.prepare("SELECT json_extract(record_json, '$.version') AS version, json_extract(record_json, '$.state') AS state FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = ?").get(PACKAGE_PLUGIN_ID);
    assert.deepEqual({ ...row }, { version: "1.1.0", state: "running" });
  } finally { db.close(); }
  await assert.rejects(install(home, project, next), { code: "plugin.upgrade_required" });
  assert.equal(commits, 1, "confirming the same committed edition does not repeat the migration");
}

test("UPG-03 UPG-06 a killed Host recovers the library, approval and enabled installation before normal startup", mac, async t => {
  for (const phase of ["prepared", "committed"] as const) await t.test(phase, t => assertInterruptedHost(t, phase));
});

async function assertInterruptedHost(t: TestContext, phase: "prepared" | "committed") {
  const home = await openTestHome(t), project = await home.createProject("Recover Home upgrade");
  const from = "1.0.0+" + "a".repeat(150), to = "1.1.0+" + "b".repeat(150);
  const publisher = newPublisher(), initial = packageAt(publisher, "home", from);
  await install(home, project, initial);
  const original = home.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  const name = initial.payload.manifest.databases!.home!.store_name, file = join(home.home, name, name + ".db");
  const writer = new DatabaseSync(file);
  try {
    writer.exec("INSERT INTO upgrade_notes (text) VALUES ('kept')");
    writer.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { writer.close(); }
  await home.host.close();
  await home.close();
  const before = readFileSync(file), bundlePath = join(home.home, "fixture-bundle.json");
  const upgradeSql = sql + " UPDATE upgrade_notes SET text = replace(hex(zeroblob(3000000)), '0', 'x');";
  writeFileSync(bundlePath, JSON.stringify(packageAt(publisher, "home", to, { upgradeSql, from })));
  const fixture = fileURLToPath(new URL("./fixtures/installed-upgrade-interrupted-host.mjs", import.meta.url));
  const child = fork(fixture, [home.home, project.project_id, project.database_path, bundlePath, phase], { silent: true });
  const exited = once(child, "exit");
  let stderr = "";
  child.stderr!.on("data", data => { stderr += String(data); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
  const interrupted = await Promise.race([
    once(child, "message").then(([message]) => message as { phase: string; worker: number }),
    exited.then(() => assert.fail(stderr)),
  ]);
  assert.equal(interrupted.phase, phase);
  const record = join(home.home, "upgrade", "installed-plugin.json");
  assert.equal(existsSync(record), true);
  if (phase === "prepared") child.kill("SIGKILL");
  assert.deepEqual(await exited, [null, "SIGKILL"]);
  const until = Date.now() + 5000;
  while (true) {
    try { process.kill(interrupted.worker, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") break; throw error; }
    assert.ok(Date.now() < until, "the Worker releases the journal after losing its Host");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const scratch = mkdtempSync(join(tmpdir(), "molis-pending-upgrade-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  await assert.rejects(createHomeSnapshot({ homeDirectory: home.home, destination: join(scratch, "blocked-snapshot") }), /上一轮升级还没有做完/u);
  if (phase === "prepared") {
    const native = new DatabaseSync(file, { readOnly: true });
    try { assert.throws(() => native.prepare("SELECT text FROM upgrade_notes").get(), (error: unknown) => (error as { errcode?: number }).errcode === 776); }
    finally { native.close(); }
  }
  const plan = planHomeUpgrade(home.home);
  assert.deepEqual(plan, { needed: true, homes: [realpathSync(home.home)], total: 1 });
  const units: string[] = [];
  upgradeHomesForMaintenance(plan.homes, message => units.push(message.kind));
  assert.deepEqual(units, ["unit"]);
  assert.equal(upgradeNoticeFor(home.home)?.unavailable, 0);
  const restarted = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  try {
    await restarted.homePlugins!.ready();
    const recovered = restarted.homePlugins!.installation(PACKAGE_PLUGIN_ID);
    assert.deepEqual([recovered?.version, recovered?.state, recovered?.grants], [phase === "prepared" ? from : to, "running", original.grants]);
    if (phase === "prepared") {
      assert.deepEqual(readFileSync(file), before, "the checkpointed file is restored byte for byte");
      assert.deepEqual(readDatabase(home, project, "home", initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "kept" }]);
    } else {
      assert.deepEqual(readDatabase(home, project, "home", initial, "SELECT length(text) AS size, format FROM upgrade_notes"), [{ size: 6000000, format: "plain" }]);
    }
    assert.equal(existsSync(record), false);
    assert.equal(readdirSync(join(home.home, "upgrade")).some(path => path.startsWith("installed-plugin-")), false);
  } finally { await restarted.close(); }
}

test("UPG-03 UPG-04 activation failure after a committed migration retains the exact new edition and a durable reason", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Activation after commit");
  const publisher = newPublisher(), initial = packageAt(publisher, "project", "1.0.0");
  await install(home, project, initial);
  const candidate = packageAt(publisher, "project", "1.1.0");
  const { spawn } = ChildProcess.prototype as ChildProcess & { spawn(options: { args: readonly string[] }): void };
  let sandboxStarts = 0;
  t.mock.method(ChildProcess.prototype, "spawn", function(this: ChildProcess, options: { args: readonly string[] }) {
    const result = Reflect.apply(spawn, this, [options]);
    if (options.args[0]?.endsWith("/sandbox-exec") && ++sandboxStarts === 2) this.kill("SIGKILL");
    return result;
  });
  await assert.rejects(install(home, project, candidate), { code: "plugin.upgrade_activation_failed" });
  const records = readDatabase(home, project, "project", initial,
    "SELECT json_extract(record_json, '$.version') AS version, json_extract(record_json, '$.last_error_code') AS code FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = 'com.example.notes'");
  assert.deepEqual(records, [{ version: "1.1.0", code: "plugin.upgrade_activation_failed" }]);
  const table = readDatabase(home, project, "project", initial, "PRAGMA table_info(upgrade_notes)");
  assert.deepEqual(table.map(row => row.name), ["id", "text", "format"]);
  const path = `/projects/${project.project_id}/`;
  await assertUpgradeCard(home, path, "project", "upgrade_activation_failed");
  const page = await fetch(home.origin + path, { headers: { accept: "text/html" } });
  assert.ok((await page.text()).includes(`href="${path}settings/plugins"`));
  t.mock.restoreAll();
  await home.close();
  await home.host.close();
  const restarted = await serveTestHost(null, { home: home.home });
  try { await assertUpgradeCard(restarted, path, "project", "upgrade_activation_failed"); }
  finally { await restarted.close(); }
});

test("UPG-03 UPG-04 a failed Home upgrade is restored byte for byte and leaves another plugin running", mac, async t => {
  const home = await openTestHome(t), project = await home.createProject("Restore owned bytes");
  const publisher = newPublisher(), initial = packageAt(publisher, "home", "1.0.0");
  await install(home, project, initial);
  const name = initial.payload.manifest.databases!.home!.store_name, file = join(home.home, name, name + ".db");
  const db = new DatabaseSync(file);
  try {
    db.exec("INSERT INTO upgrade_notes (text) VALUES ('held')");
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  } finally { db.close(); }
  const before = readFileSync(file);
  const snapshots = join(home.home, "upgrade");
  const oldSnapshots = existsSync(snapshots) ? readdirSync(snapshots).sort() : [];
  const otherId = "com.example.other-notes";
  await install(home, project, signedPackage(newPublisher(), undefined, { pluginId: otherId }));
  await assert.rejects(install(home, project, packageAt(publisher, "home", "1.1.0", {
    upgradeSql: "UPDATE upgrade_notes SET text = 'temporary'",
  })), { code: "plugin.project_database.upgrade_failed" });
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readdirSync(snapshots).sort(), oldSnapshots);
  assert.deepEqual(readDatabase(home, project, "home", initial, "SELECT * FROM upgrade_notes"), [{ id: 1, text: "held" }]);
  const other = await home.host.withProject(project.reference, ({ store }) => store.db.prepare(
    "SELECT json_extract(record_json, '$.state') AS state FROM plugin_runtime_installs WHERE json_extract(record_json, '$.plugin_id') = ?").get(otherId));
  assert.deepEqual({ ...(other as { state: string }) }, { state: "running" });
  await assertUpgradeCard(home, `/projects/${project.project_id}/`, "home");
});
