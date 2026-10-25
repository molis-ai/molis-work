import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginPrivateStorage, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxOperationContract, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createSandboxRunner, sandboxServicesFor, type SandboxRunner, type SandboxServiceContext } from "@molis-ai/molis-work-plugin-sandbox";
import { DEMO_PROJECT_ID, HomePluginHost, LocalProjectDatabase, homeStores, openSandboxHomeLibrary, runPluginDevelopment, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginRuntimeRepository, PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { sandboxDatabase } from "@molis-ai/molis-work-plugin-sandbox";

// BL-490 (PG-017; specs/repository-anti-corruption/slices/pg017-sandbox-services.md §3.7): a sandboxed package that declares a library
// in the Home (`databases.home`) gets it under the ledger every installed plugin has, but the Host holds no connection to it: the
// statements run in the process S-59 can kill, over node:sqlite connections of that process's own. What this file asserts is the
// refusal: another publisher, a taken name and a library partitioned by project open nothing; a grant taken back stops the next call;
// a statement past its time is killed and the next one runs; the keyword filters of the Host's own client apply; and closing the
// library ends the process. The library is a real file under a temporary Home and the processes are real.

const PLUGIN_ID = "io.molis.work.example.sbxhome";
const declaration: HomePluginDatabaseDeclaration = { store_name: "sbxhome", version: 1, read_permission: "sbxhome:read", write_permission: "sbxhome:write",
  schema: "CREATE TABLE sbxhome_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const owner = { plugin_id: PLUGIN_ID, publisher_signature: "probe-sbxhome" };
const instance = { install_id: "sbxhome", installation_generation: "1" };
const context = (signal: AbortSignal = new AbortController().signal): SandboxServiceContext => ({ identity: { projectId: "p", installationId: "i", pluginId: PLUGIN_ID, namespace: "installed" },
  signal, operationId: "sbxhome.read" });

/** The statement processes this test process has running now. */
function workers(): number[] {
  try {
    return execFileSync("pgrep", ["-P", String(process.pid), "-f", "project-statement-worker"], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  } catch { return []; }
}
async function nobodyRuns(): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (workers().length === 0) return true;
    await sleep(50);
  }
  return false;
}

function newHome(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), "sandbox-home-library-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

/** The sandbox's service over the package's Home library, with grants the test can take back. */
function library(t: TestContext, home: string, options: { owner?: typeof owner; declaration?: HomePluginDatabaseDeclaration; limits?: Parameters<typeof openSandboxHomeLibrary>[6] } = {}) {
  const grants = { revoked: false };
  const authorize = (permission: string) => { if (grants.revoked) throw new ActionError("actions.forbidden", `撤权了：${permission}`); };
  const opened = openSandboxHomeLibrary(home, options.owner ?? owner, options.declaration ?? declaration, homeStores(), authorize, instance, options.limits);
  t.after(() => opened.close());
  return { opened, grants, sandbox: sandboxDatabase(opened.statements) };
}

const file = (home: string, name = declaration.store_name) => join(home, name, `${name}.db`);
function rows(home: string): string[] {
  const db = new DatabaseSync(file(home), { readOnly: true });
  try { return db.prepare("SELECT text FROM sbxhome_notes ORDER BY id").all().map(row => (row as { text: string }).text); } finally { db.close(); }
}
function ledger(home: string): Array<{ plugin_id: string; publisher_signature: string; store_name: string }> {
  const db = new DatabaseSync(join(home, "plugin-libraries", "plugin-libraries.db"), { readOnly: true });
  try { return db.prepare("SELECT plugin_id, publisher_signature, store_name FROM plugin_home_libraries ORDER BY plugin_id").all().map(row => ({ ...row })) as never; } finally { db.close(); }
}
const add = (text: string) => ({ sql: "INSERT INTO sbxhome_notes (text) VALUES (?)", parameters: [text] });

test("S-75 RAC-240 a sandboxed package's Home library is made under the ledger with the install record's publisher, and its statements run in a process, not on the Host", async t => {
  const home = newHome(t);
  const { sandbox } = library(t, home);
  assert.deepEqual(ledger(home), [{ plugin_id: PLUGIN_ID, publisher_signature: "probe-sbxhome", store_name: "sbxhome" }]);
  const done = await sandbox.transaction(context(), [add("一行"), add("两行")]);
  assert.deepEqual(done, [{ changes: 1 }, { changes: 1 }]);
  assert.deepEqual(rows(home), ["一行", "两行"]);
  assert.deepEqual(await sandbox.all(context(), { sql: "SELECT text FROM sbxhome_notes ORDER BY id", parameters: [] }), [{ text: "一行" }, { text: "两行" }]);
  assert.equal(workers().length, 1, "the statements run in a child process of the Host");
});

test("S-75 RAC-240 untrusted schema is refused before any library or ledger exists and cannot change an external SQLite file", t => {
  const outside = newHome(t), victim = join(outside, "outside.db"), db = new DatabaseSync(victim);
  db.exec("CREATE TABLE private_notes (text TEXT NOT NULL); INSERT INTO private_notes VALUES ('untouched');");
  db.close();
  const before = readFileSync(victim), path = victim.replaceAll("'", "''");
  for (const schema of [
    `${declaration.schema} ATTACH DATABASE '${path}' AS outside; UPDATE outside.private_notes SET text = 'changed';`,
    `${declaration.schema} CREATE TRIGGER surprise AFTER INSERT ON sbxhome_notes BEGIN DELETE FROM sbxhome_notes; END;`,
    "CREATE TABLE sbxhome_notes AS SELECT 1 AS id;",
    "CREATE TABLE sbxhome_notes (id INTEGER,);",
  ]) {
    const home = newHome(t), beforeWorkers = workers();
    assert.throws(() => openSandboxHomeLibrary(home, owner, { ...declaration, schema }, homeStores(), () => {}, instance),
      { code: "plugin.declaration_invalid" });
    assert.equal(existsSync(join(home, declaration.store_name)), false, "no plugin directory was created");
    assert.equal(existsSync(join(home, "plugin-libraries")), false, "no ledger was opened, so no claim row exists");
    assert.deepEqual(readFileSync(victim), before, "the external file is byte-for-byte unchanged");
    assert.deepEqual(workers(), beforeWorkers, "a rejected declaration did not start a worker");
  }
  const home = newHome(t);
  library(t, home, { declaration: { ...declaration, schema: `${declaration.schema} CREATE INDEX notes_text ON sbxhome_notes(text);` } });
  assert.deepEqual(ledger(home), [{ plugin_id: PLUGIN_ID, publisher_signature: owner.publisher_signature, store_name: declaration.store_name }]);
  assert.deepEqual(rows(home), [], "a valid table and index declaration still creates its library");
});

test("S-75 RAC-241 another publisher's library, a name the Host or another plugin holds, and a library partitioned by project open nothing", async t => {
  const home = newHome(t);
  library(t, home);
  assert.equal(await nobodyRuns(), true, "this case begins without a statement worker");
  const refuses = (open: () => unknown, code: string) => {
    const before = workers();
    assert.throws(open, { code });
    assert.deepEqual(workers(), before, "each refusal leaves this process's worker PID set unchanged");
  };
  refuses(() => openSandboxHomeLibrary(home, { ...owner, publisher_signature: "someone-else" }, declaration, homeStores(), () => {}, instance),
    "plugin.home_database.publisher_mismatch");
  refuses(() => openSandboxHomeLibrary(home, { plugin_id: `${PLUGIN_ID}2`, publisher_signature: "probe-sbxhome" }, declaration, homeStores(), () => {}, instance),
    "plugin.home_database.object_taken");
  refuses(() => openSandboxHomeLibrary(home, { plugin_id: `${PLUGIN_ID}3`, publisher_signature: "probe-sbxhome" }, { ...declaration, store_name: "projects" }, homeStores(), () => {}, instance),
    "plugin.home_database.object_taken");
  const elsewhere = newHome(t);
  mkdirSync(join(elsewhere, "sbxother"));
  refuses(() => openSandboxHomeLibrary(elsewhere, owner, { ...declaration, store_name: "sbxother" }, homeStores(), () => {}, instance), "plugin.home_database.object_taken");
  refuses(() => openSandboxHomeLibrary(elsewhere, owner, { ...declaration, partition: "project" }, homeStores(), () => {}, instance), "plugin.declaration_invalid");
  assert.equal(existsSync(file(elsewhere)), false, "a refusal makes no library");
  assert.equal(await nobodyRuns(), true, "no refused call leaves even one statement worker");
});

test("S-75 RAC-242 a grant taken back, or a closed library, stops the next call before it reaches the process", async t => {
  const home = newHome(t);
  const { sandbox, grants, opened } = library(t, home);
  await sandbox.transaction(context(), [add("kept")]);
  grants.revoked = true;
  await assert.rejects(sandbox.all(context(), { sql: "SELECT text FROM sbxhome_notes", parameters: [] }), { code: "actions.forbidden" });
  await assert.rejects(sandbox.transaction(context(), [add("revoked")]), { code: "actions.forbidden" });
  grants.revoked = false;
  assert.deepEqual(rows(home), ["kept"], "a revoked write wrote nothing");
  opened.close();
  await assert.rejects(sandbox.all(context(), { sql: "SELECT text FROM sbxhome_notes", parameters: [] }), { code: "actions.plugin_unavailable" });
  assert.equal(await nobodyRuns(), true, "closing the library ends its process");
});

test("S-75 RAC-243 the keyword filters of the Host's own client apply: a write is not a read, a read is not a write, and a read that starts as a query cannot write", async t => {
  const home = newHome(t);
  const { sandbox } = library(t, home);
  await sandbox.transaction(context(), [add("a")]);
  const NOT_A_READ = { code: "sandbox.database_error", message: /SELECT 或 WITH/u }, NOT_A_WRITE = { code: "sandbox.database_error", message: /INSERT、UPDATE 或 DELETE/u };
  for (const sql of ["INSERT INTO sbxhome_notes (text) VALUES ('x')", "DELETE FROM sbxhome_notes", "PRAGMA journal_mode = DELETE", "ATTACH DATABASE '/tmp/x.db' AS other"]) {
    await assert.rejects(sandbox.all(context(), { sql, parameters: [] }), NOT_A_READ, sql);
  }
  for (const sql of ["SELECT text FROM sbxhome_notes", "DROP TABLE sbxhome_notes", "PRAGMA journal_mode = DELETE", "ATTACH DATABASE '/tmp/x.db' AS other"]) {
    await assert.rejects(sandbox.transaction(context(), [{ sql, parameters: [] }]), NOT_A_WRITE, sql);
  }
  // The read connection is SQLite's own read-only one: a statement that passes the keyword filter still cannot write through it.
  await assert.rejects(sandbox.all(context(), { sql: "WITH n AS (SELECT 1) INSERT INTO sbxhome_notes (text) SELECT 'sneaked' FROM n", parameters: [] }), { code: "sandbox.database_error" });
  assert.deepEqual(rows(home), ["a"], "nothing a refused statement did is left");
});

test("S-75 RAC-244 a read past its time is killed and answered with a code while the Host keeps running; the next read runs in a fresh process", async t => {
  const home = newHome(t);
  const { sandbox } = library(t, home, { limits: { readMs: 500 } });
  await sandbox.transaction(context(), Array.from({ length: 300 }, (_, n) => add(`row ${n}`)));
  const slow = "SELECT count(*) AS n FROM sbxhome_notes AS a, sbxhome_notes AS b, sbxhome_notes AS c, sbxhome_notes AS d";
  await assert.rejects(sandbox.all(context(), { sql: slow, parameters: [] }), { code: "plugin.project_database.statement_timeout" });
  // A library in the Home has no S-46 record guard (its tables are the plugin's own, the whole file), so a recursive query starts and the clock is what stops it.
  await assert.rejects(sandbox.all(context(), { sql: "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT count(*) AS n FROM n", parameters: [] }),
    { code: "plugin.project_database.statement_timeout" });
  assert.deepEqual(await sandbox.all(context(), { sql: "SELECT count(*) AS n FROM sbxhome_notes", parameters: [] }), [{ n: 300 }]);
  assert.equal(rows(home).length, 300);
});

test("S-75 RAC-245 a write past its time is killed with its transaction: none of its statements stays and the next transaction runs", async t => {
  const home = newHome(t);
  const { sandbox } = library(t, home, { limits: { writeMs: 500, transactionMs: 2000 } });
  await sandbox.transaction(context(), Array.from({ length: 300 }, (_, n) => add(`row ${n}`)));
  const slow = "UPDATE sbxhome_notes SET text = (SELECT count(*) FROM sbxhome_notes AS a, sbxhome_notes AS b, sbxhome_notes AS c, sbxhome_notes AS d)";
  await assert.rejects(sandbox.transaction(context(), [add("before"), { sql: slow, parameters: [] }]), { code: "plugin.project_database.statement_timeout" });
  assert.equal(rows(home).length, 300, "the first statement of the killed transaction was rolled back with it");
  assert.equal(rows(home).includes("before"), false);
  await sandbox.transaction(context(), [add("after")]);
  assert.equal(rows(home).at(-1), "after");
});

/** One operation of the sandboxed stand-in: it takes its call as JSON text and answers with what it got back, or the code it was refused with. */
const sandboxed = (id: string, kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract => ({ id, kind, effects, errors: [], input: { type: "string" },
  output: { type: "object", additionalProperties: false, properties: { value: { type: "string" }, refused: { type: "string" } }, required: [] },
  examples: [{ input: "[]", outputIncludes: {} }] });

/** A package's actual Host proxy: its action crosses a Seatbelt runner and broker before reaching the Home library's statement process. */
function homePackage(bundlePath: string) {
  const permissions = ["storage:private", declaration.read_permission, declaration.write_permission];
  const operations = [sandboxed("write", "command", { homeDatabase: ["write"] }), sandboxed("all", "query", { homeDatabase: ["read"] })];
  const actions: ActionDefinition<string, unknown>[] = operations.map(operation => ({
    capability_id: `${PLUGIN_ID}.${operation.id}`, version: 1, operation: operation.kind,
    action: { title: operation.id, description: "Use the installed sandbox package's Home library", kind: operation.kind === "query" ? "query" : "operation",
      scope: "home", audiences: ["user"], subject_kinds: [], scheduling: "concurrent",
      permissions: [operation.kind === "query" ? declaration.read_permission : declaration.write_permission], input_schema: { ...operation.input }, output_schema: { ...operation.output } },
  }));
  const runners: SandboxRunner[] = [], held: PluginProjectStatements[] = [], storage: PluginPrivateStorage[] = [];
  const definition: PluginDefinition = { execution: "sandbox", manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox Home library lifecycle", kind: "app",
    publisher: { publisher_id: "example", signature: owner.publisher_signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: true, reason: "Read and write its own Home library" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions, databases: { home: declaration }, upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] },
  }, async start(context) {
    assert.equal(context.project_id, undefined);
    assert.equal(context.services?.database, undefined, "the package has no synchronous Host database client");
    assert.ok(context.services?.database_statements, "the Home executor supplied the real statement port");
    held.push(context.services.database_statements);
    assert.ok(context.services.storage);
    storage.push(context.services.storage);
    const runner = await createSandboxRunner({ bundlePath, contract: { version: 1, pluginId: PLUGIN_ID, revision: "home-lifecycle", entities: [], pages: [], acceptance: [], operations },
      identity: { projectId: "home", installationId: context.install_id, pluginId: context.plugin_id, namespace: "installed" },
      grants: { homeDatabase: ["read", "write"] }, services: sandboxServicesFor(context.services) });
    runners.push(runner);
    return { kind: "app", views: [], actions: actions.map((action, index) => ({ ...action, async handle(caller, input) {
      // A retained old port is exercised inside a real new action, so BL-411's out-of-call inert behavior cannot hide its refusal.
      if (input === "stale") return await held[0]!.all("SELECT text FROM sbxhome_notes", [], { rows: 10, bytes: 65536 }, caller.signal ?? new AbortController().signal);
      return await runner.call(operations[index]!.id, input as string, { signal: caller.signal, beforeEffect: () => caller.beforeEffect() });
    } })) };
  }, async stop() { await runners.at(-1)?.stop(); } };
  return { definition, permissions, runners, held, storage, write: actions[0]!, read: actions[1]! };
}

function processExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}

async function assertProcessesExit(pids: number[]): Promise<void> {
  // dispose sends SIGKILL synchronously; the OS exit/reap notification is asynchronous. Check the exact captured PIDs, including
  // a process no longer visible under this parent, rather than treating an empty pgrep result as proof that it exited.
  for (let attempt = 0; attempt < 60 && pids.some(processExists); attempt++) await sleep(50);
  assert.deepEqual(pids.filter(processExists), [], "every process of this activation actually exited");
}

test("S-75 RAC-242 a package installed in the real Home Runtime writes through its sandbox, stops and uninstalls with no surviving calls or processes", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "sandbox-home-runtime-")), bundlePath = join(home, "installed.mjs");
  writeFileSync(bundlePath, `export const operations={
    write:async(input,sdk)=>({value:JSON.stringify(await sdk.homeDatabase.transaction(JSON.parse(input)))}),
    all:async(input,sdk)=>({value:JSON.stringify(await sdk.homeDatabase.all(...JSON.parse(input)))}),
  };`);
  const probe = homePackage(bundlePath), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  assert.equal(await nobodyRuns(), true);
  const runtime = (await host.ready()).runtime;
  const { install } = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.permissions });
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: probe.permissions };
  await runtime.start(install.install_id);
  assert.deepEqual(await actions.invoke(caller, probe.write, JSON.stringify([add("from Home Runtime")])), { value: JSON.stringify([{ changes: 1 }]) });
  assert.deepEqual(rows(home), ["from Home Runtime"]);
  const firstRunner = probe.runners[0]!, firstWorkers = workers();
  assert.equal(firstWorkers.length, 1, "the statement uses a real separate child process");
  await runtime.stop(install.install_id);
  await assert.rejects(actions.invoke(caller, probe.read, "[]"), { code: "actions.missing" });
  await assert.rejects(firstRunner.call("all", "[]"), { code: "sandbox.stopped" });
  assert.equal(await nobodyRuns(), true);
  await assertProcessesExit([firstRunner.pid, ...firstWorkers]);

  await runtime.start(install.install_id);
  await assert.rejects(actions.invoke(caller, probe.read, "stale"), { code: "actions.plugin_unavailable" });
  assert.deepEqual(await actions.invoke(caller, probe.read, JSON.stringify(["SELECT text FROM sbxhome_notes ORDER BY id", []])),
    { value: JSON.stringify([{ text: "from Home Runtime" }]) });
  const secondRunner = probe.runners[1]!, secondWorkers = workers();
  assert.notEqual(secondRunner.pid, firstRunner.pid);
  assert.equal(secondWorkers.length, 1);
  await runtime.uninstall(install.install_id, { retain_private_data: true });
  await assert.rejects(actions.invoke(caller, probe.read, "[]"), { code: "actions.missing" });
  await assert.rejects(secondRunner.call("all", "[]"), { code: "sandbox.stopped" });
  await assert.rejects(runtime.start(install.install_id), { code: "plugin.state_invalid" });
  assert.equal(await nobodyRuns(), true);
  await assertProcessesExit([secondRunner.pid, ...secondWorkers]);
  assert.deepEqual(rows(home), ["from Home Runtime"], "a retaining uninstall keeps the library");

  const retained = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.permissions }).install;
  await runtime.start(retained.install_id);
  assert.deepEqual(await actions.invoke(caller, probe.read, JSON.stringify(["SELECT text FROM sbxhome_notes", []])),
    { value: JSON.stringify([{ text: "from Home Runtime" }]) }, "retaining reinstall reads the old library");
  const thirdRunner = probe.runners[2]!, thirdWorkers = workers();
  await runtime.uninstall(retained.install_id, { retain_private_data: false });
  await assertProcessesExit([thirdRunner.pid, ...thirdWorkers]);
  assert.equal(existsSync(join(home, declaration.store_name)), false);
  assert.deepEqual(ledger(home), [], "non-retaining uninstall removed this owner's claim after its files");
  const fresh = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.permissions }).install;
  await runtime.start(fresh.install_id);
  assert.deepEqual(await actions.invoke(caller, probe.read, JSON.stringify(["SELECT text FROM sbxhome_notes", []])), { value: "[]" },
    "the sandbox package cannot read discarded library data after reinstall");
  const fourthRunner = probe.runners[3]!, fourthWorkers = workers();
  await runtime.stop(fresh.install_id);
  await assertProcessesExit([fourthRunner.pid, ...fourthWorkers]);
  assert.equal(await nobodyRuns(), true);
});

