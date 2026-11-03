import assert from "node:assert/strict";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxServiceContext } from "@molis-ai/molis-work-plugin-sandbox";
import { LocalProjectDatabase, openPluginProjectLibrary, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginStatementGuard, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxDatabase } from "@molis-ai/molis-work-plugin-sandbox";

// S-59 (BL-395; specs/repository-anti-corruption/slices/sandbox-project-database-limits.md): a sandboxed plugin's statements run in
// a process the Host can kill, not on the Host's thread, because neither SQLite driver the Host has can interrupt a statement and
// `Worker.terminate()` cannot stop a native call. What this file asserts is the refusal: a statement past its time or its memory is
// killed and answered with a code, a result past the rows or bytes is refused before crossing to the Host, a recursive query never starts,
// a write interrupted before COMMIT leaves nothing, and a COMMIT interrupted in flight has an unknown outcome. The next independent
// statement after a killed process runs on a clean connection. The
// library is a real file under a temporary directory and the processes are real; nothing here opens a Home.

const REFUSED = { code: "plugin.project_database.statement_refused" } as const;
const TOO_LARGE = { code: "sandbox.database_result_too_large" } as const;
const TIMEOUT = { code: "plugin.project_database.statement_timeout" } as const;
const MEMORY = { code: "plugin.project_database.statement_memory" } as const;
const ROWS = 1000;

