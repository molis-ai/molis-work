import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { Worker } from "node:worker_threads";
import { DEMO_PROJECT_ID, LocalProjectDatabase, PLATFORM_PLUGIN_REGISTRATIONS, createPluginPlatform, homeStores, projectDeletedHooksFor, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createFormPlugin } from "@molis-ai/molis-work-plugin-form";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginManifest, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { describeSqliteSchema, homeSqlitePath, homeStoreRegistry, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-024 (specs/repository-anti-corruption/slices/w5-02-registry.md §2): a library in the Home declares which of its rows belong to a
// project (`databases.home.project_rows`), and the platform deletes them with the project, on its own connection to that library,
// running none of the plugin's code.

const catalog: PluginRegistration[] = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[];
const DECLARING = ["dataset", "form", "lingguang", "pages", "ppt", "todo", "workflows"];

function withHome(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "project-rows-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "home");
}

/**
 * One row in every table of the library for each project, every value marked with its project: ids are `<table>-<project>`, the
 * project's own columns and the columns a child hangs on its parent by (declared, or a foreign key) point at that project's rows.
 */
function seed(home: string, library: HomePluginDatabaseDeclaration, projects: readonly string[]): void {
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    const shape = describeSqliteSchema(db).tables, rows = library.project_rows!.tables;
    const links = new Map(rows.flatMap(row => "parent" in row ? [[`${row.table}.${row.column}`, row.parent] as const] : []));
    const direct = new Set(rows.flatMap(row => "parent" in row ? [] : [`${row.table}.${row.column}`]));
    const tables = Object.keys(shape).sort((a, b) => Number(shape[a]!.foreign_keys.length > 0 || rows.some(row => row.table === a && "parent" in row))
      - Number(shape[b]!.foreign_keys.length > 0 || rows.some(row => row.table === b && "parent" in row)));
    for (const project of projects) for (const table of tables) {
      const columns = shape[table]!.columns, keys = shape[table]!.foreign_keys;
      const value = (column: (typeof columns)[number]) => {
        const parent = links.get(`${table}.${column.name}`) ?? keys.find(key => key.from === column.name)?.table;
        if (parent) return `${parent}-${project}`;
        if (direct.has(`${table}.${column.name}`) || column.name === "project_id") return project;
        if (column.pk && column.type === "TEXT") return `${table}-${project}`;
        if (column.pk) return null;
        return /INT|REAL|NUM/u.test(column.type) ? 1 : project;
      };
      db.prepare(`INSERT INTO "${table}" (${columns.map(column => `"${column.name}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
        .run(...columns.map(value));
    }
  } finally { db.close(); }
}

/** How many rows of each table still carry each project's mark in any column. */
function marks(home: string, store: string, projects: readonly string[]): Record<string, Record<string, number>> {
  const db = new DatabaseSync(homeSqlitePath(home, store), { readOnly: true });
  try {
    const shape = describeSqliteSchema(db).tables;
    return Object.fromEntries(Object.entries(shape).map(([table, { columns }]) => [table, Object.fromEntries(projects.map(project => [project,
      (db.prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${columns.map(column => `"${column.name}" = ? OR "${column.name}" LIKE ?`).join(" OR ")}`)
        .get(...columns.flatMap(() => [project, `%-${project}`])) as { n: number }).n])),
    ]));
  } finally { db.close(); }
}

test("RAC-560 deleting a project deletes every row of it in the seven declaring libraries and leaves another project's rows whole", async t => {
  const home = withHome(t);
  const declaring = catalog.filter(entry => entry.manifest.databases?.home?.project_rows);
  assert.deepEqual(declaring.map(entry => entry.project_plugin_id).sort(), DECLARING);
  for (const entry of declaring) {
    const library = entry.manifest.databases!.home!;
    seed(home, library, ["pa", "pb"]);
    const before = marks(home, library.store_name, ["pa", "pb"]);
    for (const [table, counts] of Object.entries(before)) assert.ok(counts.pa! > 0 && counts.pb! > 0, `${entry.project_plugin_id}: ${table} seeded for both`);
    assert.equal(await projectDeletedHooksFor(home).clear(entry.project_plugin_id, "pa"), true);
    const after = marks(home, library.store_name, ["pa", "pb"]);
    for (const [table, counts] of Object.entries(after)) {
      assert.equal(counts.pa, 0, `${entry.project_plugin_id}: ${table} keeps nothing of the deleted project`);
      assert.equal(counts.pb, before[table]!.pb, `${entry.project_plugin_id}: ${table} keeps the other project's rows`);
    }
    assert.equal(await projectDeletedHooksFor(home).clear(entry.project_plugin_id, "pa"), true, "running it again finds nothing");
  }
});

const PERMISSIONS = [
  { permission: "storage:private", required: true, reason: "插件把数据存进 Home 里自己的库" },
  { permission: "rowsprobe:read", required: true, reason: "读自己的库" },
  { permission: "rowsprobe:write", required: true, reason: "写自己的库" },
] as const;
const ROWS: PluginProjectRowsDeclaration = { label: "探针的记录", tables: [{ table: "notes", column: "item_id", parent: "items" }, { table: "items", column: "project_id" }] };
const LIBRARY: HomePluginDatabaseDeclaration = { store_name: "rows-probe", version: 1, read_permission: "rowsprobe:read", write_permission: "rowsprobe:write",
  schema: "CREATE TABLE items (id TEXT PRIMARY KEY, project_id TEXT NOT NULL); CREATE TABLE notes (id TEXT PRIMARY KEY, item_id TEXT NOT NULL);", project_rows: ROWS };

function manifest(library: unknown = LIBRARY, id = "io.molis.work.example.rowsprobe"): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Rows probe", kind: "app",
    publisher: { publisher_id: "example", signature: "publisher-one" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [...PERMISSIONS], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    databases: { home: library as HomePluginDatabaseDeclaration } };
}

test("RAC-561 the SDK refuses project_rows that name what is not this library's own, or hang a child wrongly", () => {
  const refused = (rows: unknown, pattern: RegExp, extra: Partial<HomePluginDatabaseDeclaration> = {}) =>
    assert.throws(() => parsePluginManifest(manifest({ ...LIBRARY, ...extra, project_rows: rows })), pattern, JSON.stringify(rows));
  parsePluginManifest(manifest());
  refused({ ...ROWS, tables: [] }, /tables 至少要写一张表/u);
  refused({ ...ROWS, tables: [{ table: "main.items", column: "project_id" }] }, /不带库名/u);
  refused({ ...ROWS, tables: [{ table: "Items; DROP TABLE items", column: "project_id" }] }, /不带库名/u);
  refused({ ...ROWS, tables: [{ table: "pages", column: "project_id" }] }, /不是这个库的 schema 建的表/u);
  refused({ ...ROWS, tables: [{ table: "items", column: "project_id" }, { table: "notes", column: "item_id", parent: "items" }] }, /写在它后面/u);
  refused({ ...ROWS, tables: [{ table: "notes", column: "item_id", parent: "ghosts" }, { table: "items", column: "project_id" }] }, /写在它后面/u);
  refused({ ...ROWS, label: "" }, /label/u);
  refused(ROWS, /不能和 partition/u, { partition: "project" });
});

test("RAC-561 the platform deletes only from the declaring plugin's own library, and refuses a column its schema does not make", async t => {
  const home = withHome(t);
  const pages = catalog.find(entry => entry.project_plugin_id === "pages")!, dataset = catalog.find(entry => entry.project_plugin_id === "dataset")!;
  const datasetLibrary = dataset.manifest.databases!.home!;
  seed(home, datasetLibrary, ["pa"]);
  const borrowing = (rows: PluginProjectRowsDeclaration): PluginRegistration => ({ ...pages, project_plugin_id: "borrowing",
    manifest: { ...pages.manifest, databases: { home: { ...pages.manifest.databases!.home!, project_rows: rows } } } });
  for (const rows of [{ label: "借别家的表", tables: [{ table: "datasets", column: "project_id" }] }, { label: "没有的列", tables: [{ table: "pages", column: "nowhere" }] }]) {
    catalog.push(borrowing(rows));
    try { await assert.rejects(projectDeletedHooksFor(home).clear("borrowing", "pa"), { code: "plugin.declaration_invalid" }); }
    finally { catalog.pop(); }
  }
  assert.ok(marks(home, datasetLibrary.store_name, ["pa"]).datasets!.pa! > 0, "the other plugin's library is untouched");
});

function rowsProbe(label = ROWS.label, id = "io.molis.work.example.rowsprobe") {
  const calls: string[] = [];
  const definition: PluginDefinition = { manifest: manifest({ ...LIBRARY, project_rows: { ...ROWS, label } }, id),
    async start() { calls.push("start"); return { kind: "app", views: [], actions: [] }; },
    async stop() { calls.push("stop"); } };
  return { definition, calls, id: definition.manifest.plugin_id };
}

/** A Host behind the desktop HTTP composition, given the probe as a Home plugin it did not ship, granted and running. */
async function runningProbe(t: TestContext, probe: ReturnType<typeof rowsProbe>) {
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const platform = await f.host.homePlugins!.ready(), install = f.host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, PERMISSIONS.map(item => item.permission));
  await platform.supervisor.restart(probe.id);
  assert.equal(f.host.homePlugins!.installation(probe.id)!.state, "running");
  return f;
}

test("RAC-562 S-暂A a plugin the Host did not ship has its declared rows go with the project, and deleting them runs none of its code", async t => {
  const probe = rowsProbe(), f = await runningProbe(t, probe);
  seed(f.home, LIBRARY, ["pa", "pb"]);
  const calls = [...probe.calls];
  assert.equal(await projectDeletedHooksFor(f.home).clear(probe.id, "pa"), true);
  assert.deepEqual(probe.calls, calls, "no start, stop or handler of the plugin ran for the deletion");
  assert.deepEqual(marks(f.home, LIBRARY.store_name, ["pa", "pb"]), { items: { pa: 0, pb: 1 }, notes: { pa: 0, pb: 1 } });
});

function projectPlatform(t: TestContext, home: string, stores = homeStores()) {
  const directory = mkdtempSync(join(tmpdir(), "project-rows-board-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => undefined, stores } });
  t.after(async () => {
    try {
      for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
      await platform.closeCoordination();
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  return platform;
}

test("RAC-562 an existing catalog project plugin with a declared deletion owner still starts through the real platform", async t => {
  const home = withHome(t), platform = projectPlatform(t, home), definition = createFormPlugin();
  const schema = t.mock.method(DatabaseSync.prototype, "exec"), library = definition.manifest.databases!.home!;
  assert.ok(catalog.some(entry => entry.manifest === definition.manifest), "the deletion owner reads this same Manifest object");
  assert.deepEqual((await platform.start([{ definition, trust: { level: "host" } }])).running, [definition.manifest.plugin_id]);
  assert.ok(schema.mock.calls.some(call => call.arguments[0] === library.schema), "a supported real startup exercises the observed schema exec");
  assert.ok(existsSync(homeSqlitePath(home, library.store_name)));
  await platform.runtime.stop(platform.runtime.list()[0]!.install_id);
});

test("RAC-562 the project platform refuses a copied catalog Manifest even with the same plugin id and Host trust", async t => {
  const home = withHome(t), platform = projectPlatform(t, home), original = createFormPlugin(), calls: string[] = [];
  const definition: PluginDefinition = { ...original, manifest: { ...original.manifest }, async start(context) { calls.push("start"); return original.start(context); } };
  const schema = t.mock.method(DatabaseSync.prototype, "exec"), library = definition.manifest.databases!.home!;
  await assert.rejects(platform.start([{ definition, trust: { level: "host" } }]), { code: "plugin.declaration_invalid" });
  assert.deepEqual(calls, []);
  assert.deepEqual(platform.runtime.list(), []);
  assert.equal(schema.mock.calls.filter(call => call.arguments[0] === library.schema).length, 0);
  assert.equal(existsSync(join(home, library.store_name)), false);
});

test("RAC-562 BL-620 the project platform refuses project_rows without a catalog deletion owner before schema, installs or plugin effects", async t => {
  const home = withHome(t), probe = rowsProbe(), other = rowsProbe(ROWS.label, "io.molis.work.example.otherrows");
  const stores = homeStoreRegistry([...homeStores().stores, { path: LIBRARY.store_name, owner: probe.id, library: { baseline: LIBRARY } }]);
  const platform = projectPlatform(t, home, stores), schema = t.mock.method(DatabaseSync.prototype, "exec");
  const withoutLibrary: PluginDefinition = { ...other.definition, manifest: { ...other.definition.manifest, databases: undefined } };
  await assert.rejects(platform.start([{ definition: withoutLibrary }, { definition: probe.definition }]), { code: "plugin.declaration_invalid" });
  assert.deepEqual(platform.runtime.list(), [], "the whole start list is refused before installing any entry");
  assert.deepEqual([...probe.calls, ...other.calls], [], "no plugin started or performed business effects");
  assert.equal(schema.mock.calls.filter(call => call.arguments[0] === LIBRARY.schema).length, 0, "not even the scratch SQLite executes the schema");
  assert.equal(existsSync(join(home, LIBRARY.store_name)), false, "no plugin library was made");
  assert.equal(existsSync(join(home, "plugin-libraries")), false, "no library ledger was made");
});

test("RAC-562 BL-620 an installed Home plugin outside the start list is refused before schema, library ledger or plugin effects", async t => {
  const f = await serveHomeRuntime(t), platform = await f.host.homePlugins!.ready(), probe = rowsProbe();
  assert.equal(f.host.homePlugins!.installation(probe.id), null, "this definition is absent from the Home start list");
  assert.equal(existsSync(join(f.home, "plugin-libraries")), false);
  const schema = t.mock.method(DatabaseSync.prototype, "exec");
  const installId = platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }).install.install_id;
  await assert.rejects(platform.runtime.start(installId), /启动失败/u);
  assert.equal(platform.runtime.get(installId).last_error_code, "plugin.declaration_invalid");
  assert.notEqual(platform.runtime.get(installId).state, "running");
  assert.deepEqual(probe.calls, [], "the installed plugin's start and business effects never ran");
  assert.equal(schema.mock.calls.filter(call => call.arguments[0] === LIBRARY.schema).length, 0, "the installed declaration never reaches schema exec");
  assert.equal(existsSync(join(f.home, LIBRARY.store_name)), false);
  assert.equal(existsSync(join(f.home, "plugin-libraries")), false);
});

test("RAC-562 BL-619 a sandboxed plugin that declares project_rows is refused when it starts, not skipped", async t => {
  const home = withHome(t), sandboxed: PluginDefinition = { ...rowsProbe().definition, execution: "sandbox" };
  const platform = projectPlatform(t, home), schema = t.mock.method(DatabaseSync.prototype, "exec");
  const installId = platform.runtime.install({ trust: { level: "unsigned" }, definition: sandboxed, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }).install.install_id;
  // #1255 alone does not lift this refusal. BL-619 must reuse its PLIB-03 preflight before even a scratch SQLite executes the schema.
  await assert.rejects(platform.runtime.start(installId));
  assert.equal(platform.runtime.get(installId).last_error_code, "plugin.declaration_invalid");
  assert.notEqual(platform.runtime.get(installId).state, "running");
  assert.equal(schema.mock.calls.filter(call => call.arguments[0] === LIBRARY.schema).length, 0);
});

test("RAC-563 external Runtime installation refuses project_rows labels with whitespace, controls or Unicode line breaks", async t => {
  const f = await serveHomeRuntime(t), platform = await f.host.homePlugins!.ready();
  const before = platform.runtime.list();
  const labels = ["", " \u3000 ", "first\nsecond", "first\rsecond", "tab\tlabel", "nul\u0000label", "escape\u001blabel", "del\u007flabel",
    "next\u0085line", "control\u009flabel", "line\u2028break", "paragraph\u2029break", "中".repeat(201)];
  for (const label of labels) {
    const probe = rowsProbe(label);
    assert.throws(() => platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }),
      { code: "plugin.manifest_invalid", message: /project_rows.label/u }, JSON.stringify(label));
    assert.deepEqual(probe.calls, []);
  }
  assert.deepEqual(platform.runtime.list(), before, "refused declarations create no installation record");
  assert.equal(existsSync(join(f.home, LIBRARY.store_name)), false);
  assert.equal(existsSync(join(f.home, "plugin-libraries")), false);
});

test("RAC-563 external Runtime installation keeps legal Unicode labels and the existing 200-character boundary", async t => {
  const f = await serveHomeRuntime(t), platform = await f.host.homePlugins!.ready();
  for (const [index, label] of ["清单 café e\u0301 👨‍👩‍👧‍👦 العربية", "中".repeat(200)].entries()) {
    const probe = rowsProbe(label, `io.molis.work.example.rowslabel${index}`);
    assert.equal(parsePluginManifest(probe.definition.manifest).databases!.home!.project_rows!.label, label);
    assert.equal(platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }).install.state, "installed");
  }
});

test("RAC-563 the label of a plugin the Host did not ship is shown as written beside its name, in either language, never translated", async t => {
  const label = "<b>Pages 文稿与文件夹</b>", probe = rowsProbe(label), f = await runningProbe(t, probe);
  for (const [language, expected] of [["zh", `Rows probe 的项目数据：${label}`], ["en", `Project data of Rows probe: ${label}`]] as const) {
    const response = await f.request("/api/settings/projects/any/delete-scope", { headers: { "accept-language": language } });
    assert.equal(response.status, 200);
    const body = await response.json() as { owners: Array<{ owner_id: string; label: string }> };
    assert.equal(body.owners.find(owner => owner.owner_id === probe.id)?.label, expected, language);
  }
});

test("RAC-563 a deletion waits for a write another connection holds on the library, then completes", async t => {
  const home = withHome(t), pages = catalog.find(entry => entry.project_plugin_id === "pages")!, library = pages.manifest.databases!.home!;
  seed(home, library, ["pa"]);
  const worker = new Worker(`
    const { DatabaseSync } = require("node:sqlite"); const { parentPort, workerData } = require("node:worker_threads");
    const db = new DatabaseSync(workerData.file); db.exec("BEGIN IMMEDIATE"); parentPort.postMessage("locked");
    setTimeout(() => { db.exec("COMMIT"); db.close(); parentPort.postMessage("released"); }, 400);
  `, { eval: true, workerData: { file: homeSqlitePath(home, library.store_name) } });
  const events: string[] = [];
  const locked = new Promise<void>(resolve => worker.on("message", message => { events.push(String(message)); if (message === "locked") resolve(); }));
  const exited = new Promise(resolve => worker.on("exit", resolve));
  await locked;
  assert.equal(await projectDeletedHooksFor(home).clear("pages", "pa"), true);
  await exited;
  assert.ok(events.includes("released"), "the deletion ran only once the write was let go");
  assert.equal(marks(home, library.store_name, ["pa"]).pages!.pa, 0);
});