test("S-75 RAC-240 a replacement's untrusted schema is refused before explicit retained-data discard can touch the old library, ledger, KV or external file", { skip: process.platform !== "darwin", timeout: 60_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "sandbox-home-install-schema-")), bundlePath = join(home, "installed.mjs");
  writeFileSync(bundlePath, `export const operations={
    write:async(input,sdk)=>({value:JSON.stringify(await sdk.homeDatabase.transaction(JSON.parse(input)))}),
    all:async(input,sdk)=>({value:JSON.stringify(await sdk.homeDatabase.all(...JSON.parse(input)))}),
  };`);
  const probe = homePackage(bundlePath), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const runtime = (await host.ready()).runtime, caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: probe.permissions };
  const { install } = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.permissions });
  await runtime.start(install.install_id);
  await actions.invoke(caller, probe.write, JSON.stringify([add("old library")]));
  probe.storage[0]!.set("old", "old private value");
  await runtime.uninstall(install.install_id, { retain_private_data: true });
  const privateRows = () => {
    const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    try { return db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ? ORDER BY item_key").all(install.install_id); }
    finally { db.close(); }
  };
  const before = { record: structuredClone(runtime.get(install.install_id)), ledger: ledger(home), bytes: readFileSync(file(home)), kv: privateRows() };
  assert.equal(before.kv.length, 1);
  const victim = join(home, "outside.db"), outside = new DatabaseSync(victim);
  outside.exec("CREATE TABLE private_notes (text TEXT); INSERT INTO private_notes VALUES ('untouched');"); outside.close();
  const outsideBytes = readFileSync(victim), candidate = homePackage(bundlePath);
  candidate.definition.manifest = { ...candidate.definition.manifest, version: "1.1.0", databases: { home: { ...declaration,
    schema: `${declaration.schema} ATTACH DATABASE '${victim.replaceAll("'", "''")}' AS outside; UPDATE outside.private_notes SET text = 'changed';` } } };
  assert.throws(() => runtime.install({ trust: { level: "unsigned" }, definition: candidate.definition, deployment: "local", grants: candidate.permissions, discard_kept_data: true }),
    { code: "plugin.declaration_invalid" });
  assert.deepEqual(runtime.get(install.install_id), before.record);
  assert.deepEqual(ledger(home), before.ledger);
  assert.deepEqual(readFileSync(file(home)), before.bytes);
  assert.deepEqual(privateRows(), before.kv);
  assert.deepEqual(readFileSync(victim), outsideBytes);
  assert.equal(candidate.runners.length, 0);
  runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.permissions });
  await runtime.start(install.install_id);
  assert.equal(probe.storage.at(-1)!.get("old"), "old private value");
  assert.deepEqual(await actions.invoke(caller, probe.read, JSON.stringify(["SELECT text FROM sbxhome_notes", []])),
    { value: JSON.stringify([{ text: "old library" }]) });
  const pids = [probe.runners.at(-1)!.pid, ...workers()];
  await runtime.uninstall(install.install_id, { retain_private_data: true });
  await assertProcessesExit(pids);
});

