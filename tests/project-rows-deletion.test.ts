import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { Worker } from "node:worker_threads";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, homeStores, projectDeletedHooksFor, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginManifest, PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { describeSqliteSchema, homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-024 (specs/repository-anti-corruption/slices/w5-02-registry.md §2): a library in the Home declares which of its rows belong to a
// project (`databases.home.project_rows`), and the platform deletes them with the project, on its own connection to that library,
// running none of the plugin's code.

const catalog: PluginRegistration[] = BUILTIN_PLUGIN_CATALOG as PluginRegistration[];
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

function rowsProbe(label = ROWS.label) {
  const calls: string[] = [];
  const definition: PluginDefinition = { manifest: manifest({ ...LIBRARY, project_rows: { ...ROWS, label } }),
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

test("RAC-562 BL-619 a sandboxed plugin that declares project_rows is refused when it starts, not skipped", async t => {
  const home = withHome(t), sandboxed: PluginDefinition = { ...rowsProbe().definition, execution: "sandbox" };
  const file = join(mkdtempSync(join(tmpdir(), "project-rows-board-")), "board.db");
  t.after(() => rmSync(join(file, ".."), { recursive: true, force: true }));
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  t.after(() => store.close());
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => undefined, stores: homeStores() } });
  const installId = platform.runtime.install({ definition: sandboxed, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }).install.install_id;
  // Until #1255 a sandboxed plugin is given no library of the Home at all, so this pins only that declaring project_rows never lets it
  // start; when sandboxed libraries land, BL-619 turns the refusal into a deletion and this test into one that deletes.
  await assert.rejects(platform.runtime.start(installId));
  assert.equal(platform.runtime.get(installId).last_error_code, "plugin.declaration_invalid");
  assert.notEqual(platform.runtime.get(installId).state, "running");
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
