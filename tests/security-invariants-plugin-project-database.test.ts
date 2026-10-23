import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { PluginDatabase, PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxOperationContract, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, openPluginProjectLibrary, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PLUGIN_STATEMENT_SQLITE_VERSION, pluginStatementGuard, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import { assertContract, createSandboxRunner, sandboxDatabase } from "@molis-ai/molis-work-plugin-sandbox";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

// S-46, the per-statement half (PLIB-06, PLIB-08; specs/plugin-project-database §2.4): a plugin given `services.project_database`
// reaches its own tables in the project's library and nothing else. Every statement is read through `EXPLAIN` before it runs and
// refused for a step that makes or drops anything, a pragma, a b-tree that is not the plugin's own (the project's root row
// excepted, which it may read), a database other than the library, a write in a read, or a virtual table other than the JSON
// functions. The library is a real file under a temporary directory; nothing here opens a Home.

const REFUSED = { code: "plugin.project_database.statement_refused" } as const;

interface Probe { readonly id: string; readonly declaration: PluginDatabaseDeclaration; readonly definition: PluginDefinition; services(): PluginHostServices }

/** A plugin that exists only for the test: it declares its tables in the project's library and keeps the services it started with. */
function probe(name: string, schema: string): Probe {
  const id = `io.molis.work.example.${name}`;
  const declaration: PluginDatabaseDeclaration = { store_name: name, version: 1, read_permission: `${name}:read`, write_permission: `${name}:write`, schema };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", declaration.read_permission, declaration.write_permission].map(permission => ({ permission, required: true, reason: "读写自己的表" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [],
    databases: { project: declaration }, upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  let services: PluginHostServices | undefined;
  return { id, declaration, services: () => services ?? assert.fail(`${name} has not started`),
    definition: { manifest, async start(context) { services = context.services; return { kind: "app", views: [], actions: [] }; } } };
}

const notes = () => probe("libprobe", `
  CREATE TABLE libprobe_notes (id INTEGER PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE, text TEXT NOT NULL);
  CREATE INDEX libprobe_notes_text ON libprobe_notes(text);
  CREATE TABLE libprobe_tags (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES libprobe_notes(id) ON DELETE CASCADE, tag TEXT NOT NULL);`);
const items = () => probe("libother", "CREATE TABLE libother_items (id INTEGER PRIMARY KEY, text TEXT NOT NULL);");

/** The project platform the Host builds over a project's library file, with both probes started; `sandbox` makes the first one a plugin the Host runs outside its own process. */
async function platform(t: TestContext, sandbox = false) {
  const directory = mkdtempSync(join(tmpdir(), "plugin-project-library-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  const mine = notes(), other = items();
  const grants = ["storage:private", mine.declaration.read_permission, mine.declaration.write_permission];
  const starting = sandbox ? { definition: { ...mine.definition, execution: "sandbox" as const }, grants } : { definition: mine.definition, bundled: true as const };
  assert.deepEqual((await running.start([starting, { definition: other.definition, bundled: true }])).running.toSorted(), [mine.id, other.id].toSorted());
  const database = (plugin: Probe): PluginDatabase => plugin.services().project_database ?? assert.fail(`${plugin.id} was given no services.project_database`);
  const statements = (plugin: Probe) => plugin.services().project_statements ?? assert.fail(`${plugin.id} was given no services.project_statements`);
  const count = (table: string) => Number((store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);
  const installId = (plugin: Probe) => running.runtime.list().find(record => record.plugin_id === plugin.id)!.install_id;
  return { store, file, running, mine, other, database, statements, count, installId };
}

const write = (database: PluginDatabase, sql: string, parameters: Array<string | number | null> = []) =>
  database.transaction(async () => {}, tx => tx.run(sql, parameters));

test("PLIB-06 a plugin that declares databases.project gets services.project_database: its tables are made at start and recorded in the ledger, and it reads and writes them", async t => {
  const { store, mine, other, database, count } = await platform(t);
  for (const plugin of [mine, other]) {
    const row = store.db.prepare("SELECT publisher_signature FROM plugin_project_databases WHERE plugin_id = ?").get(plugin.id) as { publisher_signature: string } | undefined;
    assert.equal(row?.publisher_signature, `probe-${plugin.declaration.store_name}`, `${plugin.id}: recorded in the ledger at start`);
  }
  const db = database(mine);
  await write(db, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "一行"]);
  await db.transaction(async () => {}, tx => {
    const note = tx.get("SELECT id FROM libprobe_notes WHERE text = ?", ["一行"])!;
    tx.run("INSERT INTO libprobe_tags (note_id, tag) VALUES (?, ?)", [Number(note.id), "标签"]);
    tx.run("UPDATE libprobe_notes SET text = ? WHERE id = ?", ["改过", Number(note.id)]);
  });
  assert.deepEqual(db.all("SELECT n.text, t.tag FROM libprobe_notes n JOIN libprobe_tags t ON t.note_id = n.id ORDER BY n.id").map(row => ({ ...row })),
    [{ text: "改过", tag: "标签" }]);
  // A delete that cascades into the plugin's own child table runs the foreign key's sub-program: its steps are checked the same.
  await write(db, "DELETE FROM libprobe_notes WHERE text = ?", ["改过"]);
  assert.equal(count("libprobe_tags"), 0);
  // The JSON functions are the virtual tables a statement may read from: each reads only its argument.
  await write(db, "INSERT INTO libprobe_notes (project_id, text) SELECT ?, value FROM json_each(?)", [DEMO_PROJECT_ID, JSON.stringify(["甲", "乙"])]);
  assert.deepEqual(db.all("SELECT text FROM libprobe_notes WHERE text IN (SELECT value FROM json_each(?)) ORDER BY id", [JSON.stringify(["甲", "乙"])]).map(row => row.text), ["甲", "乙"]);
  assert.equal(db.all("SELECT key FROM json_tree(?)", ['{"a":[1]}']).length, 3);
});

test("PLIB-06 the project's root row may be read: by a foreign key inside a write, and by the plugin itself", async t => {
  const { mine, database, count } = await platform(t);
  const db = database(mine);
  await write(db, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "有根"]);
  await assert.rejects(write(db, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", ["no-such-project", "没根"]), /FOREIGN KEY/u,
    "the foreign key reads project_root inside the write");
  assert.equal(count("libprobe_notes"), 1);
  assert.deepEqual(db.all("SELECT project_id FROM project_root").map(row => row.project_id), [DEMO_PROJECT_ID]);
  assert.equal(db.get("SELECT n.text FROM libprobe_notes n JOIN project_root r ON r.project_id = n.project_id")!.text, "有根");
});

test("PLIB-06 a read method runs only SELECT or WITH", async t => {
  const { store, mine, database, count } = await platform(t);
  const db = database(mine);
  await write(db, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "留着"]);
  // SQLite applies a flag pragma and REINDEX while it prepares them, before any step: the keywords refuse them before anything
  // prepares them, `EXPLAIN` included.
  for (const sql of ["DELETE FROM libprobe_notes", "INSERT INTO libprobe_notes (project_id, text) VALUES ('x', 'y')", "PRAGMA table_info(libprobe_notes)",
    "PRAGMA foreign_keys = OFF", "REINDEX libprobe_notes", "ATTACH DATABASE ':memory:' AS spare", "BEGIN", "VACUUM", "/* SELECT */ PRAGMA foreign_keys = OFF"]) {
    assert.throws(() => db.get(sql), /读取仅接受 SELECT 或 WITH/u, sql);
    assert.throws(() => db.all(sql), /读取仅接受 SELECT 或 WITH/u, sql);
  }
  assert.equal(count("libprobe_notes"), 1);
  assert.deepEqual({ ...(store.db.prepare("PRAGMA foreign_keys").get() as object) }, { foreign_keys: 1 }, "the Host's connection keeps its foreign keys");
});

test("PLIB-06 a write runs only INSERT, UPDATE or DELETE", async t => {
  const { mine, database, store } = await platform(t);
  const db = database(mine);
  for (const sql of ["CREATE TABLE libprobe_more (a)", "DROP TABLE libprobe_tags", "ALTER TABLE libprobe_notes ADD COLUMN extra TEXT", "PRAGMA foreign_keys = OFF",
    "REINDEX libprobe_notes", "SELECT * FROM libprobe_notes", "ATTACH DATABASE ':memory:' AS spare", "SAVEPOINT inside", "COMMIT"]) {
    await assert.rejects(write(db, sql), /事务写入仅接受 INSERT、UPDATE 或 DELETE/u, sql);
    assert.equal(store.db.inTransaction, false, `${sql}: rolled back`);
  }
  assert.ok(store.db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'libprobe_tags'").get(), "nothing dropped");
  assert.deepEqual({ ...(store.db.prepare("PRAGMA foreign_keys").get() as object) }, { foreign_keys: 1 }, "the Host's connection keeps its foreign keys");
});

/** What the ledger records of the notes probe, for the check on its own. */
const notesRecord = (id: string, objects: readonly string[] = []): PluginProjectDatabaseRecord => ({ plugin_id: id, publisher_signature: "probe-libprobe",
  store_name: "libprobe", version: 1, objects: ["libprobe_notes", "libprobe_notes_text", "libprobe_tags", ...objects], created_at: new Date(0).toISOString() });

test("PLIB-06 a schema step or a pragma step is refused by the statement's own steps, behind the keywords", async t => {
  const { store, mine, database } = await platform(t);
  // The check on its own, with statements whose effect is in their steps (the keywords never let one through to it).
  const guard = pluginStatementGuard(store.db, notesRecord(mine.id));
  for (const sql of ["CREATE TABLE libprobe_more (a)", "CREATE INDEX libprobe_more_text ON libprobe_notes(text)", "DROP TABLE libprobe_tags",
    "DROP INDEX libprobe_notes_text", "ALTER TABLE libprobe_notes RENAME TO libprobe_renamed", "ALTER TABLE libprobe_notes ADD COLUMN extra TEXT",
    "PRAGMA journal_mode", "PRAGMA user_version = 9", "PRAGMA integrity_check", "VACUUM", "BEGIN", "SAVEPOINT inside"]) {
    assert.throws(() => guard(sql, [], "write"), REFUSED, sql);
    assert.throws(() => guard(sql, [], "read"), REFUSED, sql);
  }
  // Pragmas and other virtual tables written as table-valued functions pass the keywords and are refused for their cursor, under
  // any name: the JSON functions are told apart by the instance this connection has, not by what the statement calls them.
  const db = database(mine);
  for (const sql of ["SELECT * FROM pragma_table_info('libprobe_notes')", "SELECT * FROM pragma_table_info('libother_items') AS json_each",
    "SELECT name FROM pragma_database_list", "SELECT * FROM pragma_foreign_key_list('libprobe_notes')", "SELECT * FROM dbstat",
    "SELECT * FROM libprobe_notes WHERE text IN (SELECT name FROM pragma_table_list)"]) {
    assert.throws(() => db.all(sql), REFUSED, sql);
  }
  await assert.rejects(write(db, "INSERT INTO libprobe_notes (project_id, text) SELECT ?, name FROM pragma_table_list", [DEMO_PROJECT_ID]), REFUSED);
  assert.equal(store.db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'libprobe_tags'").get() !== undefined, true, "nothing dropped");
});

test("PLIB-06 another plugin's tables are neither read nor written", async t => {
  const { mine, other, database, count } = await platform(t);
  await write(database(other), "INSERT INTO libother_items (text) VALUES (?)", ["别人的"]);
  const db = database(mine);
  for (const sql of ["SELECT * FROM libother_items", "SELECT count(*) FROM libother_items", "WITH x AS (SELECT text FROM libother_items) SELECT * FROM x",
    "SELECT text FROM libprobe_notes WHERE text IN (SELECT text FROM libother_items)", "SELECT * FROM libprobe_notes JOIN libother_items"]) {
    assert.throws(() => db.all(sql), REFUSED, sql);
  }
  for (const sql of ["INSERT INTO libother_items (text) VALUES ('mine')", "UPDATE libother_items SET text = 'mine'", "DELETE FROM libother_items",
    "INSERT INTO libprobe_notes (project_id, text) SELECT ?, text FROM libother_items"]) {
    await assert.rejects(write(db, sql, sql.includes("?") ? [DEMO_PROJECT_ID] : []), REFUSED, sql);
  }
  assert.deepEqual(database(other).all("SELECT text FROM libother_items").map(row => row.text), ["别人的"]);
  assert.equal(count("libprobe_notes"), 0);
});

test("PLIB-06 the platform's tables are neither read nor written: not the project's root row, not the library's baseline", async t => {
  const { mine, database, count } = await platform(t);
  const db = database(mine), roots = count("project_root"), installs = count("plugin_runtime_installs");
  for (const sql of ["DELETE FROM project_root", "UPDATE project_root SET project_id = 'moved'", "INSERT INTO project_root (project_id) VALUES ('other')",
    "DELETE FROM plugin_runtime_installs", "UPDATE plugin_project_databases SET publisher_signature = 'forged'", "DELETE FROM feed_out_rules"]) {
    await assert.rejects(write(db, sql), REFUSED, sql);
  }
  for (const sql of ["SELECT * FROM plugin_runtime_installs", "SELECT * FROM plugin_project_databases", "SELECT * FROM sqlite_schema",
    "SELECT * FROM main.sqlite_master", "SELECT * FROM feed_out_rules"]) {
    assert.throws(() => db.all(sql), REFUSED, sql);
  }
  assert.equal(count("project_root"), roots);
  assert.equal(count("plugin_runtime_installs"), installs);
});

test("PLIB-06 only the library itself: not temp, not an attached database", async t => {
  const { mine, database } = await platform(t);
  const db = database(mine);
  for (const sql of ["SELECT * FROM temp.sqlite_schema", "SELECT * FROM sqlite_temp_master", "SELECT * FROM main.libprobe_notes JOIN temp.sqlite_schema"]) {
    assert.throws(() => db.all(sql), REFUSED, sql);
  }
  // `main.` is the library itself.
  assert.deepEqual(db.all("SELECT * FROM main.libprobe_notes"), []);
});

test("PLIB-06 a read method refuses a statement with a write step, and runs nothing of it", async t => {
  const { mine, database, count } = await platform(t);
  const db = database(mine);
  const sql = "WITH x AS (SELECT 1) INSERT INTO libprobe_notes (project_id, text) SELECT ?, 'through a read' FROM x RETURNING id";
  assert.throws(() => db.get(sql, [DEMO_PROJECT_ID]), REFUSED);
  assert.throws(() => db.all(sql, [DEMO_PROJECT_ID]), REFUSED);
  assert.throws(() => db.all("WITH x AS (SELECT 1) DELETE FROM libprobe_notes RETURNING id"), REFUSED);
  // The same statement through the transaction's read methods: still a read.
  await assert.rejects(db.transaction(async () => {}, tx => tx.get(sql, [DEMO_PROJECT_ID])), REFUSED);
  assert.equal(count("libprobe_notes"), 0);
});

test("PLIB-06 one statement at a time", async t => {
  const { mine, database, count } = await platform(t);
  const db = database(mine);
  assert.throws(() => db.all("SELECT 1; DELETE FROM libprobe_notes"), /more than one statement/u);
  await assert.rejects(write(db, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, 'a'); DELETE FROM libother_items", [DEMO_PROJECT_ID]), /more than one statement/u);
  assert.equal(count("libprobe_notes"), 0);
});

test("PLIB-06 a write body must finish in the same turn, and the transaction's handle is refused once the transaction is over", async t => {
  const { store, mine, database, count } = await platform(t);
  const db = database(mine);
  await assert.rejects(db.transaction(async () => {}, async tx => {
    tx.run("INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "异步"]);
    await Promise.resolve();
  }), /必须同步完成/u);
  assert.equal(count("libprobe_notes"), 0, "rolled back");
  assert.equal(store.db.inTransaction, false);
  let kept: Parameters<Parameters<PluginDatabase["transaction"]>[1]>[0] | undefined;
  await db.transaction(async () => {}, tx => { kept = tx; });
  assert.throws(() => kept!.run("INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "之后"]), { code: "actions.forbidden" });
  assert.throws(() => kept!.get("SELECT 1 FROM libprobe_notes"), { code: "actions.forbidden" });
  assert.equal(count("libprobe_notes"), 0);
});

test("PLIB-06 a stopped plugin's client is refused, the same after it starts again", async t => {
  const { running, mine, database, installId, count } = await platform(t);
  const old = database(mine);
  await running.runtime.stop(installId(mine));
  for (const phase of ["stopped", "restarted"] as const) {
    if (phase === "restarted") await running.runtime.start(installId(mine));
    // BL-411: outside every call the stopped activation's client is refused and does nothing: a read gives nothing, a write never settles.
    assert.equal(old.all("SELECT * FROM libprobe_notes"), undefined, phase);
    assert.equal(await within(write(old, "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, phase])), PENDING, phase);
  }
  assert.equal(count("libprobe_notes"), 0);
  await write(database(mine), "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "这一次的"]);
  assert.equal(count("libprobe_notes"), 1);
});

test("PLIB-06 the step list is read against one SQLite, the Host's", async t => {
  const { store } = await platform(t);
  assert.equal((store.db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v, PLUGIN_STATEMENT_SQLITE_VERSION,
    "a new SQLite under better-sqlite3 means reading the step list again (project-database-statements.ts), then this pin");
});

test("PLIB-06 the check reads the library's tables again once the schema changes: a root page the plugin's was can be someone else's after", async t => {
  const { store, mine } = await platform(t);
  const guard = pluginStatementGuard(store.db, notesRecord(mine.id, ["libprobe_later"]));
  const page = (name: string) => Number((store.db.prepare("SELECT rootpage FROM sqlite_schema WHERE name = ?").get(name) as { rootpage: number }).rootpage);
  store.db.exec("CREATE TABLE libprobe_later (text TEXT)");
  const before = page("libprobe_later");
  guard("SELECT * FROM libprobe_later", [], "read");
  // The Host drops it and makes a table of its own, which SQLite puts on the page just freed.
  store.db.exec("DROP TABLE libprobe_later; CREATE TABLE stand_in (text TEXT);");
  assert.equal(page("stand_in"), before, "the freed root page is reused");
  assert.throws(() => guard("SELECT * FROM stand_in", [], "read"), REFUSED);
  store.db.exec("CREATE TABLE libprobe_later (text TEXT)");
  assert.notEqual(page("libprobe_later"), before);
  guard("SELECT * FROM libprobe_later", [], "read");
});

test("PLIB-08 one SQLite library per file: reads go through a read-only connection of the Host's SQLite, writes through the Host's own connection", async t => {
  const { store, file, mine, database } = await platform(t);
  const library = openPluginProjectLibrary({ db: store.db, path: file }, mine.definition.manifest, () => {}, { install_id: "plib-08", installation_generation: "1" });
  try {
    assert.equal(library.reader.constructor, store.db.constructor, "the reader is the Host's SQLite library, not node:sqlite");
    assert.equal(library.reader instanceof DatabaseSync, false);
    assert.equal(Reflect.get(library.reader, "readonly"), true);
    assert.equal(Reflect.get(library.reader, "name"), file);
    assert.notEqual(library.reader, store.db);
  } finally { library.close(); }
  let inside: boolean | undefined;
  await database(mine).transaction(async () => {}, tx => {
    tx.run("INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", [DEMO_PROJECT_ID, "经宿主连接"]);
    inside = store.db.inTransaction;
  });
  assert.equal(inside, true, "the write ran in a transaction on the Host's own connection");
  assert.throws(() => openPluginProjectLibrary({ db: store.db, path: ":memory:" }, mine.definition.manifest, () => {}, { install_id: "plib-08", installation_generation: "1" }), /不是文件/u);
});

/** One operation of the sandboxed stand-in: it takes its call as JSON text and answers with what it got back, or the code it was refused with. */
const sandboxed = (id: string, kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract => ({ id, kind, effects, errors: [], input: { type: "string" },
  output: { type: "object", additionalProperties: false, properties: { value: { type: "string" }, refused: { type: "string" } }, required: [] },
  examples: [{ input: "[]", outputIncludes: {} }] });

test("PLIB-10 S-46 a sandboxed plugin reaches its own tables through the broker, under the same check as in the Host's process; a refused transaction writes none of its statements", { skip: process.platform !== "darwin", timeout: 30_000 }, async t => {
  const { file, mine, statements, count, installId } = await platform(t, true);
  assert.equal(mine.services().project_database, undefined, "a plugin the Host runs outside its own process gets no client that runs on the Host's thread");
  const bundlePath = join(dirname(file), "sandboxed.mjs");
  writeFileSync(bundlePath, `const attempt=async work=>{try{return {value:JSON.stringify(await work())}}catch(error){return {refused:String(error.code)}}};
    export const operations={
      write:(input,sdk)=>attempt(()=>sdk.projectDatabase.transaction(JSON.parse(input))),
      all:(input,sdk)=>attempt(()=>sdk.projectDatabase.all(...JSON.parse(input))),
      get:(input,sdk)=>attempt(()=>sdk.projectDatabase.get(...JSON.parse(input))),
      undeclared:(input,sdk)=>attempt(()=>sdk.projectDatabase.all('SELECT text FROM libprobe_notes')),
    };`);
  const contract: SandboxPluginContract = { version: 1, pluginId: mine.id, revision: "one", entities: [], pages: [], acceptance: [], operations: [
    sandboxed("write", "command", { projectDatabase: ["write"] }), sandboxed("all", "query", { projectDatabase: ["read"] }),
    sandboxed("get", "query", { projectDatabase: ["read"] }), sandboxed("undeclared", "query", {})] };
  const start = (grants: SandboxEffects) => createSandboxRunner({ bundlePath, contract, grants, services: { projectDatabase: sandboxDatabase(statements(mine)) },
    identity: { projectId: DEMO_PROJECT_ID, installationId: installId(mine), pluginId: mine.id, namespace: "installed" } });
  const runner = await start({ projectDatabase: ["read", "write"] }), readOnly = await start({ projectDatabase: ["read"] });
  const call = async (operation: string, input: unknown, on = runner) => await on.call(operation, JSON.stringify(input)) as { value?: string; refused?: string };
  const insert = (text: string) => ({ sql: "INSERT INTO libprobe_notes (project_id, text) VALUES (?, ?)", parameters: [DEMO_PROJECT_ID, text] });
  try {
    assert.deepEqual(await call("write", [insert("沙箱写的"), { sql: "UPDATE libprobe_notes SET text = text || ? WHERE text = ?", parameters: ["！", "沙箱写的"] }]),
      { value: JSON.stringify([{ changes: 1 }, { changes: 1 }]) });
    assert.deepEqual(await call("all", ["SELECT text FROM libprobe_notes ORDER BY id", []]), { value: JSON.stringify([{ text: "沙箱写的！" }]) });
    assert.deepEqual(await call("get", ["SELECT count(*) AS n FROM libprobe_notes WHERE project_id = ?", [DEMO_PROJECT_ID]]), { value: JSON.stringify({ n: 1 }) });
    // The Host's check, with its code: another plugin's table, the platform's, a pragma written as a table.
    for (const sql of ["SELECT * FROM libother_items", "SELECT * FROM plugin_project_databases", "SELECT name FROM pragma_table_list"]) {
      assert.deepEqual(await call("all", [sql, []]), { refused: REFUSED.code }, sql);
    }
    assert.deepEqual(await call("all", ["DELETE FROM libprobe_notes", []]), { refused: "sandbox.database_error" }, "a read is SELECT or WITH");
    // One statement refused, none written: the transaction is the Host's, and whole.
    for (const statements of [[insert("不该留下"), { sql: "DELETE FROM libother_items", parameters: [] }], [insert("不该留下"), { sql: "DROP TABLE libprobe_tags", parameters: [] }],
      [insert("不该留下"), insert(null as never)]]) {
      const refused = (await call("write", statements)).refused;
      assert.ok(refused === REFUSED.code || refused === "sandbox.database_error", `${JSON.stringify(statements)}: ${refused}`);
    }
    assert.equal(count("libprobe_notes"), 1, "nothing of a refused transaction stays");
    // What crosses is bounded before the Host sees it.
    for (const [operation, input] of [["all", ["SELECT ?", [true]]], ["all", ["SELECT ?", [{ text: "x" }]]], ["all", ["SELECT 1\u0000", []]], ["all", ["SELECT 1", "x"]],
      ["write", []], ["write", Array.from({ length: 65 }, () => insert("太多"))], ["write", [{ sql: 1 }]]] as const) {
      assert.deepEqual(await call(operation, input), { refused: "sandbox.invalid_request" }, JSON.stringify(input));
    }
    assert.deepEqual(await call("get", ["SELECT zeroblob(4) AS b", []]), { refused: "sandbox.database_error" }, "a BLOB does not cross the channel");
    // Declared and approved, both.
    assert.deepEqual(await call("undeclared", []), { refused: "sandbox.not_authorized" });
    assert.deepEqual(await call("write", [insert("没批准写")], readOnly), { refused: "sandbox.not_authorized" });
    assert.throws(() => assertContract({ ...contract, operations: [sandboxed("write", "query", { projectDatabase: ["write"] })] }), { code: "sandbox.invalid_contract" },
      "a query cannot declare a write");
    assert.equal(count("libprobe_notes"), 1);
    assert.equal(count("libother_items"), 0);
  } finally { await runner.stop(); await readOnly.stop(); }
});