/** The plugin that exists only for this test: one table of its own in the project's library. */
const declaration: PluginDatabaseDeclaration = { store_name: "sbxlimit", version: 1, read_permission: "sbxlimit:read", write_permission: "sbxlimit:write",
  schema: "CREATE TABLE sbxlimit_rows (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const PLUGIN_ID = "io.molis.work.example.sbxlimit";
const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: PLUGIN_ID, kind: "app",
  publisher: { publisher_id: "molis", signature: "probe-sbxlimit" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: ["storage:private", declaration.read_permission, declaration.write_permission].map(permission => ({ permission, required: true, reason: "读写自己的表" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [],
  databases: { project: declaration }, upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
const record: PluginProjectDatabaseRecord = { plugin_id: PLUGIN_ID, publisher_signature: "probe-sbxlimit", store_name: "sbxlimit", version: 1,
  objects: ["sbxlimit_rows"], created_at: new Date(0).toISOString() };

const context = (signal: AbortSignal = new AbortController().signal): SandboxServiceContext => ({ identity: { projectId: "p", installationId: "i", pluginId: PLUGIN_ID, namespace: "installed" },
  signal, operationId: "sbxlimit.read" });

/** Statements that run for minutes if nothing stops them: 1500 x 1500 x 1500 rows of a cross join. */
const SLOW = "SELECT count(*) AS n FROM sbxlimit_rows AS a, sbxlimit_rows AS b, sbxlimit_rows AS c";
const SLOW_WRITE = `UPDATE sbxlimit_rows SET text = (${SLOW})`;

/** The statement processes this test process has running now: its own children whose command line is the worker's. */
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

/** The sandbox's service over a real library file, with the grants the test can take back and the limits it can shorten. */
async function library(t: TestContext, rows: number, size = 8, limits: NonNullable<Parameters<typeof openPluginProjectLibrary>[4]> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sandbox-project-limits-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const grants: { revokeAfter: number; calls: number; onWrite?: () => void } = { revokeAfter: Number.POSITIVE_INFINITY, calls: 0 };
  const authorize = (permission: string) => {
    if (++grants.calls > grants.revokeAfter) throw new ActionError("actions.forbidden", "撤权了");
    if (permission === declaration.write_permission) grants.onWrite?.();
  };
  const opened = openPluginProjectLibrary({ db: store.db, path: file }, manifest, authorize, { install_id: "sbxlimit", installation_generation: "1" }, limits);
  t.after(() => { opened.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const insert = store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES (?)");
  store.db.transaction(() => { for (let n = 0; n < rows; n++) insert.run("x".repeat(size)); })();
  const count = () => Number((store.db.prepare("SELECT count(*) AS n FROM sbxlimit_rows").get() as { n: number }).n);
  return { store, opened, grants, count, file, sandbox: sandboxDatabase(opened.statements) };
}

const read = (sandbox: ReturnType<typeof sandboxDatabase>, sql: string, parameters: Array<string | number | null> = []) => sandbox.all(context(), { sql, parameters });
const write = (sandbox: ReturnType<typeof sandboxDatabase>, ...statements: Array<{ sql: string; parameters?: Array<string | number | null> }>) =>
  sandbox.transaction(context(), statements.map(statement => ({ sql: statement.sql, parameters: statement.parameters ?? [] })));
const add = (text: string) => ({ sql: "INSERT INTO sbxlimit_rows (text) VALUES (?)", parameters: [text] });

test("S-59 RAC-200 a read gives at most 1000 rows and the rest is never built: the process stops reading at the first row past the bound", async t => {
  const { sandbox } = await library(t, 1500);
  await assert.rejects(read(sandbox, "SELECT id, text FROM sbxlimit_rows"), TOO_LARGE);
  // A cross join of 2.25 million rows is stopped at row 1001 the same way; it is not built and then cut.
  await assert.rejects(read(sandbox, "SELECT a.id, b.id AS other FROM sbxlimit_rows AS a, sbxlimit_rows AS b"), TOO_LARGE);
  // A limit the plugin asks for under the bound is honoured, and so is its order.
  assert.equal((await read(sandbox, "SELECT id FROM sbxlimit_rows LIMIT 1000")).length, ROWS);
  await assert.rejects(read(sandbox, "SELECT id FROM sbxlimit_rows LIMIT 1001"), TOO_LARGE, "asking for more than the bound is refused, not cut");
  assert.deepEqual(await read(sandbox, "SELECT id FROM sbxlimit_rows ORDER BY id DESC LIMIT 2;"), [{ id: 1500 }, { id: 1499 }]);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows -- all of them"), [{ n: 1500 }]);
  assert.deepEqual(await read(sandbox, "SELECT /* a block comment is only a comment now */ count(*) AS n FROM sbxlimit_rows"), [{ n: 1500 }]);
});

test("S-59 RAC-201 a result over 512 KiB is refused, rows within the count or not", async t => {
  const { sandbox } = await library(t, 6, 100 * 1024);
  await assert.rejects(read(sandbox, "SELECT text FROM sbxlimit_rows"), TOO_LARGE);
  assert.equal((await read(sandbox, "SELECT text FROM sbxlimit_rows LIMIT 4")).length, 4, "four such rows are within the bytes");
  await assert.rejects(sandbox.get(context(), { sql: "SELECT group_concat(text, '') AS text FROM sbxlimit_rows", parameters: [] }), TOO_LARGE);
  assert.equal((await sandbox.get(context(), { sql: "SELECT text FROM sbxlimit_rows LIMIT 1", parameters: [] }))?.text, "x".repeat(100 * 1024));
});

test("S-59 RAC-203 the child releases its transaction lock while the Host is blocked in a synchronous write", async t => {
  const transactionMs = 600;
  const { store, sandbox, grants, count } = await library(t, 3, 8, { transactionMs, writeMs: 2000 });
  await read(sandbox, "SELECT 1");
  let writes = 0, elapsed = -1;
  grants.onWrite = () => {
    // beforeEffect's two checks, first statement's check, then the second: the first INSERT has answered and still holds the lock.
    if (++writes !== 4) return;
    const started = Date.now();
    store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES ('Host write')").run();
    elapsed = Date.now() - started;
  };
  await assert.rejects(write(sandbox, add("rolled back"), add("never sent")), TIMEOUT);
  assert.ok(elapsed >= 0 && elapsed < transactionMs + 1000, `the synchronous Host write succeeded after ${elapsed} ms`);
  assert.equal(count(), 4, "only the Host's write remains; the sandbox's first INSERT rolled back");
  grants.onWrite = undefined;
  assert.deepEqual(await write(sandbox, add("next transaction")), [{ changes: 1 }]);
});

test("S-59 RAC-203 the total deadline includes gaps between short statements and does not survive a completed transaction", async t => {
  const { sandbox, grants, count } = await library(t, 3, 8, { transactionMs: 500, writeMs: 2000 });
  await read(sandbox, "SELECT 1");
  let writes = 0;
  grants.onWrite = () => { if (++writes === 4 || writes === 5) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); };
  await assert.rejects(write(sandbox, add("one"), add("two"), add("three")), TIMEOUT);
  assert.equal(count(), 3);
  grants.onWrite = undefined;
  assert.deepEqual(await write(sandbox, add("short")), [{ changes: 1 }]);
  const [pid] = workers();
  await sleep(650);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows"), [{ n: 4 }]);
  assert.deepEqual(workers(), [pid], "the completed transaction's old timer cannot kill a reused process");
});

test("S-59 RAC-208 a process killed between statements cannot run the rest on a replacement", async t => {
  const { sandbox, grants, count } = await library(t, 3);
  await read(sandbox, "SELECT 1");
  const [pid] = workers(); assert.ok(pid);
  let writes = 0;
  grants.onWrite = () => {
    if (++writes !== 4) return;
    process.kill(pid, "SIGKILL");
    const until = Date.now() + 1000;
    while (live(pid) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    assert.equal(live(pid), false, "the original statement process has actually exited");
  };
  await assert.rejects(write(sandbox, add("one"), add("two")), { code: "plugin.project_database.process_failed" });
  assert.equal(count(), 3);
  assert.deepEqual(workers(), [], "no replacement was started for the second statement");
  grants.onWrite = undefined;
  assert.deepEqual(await write(sandbox, add("independent transaction")), [{ changes: 1 }]);
});

function live(pid: number): boolean {
  try { return !execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim().startsWith("Z"); }
  catch { return false; }
}

function cpuTime(pid: number): number {
  const parts = execFileSync("ps", ["-o", "time=", "-p", String(pid)], { encoding: "utf8" }).trim().split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

test("S-59 RAC-209 killing the Host during native SQL also ends its child and releases the write lock", { timeout: 15_000 }, async t => {
  let parent: ChildProcess | undefined, pid: number | undefined;
  t.after(() => { parent?.kill("SIGKILL"); if (pid && live(pid)) process.kill(pid, "SIGKILL"); });
  const { file, store, count } = await library(t, 1500);
  parent = fork(fileURLToPath(new URL("./fixtures/project-statement-parent.ts", import.meta.url)), [], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const ready = once(parent, "message");
  parent.send({ file, manifest, sql: SLOW_WRITE });
  const [message] = await ready;
  pid = (message as { pid: number }).pid; assert.ok(pid);
  const first = cpuTime(pid);
  parent.send("run");
  const warming = Date.now();
  while (cpuTime(pid) < first + 0.1 && Date.now() - warming < 1000) await sleep(30);
  assert.ok(cpuTime(pid) >= first + 0.1, "the statement is executing native SQL before the Host is killed");
  const ended = once(parent, "exit"); parent.kill("SIGKILL"); await ended;
  const killed = Date.now();
  while (live(pid) && Date.now() - killed < 3000) await sleep(25);
  assert.equal(live(pid), false, "the orphan exits within the write deadline plus one second");
  const started = Date.now(); store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES ('restarted Host')").run();
  assert.ok(Date.now() - started < 1000, "the restarted Host's writer has no stale lock to wait for");
  assert.equal(count(), 1501, "the dead Host's uncommitted INSERT did not survive");
});

test("S-59 RAC-208 closing the plugin after COMMIT was sent reports an unknown outcome", async t => {
  const { sandbox, opened, grants, count } = await library(t, 3);
  let writes = 0;
  grants.onWrite = () => {
    // The fourth grant is immediately before COMMIT. Its IPC send runs synchronously before this microtask disposes it.
    if (++writes === 4) queueMicrotask(() => opened.close());
  };
  await assert.rejects(write(sandbox, add("commit may have landed")), { code: "actions.plugin_unavailable", outcome: "unknown" });
  assert.equal(writes, 4);
  assert.ok(count() === 3 || count() === 4, "COMMIT may have landed; a response lost during close cannot prove rollback");
  await assert.rejects(write(sandbox, add("after close")), { code: "actions.plugin_unavailable", outcome: undefined });
});

test("S-59 RAC-208 the real statement engine refuses run and commit outside a transaction", async t => {
  const { file, count } = await library(t, 3);
  const child = fork(fileURLToPath(new URL("./project-statement-worker.js", import.meta.resolve("@molis-ai/molis-work-app-local-host"))), [], {
    execArgv: ["--max-old-space-size=96"], stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  t.after(() => { child.kill("SIGKILL"); });
  let id = 0;
  const ask = async (request: object) => {
    const response = once(child, "message");
    child.send({ ...request, id: ++id, deadline: Date.now() + 5000 });
    return (await response)[0] as { ok: boolean; kind?: string };
  };
  assert.equal((await ask({ op: "open", path: file, record, limits: { heapMb: 96, rssMb: 256, sampleMs: 50 } })).ok, true);
  assert.deepEqual(await ask({ op: "run", ...add("must not autocommit") }).then(reply => [reply.ok, reply.kind]), [false, "refused"]);
  assert.deepEqual(await ask({ op: "commit" }).then(reply => [reply.ok, reply.kind]), [false, "refused"]);
  assert.equal(count(), 3);
});

test("S-59 RAC-202 a recursive query never starts, with the RECURSIVE keyword or without it, in a read, a get or a write", async t => {
  const { store, sandbox } = await library(t, 3);
  const forever = (keyword: string) => `WITH ${keyword} r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT count(*) AS n FROM r`;
  for (const keyword of ["RECURSIVE", ""]) {
    await assert.rejects(read(sandbox, forever(keyword)), REFUSED, `all, ${keyword || "no keyword"}`);
    await assert.rejects(sandbox.get(context(), { sql: forever(keyword), parameters: [] }), REFUSED, `get, ${keyword || "no keyword"}`);
  }
  await assert.rejects(write(sandbox, { sql: "INSERT INTO sbxlimit_rows (text) WITH r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT 'y' FROM r" }), REFUSED, "a write");
  await assert.rejects(read(sandbox, "SELECT n FROM (SELECT 1 AS n) WHERE n IN (WITH r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT x FROM r)"), REFUSED, "inside a subquery");
  // The same check is the Host's for a plugin in its own process.
  assert.throws(() => pluginStatementGuard(store.db, record)(forever("RECURSIVE"), [], "read"), REFUSED);
  // A CTE that does not read itself is not one, and the process is none the worse for the refusals.
  assert.deepEqual(await read(sandbox, "WITH rows_(n) AS (SELECT count(*) FROM sbxlimit_rows) SELECT n FROM rows_"), [{ n: 3 }]);
});

test("S-59 RAC-203 a write that runs past its time is killed with its transaction: none of its statements stays, the library is free, and the next transaction runs", async t => {
  const { store, sandbox, count } = await library(t, 1500, 8, { writeMs: 400 });
  await assert.rejects(write(sandbox, add("不该留下"), { sql: SLOW_WRITE }), TIMEOUT);
  assert.equal(count(), 1500, "the insert before the slow statement was rolled back with it");
  assert.equal(Number((store.db.prepare("SELECT count(DISTINCT text) AS n FROM sbxlimit_rows").get() as { n: number }).n), 1, "and the slow statement's update did not land either");
  // The write lock went with the process: the Host's own connection writes at once instead of waiting out its busy timeout.
  const started = Date.now();
  store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES ('宿主写')").run();
  assert.ok(Date.now() - started < 1000, "no lock left behind");
  assert.deepEqual(await write(sandbox, add("之后的事务")), [{ changes: 1 }], "a fresh process runs the next transaction");
  assert.equal(count(), 1502);
});

test("S-59 RAC-204 what is not a read or a write is refused on its keywords: a read before any process is asked, a transaction rolled back whole", async t => {
  assert.ok(await nobodyRuns(), "an earlier test's process is gone");
  const { store, sandbox, count } = await library(t, 3);
  for (const sql of ["DELETE FROM sbxlimit_rows", "PRAGMA writable_schema = 1", "  \n-- a comment first\nSELECT 1", "INSERT INTO sbxlimit_rows (text) VALUES ('x')"]) {
    await assert.rejects(read(sandbox, sql), { code: "sandbox.database_error" }, JSON.stringify(sql));
  }
  assert.equal(workers().length, 0, "a read refused on its keywords starts no process");
  await assert.rejects(write(sandbox, add("留不下"), { sql: "SELECT 1" }), { code: "sandbox.database_error" }, "a transaction takes INSERT, UPDATE and DELETE");
  await assert.rejects(write(sandbox, add("留不下"), { sql: "DROP TABLE sbxlimit_rows" }), { code: "sandbox.database_error" });
  assert.equal(count(), 3);
  assert.equal(Number((store.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'sbxlimit_rows'").get() as { n: number }).n), 1);
});

test("S-59 RAC-205 a read that runs past its time is killed and answered with a code while the Host keeps running; the next read runs in a fresh process", async t => {
  const { sandbox } = await library(t, 1500, 8, { readMs: 400 });
  assert.deepEqual(await read(sandbox, "SELECT 1 AS one"), [{ one: 1 }]);
  const [first] = workers();
  assert.ok(first, "the process is up after the first statement");
  // The Host's own thread is free while the statement runs: a timer on it keeps ticking.
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 20);
  try { await assert.rejects(read(sandbox, SLOW), TIMEOUT); } finally { clearInterval(timer); }
  assert.ok(ticks >= 10, `the Host's loop ran ${ticks} times while the statement did`);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows"), [{ n: 1500 }]);
  const [second] = workers();
  assert.ok(second && second !== first, "the killed process was replaced, not reused");
});

test("S-59 RAC-207 a statement that takes more than the memory limit is killed while it grows, and a refusal for it comes with a code", async t => {
  const { sandbox } = await library(t, 1500, 8, { rssMb: 200, readMs: 20_000 });
  assert.deepEqual(await read(sandbox, "SELECT 1 AS one"), [{ one: 1 }]);
  // Ten megabytes of text per row, 1500 rows into one string: SQLite's own memory, which no V8 limit sees.
  await assert.rejects(read(sandbox, "SELECT length(group_concat(hex(zeroblob(5000000)))) AS n FROM sbxlimit_rows"), MEMORY);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows"), [{ n: 1500 }], "and the next statement runs");
});

test("S-59 RAC-208 a write cancelled or revoked before its COMMIT commits nothing; cancelling stops a running statement at once", async t => {
  const { store, sandbox, grants, count } = await library(t, 1500, 8, { writeMs: 20_000, transactionMs: 20_000 });
  // Revoked after the first statement ran and before the second: the first is rolled back with the rest.
  grants.revokeAfter = grants.calls + 7;
  await assert.rejects(write(sandbox, add("a"), add("b"), add("c")), { code: "actions.forbidden" });
  grants.revokeAfter = Number.POSITIVE_INFINITY;
  assert.equal(count(), 1500, "nothing of a revoked transaction stays");
  // Cancelled while a statement runs: the process is killed, the transaction goes with it.
  const controller = new AbortController();
  const pending = sandbox.transaction(context(controller.signal), [add("不该留下"), { sql: SLOW_WRITE, parameters: [] }]);
  const rejected = assert.rejects(pending, { code: "sandbox.database_error", message: "cancelled" });
  await sleep(300);
  controller.abort(new DOMException("cancelled", "AbortError"));
  await rejected;
  assert.ok(await nobodyRuns(), "the process is gone");
  assert.equal(count(), 1500);
  const started = Date.now();
  store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES ('宿主写')").run();
  assert.ok(Date.now() - started < 1000, "no lock left behind");
  // Cancelled before it starts: no process is asked at all.
  const early = new AbortController();
  early.abort(new DOMException("cancelled", "AbortError"));
  await assert.rejects(sandbox.transaction(context(early.signal), [add("没开始")]), { name: "AbortError" });
  assert.equal(count(), 1501);
  assert.equal(workers().length, 0, "and none was started for it");
});

test("S-59 RAC-209 the process leaves with the plugin: closing the plugin's library kills it, and every call after is refused", async t => {
  const { opened, sandbox } = await library(t, 3);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows"), [{ n: 3 }]);
  assert.equal(workers().length, 1, "one process for the plugin, started by its first statement");
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows"), [{ n: 3 }]);
  assert.equal(workers().length, 1, "and reused by the next");
  opened.close();
  assert.ok(await nobodyRuns(), "closing the library kills the process");
  await assert.rejects(read(sandbox, "SELECT 1"), { code: "actions.plugin_unavailable" });
  await assert.rejects(write(sandbox, add("太晚")), { code: "actions.plugin_unavailable" });
  assert.equal(workers().length, 0, "and no call starts a new one");
});
