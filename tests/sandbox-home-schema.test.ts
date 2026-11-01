import assert from "node:assert/strict";
import { ChildProcess, execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginHomeSchema, inspectPluginHomeSchema, inspectPluginProjectSchema, type PluginProjectSchemaInspector } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, homeSqlitePath, listSqliteObjects } from "@molis-ai/molis-work-storage";
import { homeStores, installedLibrarySnapshots, openSandboxHomeLibrary } from "@molis-ai/molis-work-app-local-host";

const declaration: HomePluginDatabaseDeclaration = { store_name: "schema-probe", version: 1, schema: "CREATE TABLE own_rows (id INTEGER PRIMARY KEY, text TEXT);",
  read_permission: "own:read", write_permission: "own:write" };
const owner = { plugin_id: "io.molis.work.schema-probe", publisher_signature: "test-publisher" };
const instance = { install_id: "schema-probe", installation_generation: "first" };
const inspector: PluginProjectSchemaInspector = { scratch: () => new DatabaseSync(":memory:"), objects: listSqliteObjects, shape: describeSqliteSchema };
const invalid = { code: "plugin.project_database.declaration_invalid" };
function home(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), "t397-schema-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
const open = (directory: string, input = declaration) => openSandboxHomeLibrary(directory, owner, input, homeStores(), () => {}, instance);
const ledgerFile = (directory: string) => homeSqlitePath(directory, "plugin-libraries");

test("RAC2866 Home lexical checks reject non-CREATE statements before scratch execution, while quoted and commented semicolons keep their SQLite meaning", () => {
  let scratched = false;
  const unused = { ...inspector, scratch() { scratched = true; return inspector.scratch(); } };
  for (const schema of [
    "ATTACH DATABASE '/tmp/no' AS other;", "DETACH DATABASE other;", "PRAGMA journal_mode = OFF;",
    "CREATE VIEW v AS SELECT 1;", "CREATE VIRTUAL TABLE v USING fts5(body);",
    "CREATE TRIGGER t AFTER INSERT ON own_rows BEGIN SELECT 1; END;",
    "CREATE TABLE main.own_rows (id);", 'CREATE TABLE "main"."own_rows" (id);',
    "CREATE TABLE made AS SELECT 1;", "CREATE TABLE own_rows (id); PRAGMA user_version=2;",
    "CREATE TABLE own_rows (id); /* not closed", "CREATE TABLE own_rows (id TEXT DEFAULT 'not closed);",
  ]) assert.throws(() => inspectPluginHomeSchema({ ...declaration, schema }, unused), invalid, schema);
  assert.equal(scratched, false, "no rejected statement reaches even an empty database");
  const schema = `-- ; CREATE is only a comment\nCREATE TABLE "own;rows" (id INTEGER PRIMARY KEY, text TEXT DEFAULT 'a;''b');
    /* ; DROP TABLE is only a comment */ CREATE INDEX "own;index" ON "own;rows"(text);`;
  assert.deepEqual(inspectPluginHomeSchema({ ...declaration, schema }, inspector).objects, ["own;index", "own;rows"]);
});

test("RAC2866 Home has no project_root foreign-key exception; PLIB-03's project wrapper keeps it", () => {
  const schema = "CREATE TABLE own_rows (project_id TEXT REFERENCES project_root(project_id));";
  assert.throws(() => inspectPluginHomeSchema({ ...declaration, schema }, inspector), invalid);
  assert.deepEqual(inspectPluginProjectSchema({ ...declaration, schema }, inspector).tables, ["own_rows"]);
  assert.doesNotThrow(() => inspectPluginHomeSchema({ ...declaration, schema: "CREATE TABLE parent(id PRIMARY KEY); CREATE TABLE child(id REFERENCES parent(id));" }, inspector));
  assert.throws(() => inspectPluginHomeSchema({ ...declaration, schema: "CREATE TABLE own_rows (id INTEGER PRIMARY KEY AUTOINCREMENT);" }, inspector), invalid);
});