test("S-75 RAC-240 the real development loader preserves sandbox execution and rejects bad Home schema before retrying a non-retaining cleanup", async t => {
  const home = mkdtempSync(join(tmpdir(), "sandbox-development-schema-")), projectFile = join(home, "project.db");
  seedDemoBoard(projectFile);
  const store = new LocalProjectDatabase(projectFile), privateData = new SqlitePluginPrivateStorage(store.db);
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const base = homePackage("unused.mjs"), manifest = { ...base.definition.manifest, kind: "integration" as const, actions: [] };
  const definition: PluginDefinition = { execution: "sandbox", manifest, async start() { throw new Error("must never start"); } };
  const repository = new MemoryPluginRuntimeRepository(), seed = new PluginRuntime(repository);
  const { install } = seed.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: base.permissions });
  // A concrete earlier, non-retaining uninstall with unfinished Host cleanup, as permitted by the pre-fix implementation.
  repository.save({ ...install, state: "uninstalled", retain_private_data: false });
  privateData.restoreInstallationData(install.install_id, [{ item_key: "old", item_value: "old private value" }]);
  const old = openSandboxHomeLibrary(home, owner, declaration, homeStores(), () => {}, instance); old.close();
  const db = new DatabaseSync(file(home));
  db.prepare("INSERT INTO sbxhome_notes (text) VALUES (?)").run("old library"); db.close();
  const before = { record: structuredClone(repository.get(install.install_id)), ledger: ledger(home), bytes: readFileSync(file(home)),
    kv: privateData.snapshotInstallationData(install.install_id) };
  const victim = join(home, "outside.db"), outside = new DatabaseSync(victim);
  outside.exec("CREATE TABLE private_notes (text TEXT); INSERT INTO private_notes VALUES ('untouched');"); outside.close();
  const outsideBytes = readFileSync(victim), directory = join(home, "package"); mkdirSync(directory);
  const candidate = { ...manifest, version: "1.1.0", databases: { home: { ...declaration,
    schema: `${declaration.schema} ATTACH DATABASE '${victim.replaceAll("'", "''")}' AS outside; UPDATE outside.private_notes SET text = 'changed';` } } };
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(candidate));
  writeFileSync(join(directory, "entry.mjs"), `export default {execution:"sandbox",manifest:${JSON.stringify(candidate)},async start(){throw new Error("must never start")}};`);
  const actions = new ActionService(), ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (id: string) => store.eventCursor(id) };
  await assert.rejects(runPluginDevelopment({ project_id: DEMO_PROJECT_ID, directory, grants: base.permissions, allow_unsigned_development: true }, {
    repository, project_id: DEMO_PROJECT_ID, actor_id: "local-plugin-developer", ui: new UiHost(),
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), actions: { registry: actions, client: actions, project_id: DEMO_PROJECT_ID },
    privateStorageFor: (context, declared) => privateData.forPlugin(context, declared), deleteInstallationData: id => privateData.deleteInstallationData(id),
    home: { directory: home, completeText: () => null, stores: homeStores() },
  }), { code: "plugin.declaration_invalid" });
  assert.deepEqual(repository.get(install.install_id), before.record);
  assert.deepEqual(ledger(home), before.ledger);
  assert.deepEqual(readFileSync(file(home)), before.bytes);
  assert.deepEqual(privateData.snapshotInstallationData(install.install_id), before.kv);
  assert.deepEqual(readFileSync(victim), outsideBytes);
});

