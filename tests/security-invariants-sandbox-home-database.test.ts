import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxOperationContract, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createSandboxRunner, type SandboxServiceContext } from "@molis-ai/molis-work-plugin-sandbox";
import { homeStores, openSandboxHomeLibrary } from "@molis-ai/molis-work-app-local-host";
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
function library(t: TestContext, home: string, options: { owner?: typeof owner; declaration?: HomePluginDatabaseDeclaration; limits?: Parameters<typeof openSandboxHomeLibrary>[7] } = {}) {
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

test("S-68 RAC-240 a sandboxed package's Home library is made under the ledger with the install record's publisher, and its statements run in a process, not on the Host", async t => {
  const home = newHome(t);
  const { sandbox } = library(t, home);
  assert.deepEqual(ledger(home), [{ plugin_id: PLUGIN_ID, publisher_signature: "probe-sbxhome", store_name: "sbxhome" }]);
  const done = await sandbox.transaction(context(), [add("一行"), add("两行")]);
  assert.deepEqual(done, [{ changes: 1 }, { changes: 1 }]);
  assert.deepEqual(rows(home), ["一行", "两行"]);
  assert.deepEqual(await sandbox.all(context(), { sql: "SELECT text FROM sbxhome_notes ORDER BY id", parameters: [] }), [{ text: "一行" }, { text: "两行" }]);
  assert.equal(workers().length, 1, "the statements run in a child process of the Host");
});

test("S-68 RAC-241 another publisher's library, a name the Host or another plugin holds, and a library partitioned by project open nothing", async t => {
  const home = newHome(t);
  library(t, home);
  assert.throws(() => openSandboxHomeLibrary(home, { ...owner, publisher_signature: "someone-else" }, declaration, homeStores(), () => {}, instance),
    { code: "plugin.home_database.publisher_mismatch" });
  assert.throws(() => openSandboxHomeLibrary(home, { plugin_id: `${PLUGIN_ID}2`, publisher_signature: "probe-sbxhome" }, declaration, homeStores(), () => {}, instance),
    { code: "plugin.home_database.object_taken" });
  assert.throws(() => openSandboxHomeLibrary(home, { plugin_id: `${PLUGIN_ID}3`, publisher_signature: "probe-sbxhome" }, { ...declaration, store_name: "projects" }, homeStores(), () => {}, instance),
    { code: "plugin.home_database.object_taken" });
  const elsewhere = newHome(t);
  mkdirSync(join(elsewhere, "sbxother"));
  assert.throws(() => openSandboxHomeLibrary(elsewhere, owner, { ...declaration, store_name: "sbxother" }, homeStores(), () => {}, instance), { code: "plugin.home_database.object_taken" });
  assert.throws(() => openSandboxHomeLibrary(elsewhere, owner, { ...declaration, partition: "project" }, homeStores(), () => {}, instance), { code: "plugin.declaration_invalid" });
  assert.equal(existsSync(file(elsewhere)), false, "a refusal makes no library");
  assert.equal(await nobodyRuns() || workers().length <= 1, true, "a refusal starts no process");
});

test("S-68 RAC-242 a grant taken back, or a closed library, stops the next call before it reaches the process", async t => {
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

test("S-68 RAC-243 the keyword filters of the Host's own client apply: a write is not a read, a read is not a write, and a read that starts as a query cannot write", async t => {
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

test("S-68 RAC-244 a read past its time is killed and answered with a code while the Host keeps running; the next read runs in a fresh process", async t => {
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

test("S-68 RAC-245 a write past its time is killed with its transaction: none of its statements stays and the next transaction runs", async t => {
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

test("S-68 RAC-246 a real sandbox reaches its Home library through the broker only when its operation declared it and the person approved it", { skip: process.platform !== "darwin", timeout: 30_000 }, async t => {
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