test("RAC2866 the 262144 UTF-8 byte and 128 explicit CREATE boundaries are enforced before scratch, without imposing them on project declarations", () => {
  const prefix = declaration.schema + "/*汉";
  const exact = prefix + "x".repeat(262144 - Buffer.byteLength(prefix) - 2) + "*/";
  assert.equal(Buffer.byteLength(exact), 262144);
  assert.doesNotThrow(() => assertPluginHomeSchema(exact));
  assert.doesNotThrow(() => inspectPluginHomeSchema({ ...declaration, schema: exact }, inspector));
  assert.throws(() => assertPluginHomeSchema(exact + " "), invalid);
  const statements = Array.from({ length: 128 }, (_, i) => `CREATE TABLE own_${i}(id INTEGER PRIMARY KEY);`).join("\n");
  assert.equal(inspectPluginHomeSchema({ ...declaration, schema: statements }, inspector).tables.length, 128);
  const oneMore = statements + "CREATE TABLE own_128(id);";
  let scratched = false;
  assert.throws(() => inspectPluginHomeSchema({ ...declaration, schema: oneMore }, { ...inspector, scratch() { scratched = true; return inspector.scratch(); } }), invalid);
  assert.equal(scratched, false);
  assert.equal(inspectPluginProjectSchema({ ...declaration, schema: oneMore }, inspector).tables.length, 129);
});

test("RAC2866 rejected Home DDL makes no real library or ledger and cannot change an external sentinel", async t => {
  const directory = home(t), sentinel = join(directory, "sentinel");
  writeFileSync(sentinel, "keep");
  for (const schema of ["CREATE TABLE own_rows(id); ATTACH DATABASE '/tmp/forbidden' AS stolen;",
    "CREATE TABLE own_rows(id REFERENCES project_root(project_id));", "CREATE TABLE own_rows(id REFERENCES someone_else(id));"]) {
    await assert.rejects(open(directory, { ...declaration, schema }), invalid);
    assert.equal(existsSync(join(directory, declaration.store_name)), false);
    assert.equal(existsSync(ledgerFile(directory)), false, "scratch rejection precedes the ledger owner");
    assert.equal(readFileSync(sentinel, "utf8"), "keep");
  }
});

test("RAC2867 a real ledger INSERT failure removes only its new library, keeps the earlier owner, and retries after the fault is removed", async t => {
  const directory = home(t);
  (await open(directory)).close();
  const ledger = new DatabaseSync(ledgerFile(directory));
  t.after(() => ledger.close());
  ledger.exec("CREATE TRIGGER refuse_new BEFORE INSERT ON plugin_home_libraries BEGIN SELECT RAISE(ABORT, 'ledger write refused'); END;");
  const another = { ...declaration, store_name: "failed-library" };
  await assert.rejects(openSandboxHomeLibrary(directory, { ...owner, plugin_id: owner.plugin_id + ".next" }, another, homeStores(), () => {}, instance), /ledger write refused/u);
  assert.equal(existsSync(join(directory, another.store_name)), false);
  assert.equal(installedLibrarySnapshots(directory, homeStores()).length, 1);
  assert.equal(existsSync(homeSqlitePath(directory, declaration.store_name)), true);
  ledger.exec("DROP TRIGGER refuse_new;");
  (await openSandboxHomeLibrary(directory, { ...owner, plugin_id: owner.plugin_id + ".next" }, another, homeStores(), () => {}, instance)).close();
  assert.equal(installedLibrarySnapshots(directory, homeStores()).length, 2);
});

function live(pid: number): boolean {
  try { return !execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim().startsWith("Z"); }
  catch { return false; }
}