test("S-75 RAC-246 a real sandbox reaches its Home library through the broker only when its operation declared it and the person approved it", { skip: process.platform !== "darwin", timeout: 30_000 }, async t => {
  const home = newHome(t);
  const { opened } = library(t, home);
  const bundlePath = join(home, "sandboxed.mjs");
  writeFileSync(bundlePath, `const attempt=async work=>{try{return {value:JSON.stringify(await work())}}catch(error){return {refused:String(error.code)}}};
    export const operations={
      write:(input,sdk)=>attempt(()=>sdk.homeDatabase.transaction(JSON.parse(input))),
      all:(input,sdk)=>attempt(()=>sdk.homeDatabase.all(...JSON.parse(input))),
      undeclared:(input,sdk)=>attempt(()=>sdk.homeDatabase.all('SELECT text FROM sbxhome_notes')),
      project:(input,sdk)=>attempt(()=>sdk.projectDatabase.all('SELECT text FROM sbxhome_notes')),
    };`);
  const contract: SandboxPluginContract = { version: 1, pluginId: PLUGIN_ID, revision: "one", entities: [], pages: [], acceptance: [], operations: [
    sandboxed("write", "command", { homeDatabase: ["write"] }), sandboxed("all", "query", { homeDatabase: ["read"] }), sandboxed("undeclared", "query", {}),
    sandboxed("project", "query", { projectDatabase: ["read"] })] };
  const start = (grants: SandboxEffects) => createSandboxRunner({ bundlePath, contract, grants, services: { homeDatabase: sandboxDatabase(opened.statements) },
    identity: { projectId: "p", installationId: "i", pluginId: PLUGIN_ID, namespace: "installed" } });
  const runner = await start({ homeDatabase: ["read", "write"] }), readOnly = await start({ homeDatabase: ["read"] }), nothing = await start({});
  const call = async (operation: string, input: unknown, on = runner) => await on.call(operation, JSON.stringify(input)) as { value?: string; refused?: string };
  const insert = (text: string) => ({ sql: "INSERT INTO sbxhome_notes (text) VALUES (?)", parameters: [text] });
  try {
    assert.deepEqual(await call("write", [insert("沙箱写的")]), { value: JSON.stringify([{ changes: 1 }]) });
    assert.deepEqual(await call("all", ["SELECT text FROM sbxhome_notes ORDER BY id", []]), { value: JSON.stringify([{ text: "沙箱写的" }]) });
    assert.deepEqual(rows(home), ["沙箱写的"]);
    // The operation did not declare it, the person approved a read only, the person approved nothing, or the call is for a service the package was not given: each is the broker's refusal.
    assert.deepEqual(await call("undeclared", []), { refused: "sandbox.not_authorized" });
    assert.deepEqual(await call("write", [insert("读授权")], readOnly), { refused: "sandbox.not_authorized" });
    assert.deepEqual(await call("all", ["SELECT text FROM sbxhome_notes", []], nothing), { refused: "sandbox.not_authorized" });
    assert.deepEqual(await call("project", []), { refused: "sandbox.not_authorized" }, "the library in the Home is not the project's: that effect names a service this package was not given");
    assert.deepEqual(rows(home), ["沙箱写的"], "a refused write wrote nothing");
    // What crosses is bounded before the Host sees it.
    assert.deepEqual(await call("all", ["SELECT ?", [true]]), { refused: "sandbox.invalid_request" });
    assert.deepEqual(await call("write", []), { refused: "sandbox.invalid_request" });
  } finally {
    for (const item of [runner, readOnly, nothing]) await item.stop();
  }
});
