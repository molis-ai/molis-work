import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginDatabase, PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxServiceContext } from "@molis-ai/molis-work-plugin-sandbox";
import { LocalProjectDatabase, openPluginProjectLibrary, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginStatementGuard, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxDatabase } from "@molis-ai/molis-work-plugin-sandbox";

// S-46, the limits half (BL-395; specs/repository-anti-corruption/slices/sandbox-project-database-limits.md): a sandboxed plugin's
// statements run on the Host's own thread, and neither SQLite driver the Host has can interrupt one that is running. What can be
// bounded is bounded here: a read hands the Host at most 1000 rows to build, however many the statement would give and however the
// statement tries to get out of the bound; a result over 512 KiB is refused; a recursive query, which nothing bounds, never starts.
// The library is a real file under a temporary directory; nothing here opens a Home.

const REFUSED = { code: "plugin.project_database.statement_refused" } as const;
const TOO_LARGE = { code: "sandbox.database_result_too_large" } as const;
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

const context = (): SandboxServiceContext => ({ identity: { projectId: "p", installationId: "i", pluginId: PLUGIN_ID, namespace: "installed" },
  signal: new AbortController().signal, operationId: "sbxlimit.read" });

/** The Host's client over a real library file, with a spy on what the Host is asked and how many rows it builds for it. */
async function library(t: TestContext, rows: number, size = 8) {
  const directory = mkdtempSync(join(tmpdir(), "sandbox-project-limits-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const opened = openPluginProjectLibrary({ db: store.db, path: file }, manifest, () => {}, { install_id: "sbxlimit", installation_generation: "1" });
  t.after(() => { opened.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const insert = store.db.prepare("INSERT INTO sbxlimit_rows (text) VALUES (?)");
  store.db.transaction(() => { for (let n = 0; n < rows; n++) insert.run("x".repeat(size)); })();
  const asked: string[] = [], built: number[] = [];
  const spy: PluginDatabase = { get: opened.client.get, transaction: opened.client.transaction,
    all: (sql, parameters) => { asked.push(sql); const result = opened.client.all(sql, parameters); built.push(result.length); return result; } };
  return { store, client: opened.client, sandbox: sandboxDatabase(spy), asked, built };
}

const read = (sandbox: ReturnType<typeof sandboxDatabase>, sql: string, parameters: Array<string | number | null> = []) => sandbox.all(context(), { sql, parameters });

test("RAC-200 a read hands the Host at most 1000 rows to build, however many the statement would give: the rest is never built", async t => {
  const { sandbox, asked, built } = await library(t, 1500);
  await assert.rejects(read(sandbox, "SELECT id, text FROM sbxlimit_rows"), TOO_LARGE);
  assert.deepEqual(built, [ROWS + 1], "the Host built 1001 of the 1500 rows, not all of them");
  assert.match(asked[0]!, /LIMIT 1001$/u, "the bound is in the statement the Host runs");
  // A limit the plugin asks for under the bound is honoured, and so is its order.
  assert.equal((await read(sandbox, "SELECT id FROM sbxlimit_rows LIMIT 1000")).length, ROWS);
  await assert.rejects(read(sandbox, "SELECT id FROM sbxlimit_rows LIMIT 1001"), TOO_LARGE, "asking for more than the bound is refused, not cut");
  assert.deepEqual(await read(sandbox, "SELECT id FROM sbxlimit_rows ORDER BY id DESC LIMIT 2;"), [{ id: 1500 }, { id: 1499 }]);
  assert.deepEqual(await read(sandbox, "SELECT count(*) AS n FROM sbxlimit_rows -- all of them"), [{ n: 1500 }]);
});

test("RAC-201 a result over 512 KiB is refused, rows within the count or not", async t => {
  const { sandbox } = await library(t, 6, 100 * 1024);
  await assert.rejects(read(sandbox, "SELECT text FROM sbxlimit_rows"), TOO_LARGE);
  assert.equal((await read(sandbox, "SELECT text FROM sbxlimit_rows LIMIT 4")).length, 4, "four such rows are within the bytes");
});

test("RAC-202 a recursive query never starts, with the RECURSIVE keyword or without it, in a read or a write", async t => {
  const { store, client, sandbox } = await library(t, 3);
  const forever = (keyword: string) => `WITH ${keyword} r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT count(*) AS n FROM r`;
  for (const keyword of ["RECURSIVE", ""]) {
    // Run, either would hold the Host's thread for good: the test ends only because the statement is not run.
    assert.throws(() => client.all(forever(keyword)), REFUSED, `all, ${keyword || "no keyword"}`);
    assert.throws(() => client.get(forever(keyword)), REFUSED, `get, ${keyword || "no keyword"}`);
    await assert.rejects(read(sandbox, forever(keyword)), REFUSED, `across the channel, ${keyword || "no keyword"}`);
    await assert.rejects(sandbox.get(context(), { sql: forever(keyword), parameters: [] }), REFUSED, `get across the channel, ${keyword || "no keyword"}`);
  }
  const guard = pluginStatementGuard(store.db, record);
  assert.throws(() => guard("INSERT INTO sbxlimit_rows (text) WITH r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT 'y' FROM r", [], "write"), REFUSED, "a write");
  assert.throws(() => guard("SELECT n FROM (SELECT 1 AS n) WHERE n IN (WITH r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT x FROM r)", [], "read"), REFUSED, "inside a subquery");
  // A CTE that does not read itself is not one.
  assert.deepEqual(await read(sandbox, "WITH rows_(n) AS (SELECT count(*) FROM sbxlimit_rows) SELECT n FROM rows_"), [{ n: 3 }]);
});

test("RAC-203 a statement cannot write itself out of the bound: a block comment is refused before the Host sees it, a closing bracket stays inside the limit", async t => {
  const { sandbox, asked, built } = await library(t, 1500);
  // The comment would swallow the bracket and the limit that follows, leaving the Host to build every row.
  for (const sql of ["SELECT id FROM sbxlimit_rows /* all */", "SELECT 1) UNION ALL SELECT id FROM sbxlimit_rows /*"]) {
    await assert.rejects(read(sandbox, sql), { code: "sandbox.invalid_request" }, sql);
  }
  assert.deepEqual(asked, [], "the Host was not asked");
  // Closing the bracket early only puts more in the one statement the limit is on.
  await assert.rejects(read(sandbox, "SELECT 1 AS id) UNION ALL SELECT id FROM (SELECT id FROM sbxlimit_rows"), TOO_LARGE);
  await assert.rejects(read(sandbox, "SELECT 1 AS id) UNION ALL SELECT id FROM sbxlimit_rows WHERE (1"), TOO_LARGE);
  assert.deepEqual(built, [ROWS + 1, ROWS + 1], "still at most 1001 rows built");
});

test("RAC-204 what does not begin as a read goes to the Host as it is and is refused on its keywords, as before", async t => {
  const { store, sandbox, asked } = await library(t, 3);
  for (const sql of ["DELETE FROM sbxlimit_rows", "PRAGMA writable_schema = 1", "  \n-- a comment first\nSELECT 1", "INSERT INTO sbxlimit_rows (text) VALUES ('x')"]) {
    await assert.rejects(read(sandbox, sql), { code: "sandbox.database_error" }, JSON.stringify(sql));
  }
  assert.deepEqual(asked, ["DELETE FROM sbxlimit_rows", "PRAGMA writable_schema = 1", "  \n-- a comment first\nSELECT 1", "INSERT INTO sbxlimit_rows (text) VALUES ('x')"],
    "each reached the Host unchanged, where the keyword filter refuses it before SQLite prepares it");
  assert.equal(Number((store.db.prepare("SELECT count(*) AS n FROM sbxlimit_rows").get() as { n: number }).n), 3);
});

test("RAC-205 a name a statement repeats comes back as name:1, the one visible change of the bound", async t => {
  const { sandbox } = await library(t, 1);
  assert.deepEqual(await read(sandbox, "SELECT a.id, b.id FROM sbxlimit_rows AS a, sbxlimit_rows AS b"), [{ id: 1, "id:1": 1 }]);
});