test("RAC2866 RAC2867 DDL-1 the independent controller kills native initialization while its Host is synchronously blocked; cleanup waits for exit and the next open works", { timeout: 20_000 }, async t => {
  const directory = home(t), target = { ...declaration, store_name: "interrupted-library" };
  (await open(directory)).close();
  const ledger = new DatabaseSync(ledgerFile(directory));
  t.after(() => ledger.close());
  // The business baseline has committed by the time this real ledger INSERT reaches an endless native SQLite query.
  ledger.exec(`CREATE TRIGGER hold_new BEFORE INSERT ON plugin_home_libraries WHEN NEW.store_name = '${target.store_name}'
    BEGIN SELECT (WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n) SELECT count(*) FROM n); END;`);
  const sentinel = join(directory, "sentinel"); writeFileSync(sentinel, "keep");
  const host = fork(fileURLToPath(new URL("./fixtures/home-schema-parent.ts", import.meta.url)), [], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let diagnostic = "";
  let stage = "waiting for disposable Host PID";
  t.after(() => { if (stage !== "done") t.diagnostic(`${stage}\n${diagnostic}`); });
  host.stderr?.on("data", chunk => { diagnostic += String(chunk); });
  let pid: number | undefined;
  t.after(() => { host.kill("SIGKILL"); if (pid && live(pid)) process.kill(pid, "SIGKILL"); });
  const first = Promise.race([once(host, "message"), once(host, "exit").then(() => { throw new Error(diagnostic || "disposable Host exited before reporting its SQL process"); })]);
  host.send({ home: directory, owner: { ...owner, plugin_id: owner.plugin_id + ".interrupted" }, declaration: target });
  const [ready] = await first; pid = (ready as { pid: number }).pid; assert.ok(pid, JSON.stringify(ready));
  stage = `observing SQL process ${pid} while Host ${host.pid} blocks`;
  const settled = Promise.race([once(host, "message"), once(host, "exit").then(() => { throw new Error(diagnostic || "disposable Host exited before returning its initialization outcome"); })]);
  host.send("block");
  const dispatched = Date.now();
  while (!existsSync(homeSqlitePath(directory, target.store_name)) && Date.now() - dispatched < 1500) await sleep(25);
  assert.equal(existsSync(homeSqlitePath(directory, target.store_name)), true, "real initialization reached the ledger INSERT after making the business library");
  while (live(pid) && Date.now() - dispatched < 4000) await sleep(25);
  assert.equal(live(pid), false, "the SQL process has actually exited while the Host's event loop is still blocked for 5 seconds");
  assert.equal(existsSync(homeSqlitePath(directory, target.store_name)), true, "the blocked Host has not run cleanup yet");
  stage = "SQL process exited; waiting for blocked Host to reconcile";
  const [answer] = await settled;
  assert.equal((answer as { code: string }).code, "plugin.project_database.statement_timeout");
  assert.equal(existsSync(join(directory, target.store_name)), false, "only after exit did the owner remove the new unrecorded residue");
  assert.equal(installedLibrarySnapshots(directory, homeStores()).length, 1);
  assert.equal(readFileSync(sentinel, "utf8"), "keep");
  ledger.exec("DROP TRIGGER hold_new;");
  const fresh = await openSandboxHomeLibrary(directory, { ...owner, plugin_id: owner.plugin_id + ".interrupted" }, target, homeStores(), () => {}, instance);
  assert.deepEqual(await fresh.statements.all("SELECT count(*) AS n FROM own_rows", [], { rows: 1, bytes: 100 }, new AbortController().signal), [{ n: 0 }]);
  fresh.close();
  stage = "done";
});

test("RAC2867 losing the real initialization confirmation preserves the committed owner and library, and reopening checks them without replaying DDL", async t => {
  const directory = home(t);
  const emit = ChildProcess.prototype.emit;
  ChildProcess.prototype.emit = function(event, ...values) {
    if (event === "message" && this.spawnargs.some(arg => arg.endsWith("/project-statement-worker.js")) && (values[0] as { ok?: boolean })?.ok === true) {
      this.kill("SIGKILL"); return true;
    }
    return emit.call(this, event, ...values);
  };
  try { await assert.rejects(open(directory), { code: "actions.outcome_unknown" }); }
  finally { ChildProcess.prototype.emit = emit; }
  assert.equal(installedLibrarySnapshots(directory, homeStores()).length, 1);
  const db = new DatabaseSync(homeSqlitePath(directory, declaration.store_name));
  db.exec("INSERT INTO own_rows VALUES (1, 'kept after unknown');"); db.close();
  const reopened = await open(directory);
  assert.deepEqual(await reopened.statements.all("SELECT text FROM own_rows", [], { rows: 1, bytes: 100 }, new AbortController().signal), [{ text: "kept after unknown" }]);
  reopened.close();
  assert.equal(installedLibrarySnapshots(directory, homeStores()).length, 1, "no duplicate owner or automatic replay");
});
