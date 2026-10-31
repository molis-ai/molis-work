import assert from "node:assert/strict";
import fs, { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
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
const DECLARING = ["dataset", "form", "images", "lingguang", "pages", "ppt", "todo", "workflows"];
/** The libraries all of whose tables are a project's. Images also keeps the person's connections, which belong to no project; RAC-577 is its. */
const WHOLLY_PROJECT = DECLARING.filter(id => id !== "images");

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
  for (const entry of declaring.filter(item => WHOLLY_PROJECT.includes(item.project_plugin_id))) {
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
  const installed = new Set<PluginDefinition>(), f = await serveHomeRuntime(t, { pluginFixtures: { installed } }), platform = await f.host.homePlugins!.ready(), probe = rowsProbe();
  installed.add(probe.definition); // the test acts as the Host's code: this one object may be installed in the process (S-75 ⑥), but it is not on the start list
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
  const installed = new Set<PluginDefinition>(), f = await serveHomeRuntime(t, { pluginFixtures: { installed } }), platform = await f.host.homePlugins!.ready();
  const before = platform.runtime.list();
  const labels = ["", " \u3000 ", "first\nsecond", "first\rsecond", "tab\tlabel", "nul\u0000label", "escape\u001blabel", "del\u007flabel",
    "next\u0085line", "control\u009flabel", "line\u2028break", "paragraph\u2029break", "中".repeat(201)];
  for (const label of labels) {
    const probe = rowsProbe(label);
    installed.add(probe.definition);
    assert.throws(() => platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: PERMISSIONS.map(item => item.permission) }),
      { code: "plugin.manifest_invalid", message: /project_rows.label/u }, JSON.stringify(label));
    assert.deepEqual(probe.calls, []);
  }
  assert.deepEqual(platform.runtime.list(), before, "refused declarations create no installation record");
  assert.equal(existsSync(join(f.home, LIBRARY.store_name)), false);
  assert.equal(existsSync(join(f.home, "plugin-libraries")), false);
});

test("RAC-563 external Runtime installation keeps legal Unicode labels and the existing 200-character boundary", async t => {
  const installed = new Set<PluginDefinition>(), f = await serveHomeRuntime(t, { pluginFixtures: { installed } }), platform = await f.host.homePlugins!.ready();
  for (const [index, label] of ["清单 café e\u0301 👨‍👩‍👧‍👦 العربية", "中".repeat(200)].entries()) {
    const probe = rowsProbe(label, `io.molis.work.example.rowslabel${index}`);
    installed.add(probe.definition);
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

test("RAC-577 S-86 the files a project's rows name go with them, and only plain files in the declared directory of the plugin's own", async t => {
  const home = withHome(t);
  const images = catalog.find(entry => entry.project_plugin_id === "images")!, library = images.manifest.databases!.home!;
  assert.deepEqual(library.project_rows?.files, [{ table: "jobs", column: "images_json", key: "filename", directory: "assets" }], "Images declares its pictures");
  const root = join(home, "images"), assets = join(root, "assets"), outside = join(home, "outside.png");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    const job = (project: string, names: readonly string[]) => db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name,
      api_format, model, prompt, size, aspect_ratio, status, images_json, error, created_at) VALUES (?, ?, ?, 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
      .run(`job-${project}`, project, `request-${project}`, JSON.stringify(names.map(filename => ({ filename, mime_type: "image/png" }))));
    job("pa", ["a.png", "../outside.png", "/etc/hosts", "sub/b.png", "linked.png", "hard.png", "folder.png", ".", "kept.png", "missing.png"]);
    job("pb", ["kept.png"]);
  } finally { db.close(); }
  mkdirSync(join(assets, "sub"), { recursive: true }); mkdirSync(join(assets, "folder.png"));
  for (const file of [join(assets, "a.png"), join(assets, "sub", "b.png"), join(assets, "kept.png"), outside, join(root, "outside.png")]) writeFileSync(file, "png");
  symlinkSync(outside, join(assets, "linked.png"));
  writeFileSync(join(home, "hard-source.png"), "png"); linkSync(join(home, "hard-source.png"), join(assets, "hard.png"));

  assert.equal(await projectDeletedHooksFor(home).clear("images", "pa"), true);
  assert.equal(existsSync(join(assets, "a.png")), false, "the project's own picture is removed");
  assert.ok(existsSync(join(assets, "kept.png")), "a name another project's row still gives is that project's, and stays");
  for (const kept of [outside, join(root, "outside.png"), join(assets, "sub", "b.png"), join(assets, "folder.png"), join(home, "hard-source.png"), join(assets, "hard.png")]) {
    assert.ok(existsSync(kept), `${kept} is not one plain file of the declared directory, and stays`);
  }
  assert.ok(lstatSync(join(assets, "linked.png")).isSymbolicLink(), "a link is left, and what it points at with it");
  const left = new DatabaseSync(homeSqlitePath(home, "images"), { readOnly: true });
  try { assert.deepEqual(left.prepare("SELECT project_id FROM jobs ORDER BY project_id").all().map(row => row.project_id), ["pb"]); } finally { left.close(); }
});

test("RAC-577 S-86 a file two projects' rows name stays until the last of them goes, and a removal that fails keeps the rows", async t => {
  const home = withHome(t);
  const images = catalog.find(entry => entry.project_plugin_id === "images")!, library = images.manifest.databases!.home!;
  const assets = join(home, "images", "assets");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    for (const [project, names] of [["pa", ["shared.png"]], ["pb", ["shared.png"]], ["pc", ["own.png"]]] as const) {
      db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name, api_format, model, prompt, size,
        aspect_ratio, status, images_json, error, created_at) VALUES (?, ?, ?, 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
        .run(`job-${project}`, project, `request-${project}`, JSON.stringify(names.map(filename => ({ filename, mime_type: "image/png" }))));
    }
  } finally { db.close(); }
  mkdirSync(assets, { recursive: true });
  for (const name of ["shared.png", "own.png"]) writeFileSync(join(assets, name), "png");
  const projects = () => {
    const left = new DatabaseSync(homeSqlitePath(home, "images"), { readOnly: true });
    try { return left.prepare("SELECT project_id FROM jobs ORDER BY project_id").all().map(row => row.project_id); } finally { left.close(); }
  };

  assert.equal(await projectDeletedHooksFor(home).clear("images", "pa"), true);
  assert.ok(existsSync(join(assets, "shared.png")), "pb still names it");
  assert.equal(await projectDeletedHooksFor(home).clear("images", "pb"), true);
  assert.equal(existsSync(join(assets, "shared.png")), false, "the last project that named it is gone");

  chmodSync(assets, 0o555);
  try {
    await assert.rejects(() => projectDeletedHooksFor(home).clear("images", "pc"), { code: "EACCES" });
    assert.ok(existsSync(join(assets, "own.png")));
    assert.deepEqual(projects(), ["pc"], "the rows stay with the file they name, so the next attempt finds it again");
  } finally { chmodSync(assets, 0o755); }
  assert.equal(await projectDeletedHooksFor(home).clear("images", "pc"), true);
  assert.deepEqual([existsSync(join(assets, "own.png")), projects()], [false, []]);
});

test("RAC-577 S-86 a named file the deletion cannot look at fails the step, and the rows stay for the next attempt", async t => {
  const home = withHome(t);
  const images = catalog.find(entry => entry.project_plugin_id === "images")!, library = images.manifest.databases!.home!;
  const assets = join(home, "images", "assets");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name, api_format, model, prompt, size,
      aspect_ratio, status, images_json, error, created_at) VALUES ('job-pa', 'pa', 'request-pa', 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
      .run(JSON.stringify([{ filename: "unseen.png", mime_type: "image/png" }]));
  } finally { db.close(); }
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "unseen.png"), "png");
  const projects = () => {
    const left = new DatabaseSync(homeSqlitePath(home, "images"), { readOnly: true });
    try { return left.prepare("SELECT project_id FROM jobs").all().map(row => row.project_id); } finally { left.close(); }
  };

  chmodSync(assets, 0o000);
  try {
    await assert.rejects(() => projectDeletedHooksFor(home).clear("images", "pa"), { code: "EACCES" }, "a file it cannot look at is not taken for one that is gone");
    assert.deepEqual(projects(), ["pa"], "the rows stay, naming the file");
  } finally { chmodSync(assets, 0o755); }
  assert.ok(existsSync(join(assets, "unseen.png")));
  assert.equal(await projectDeletedHooksFor(home).clear("images", "pa"), true);
  assert.deepEqual([existsSync(join(assets, "unseen.png")), projects()], [false, []], "the next attempt removes both");
});

// PG024-RETRY-02: SQLite restores rows only; files already removed remain missing for the retry.
test("RAC-577 S-86 PG024-RETRY-01 a partial file deletion rolls back rows and retry skips deleted files", async t => {
  const directory = withHome(t);
  mkdirSync(directory, { recursive: true });
  const home = realpathSync(directory), images = catalog.find(entry => entry.project_plugin_id === "images")!;
  const library = images.manifest.databases!.home!, assets = join(home, "images", "assets");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    for (const [project, names] of [["pc", ["first.png", "shared.png", "second.png"]], ["pb", ["shared.png"]]] as const) {
      db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name, api_format, model, prompt, size,
        aspect_ratio, status, images_json, error, created_at) VALUES (?, ?, ?, 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
        .run(`job-${project}`, project, `request-${project}`, JSON.stringify(names.map(filename => ({ filename, mime_type: "image/png" }))));
    }
  } finally { db.close(); }
  mkdirSync(assets, { recursive: true });
  const first = join(assets, "first.png"), second = join(assets, "second.png"), shared = join(assets, "shared.png");
  for (const file of [first, second, shared]) writeFileSync(file, "png");
  const rows = () => {
    const current = new DatabaseSync(homeSqlitePath(home, "images"), { readOnly: true });
    try { return current.prepare("SELECT * FROM jobs ORDER BY project_id").all(); } finally { current.close(); }
  };
  const before = rows(), removed: string[] = [], remove = fs.rmSync;
  let denyNextRemoval = true;
  // Both removals use the real filesystem. Revoke directory write access only after the first unlink actually succeeds.
  const observer = t.mock.method(fs, "rmSync", (...args: Parameters<typeof fs.rmSync>) => {
    const file = String(args[0]);
    if ([first, second, shared].includes(file)) removed.push(file);
    remove(...args);
    if (file === first && denyNextRemoval) chmodSync(assets, 0o555);
  });
  try {
    syncBuiltinESMExports();
    await assert.rejects(() => projectDeletedHooksFor(home).clear("images", "pc"), { code: "EACCES", path: second });
    assert.deepEqual(removed, [first, second], "the JSON order reaches the second removal only after the first succeeds; shared is never removed");
    assert.deepEqual(rows(), before, "the failed deletion rolls back every row");
    assert.deepEqual([existsSync(first), existsSync(second), existsSync(shared)], [false, true, true], "row rollback does not restore the first file");
    t.diagnostic("PG024-RETRY-01: real second unlink EACCES; rows restored; first missing, second and shared present");

    chmodSync(assets, 0o755);
    denyNextRemoval = false;
    const retryAt = removed.length;
    assert.equal(await projectDeletedHooksFor(home).clear("images", "pc"), true);
    assert.deepEqual(removed.slice(retryAt), [second], "the missing first file is skipped on retry, and the other project's shared file stays");
    assert.deepEqual(rows(), before.filter(row => row.project_id === "pb"), "only the other project's unchanged row remains");
    assert.deepEqual([existsSync(first), existsSync(second), existsSync(shared)], [false, false, true]);
    t.diagnostic("PG024-RETRY-01: retry removed only second; target row gone; other project's row and shared file unchanged");
  } finally {
    chmodSync(assets, 0o755);
    observer.mock.restore();
    syncBuiltinESMExports();
  }
});

test("RAC-577 S-86 the SDK refuses files that do not hang on a project's own table or name a directory the Manifest does not declare", () => {
  const files = (entries: unknown, ownerFiles: unknown = { store_name: "rows-probe", entries: [{ name: "assets", kind: "directory" }, { name: "index.json", kind: "file" }], read_permission: "rowsprobe:read", write_permission: "rowsprobe:write" }) =>
    () => parsePluginManifest({ ...manifest({ ...LIBRARY, project_rows: { ...ROWS, files: entries } }), owner_files: ownerFiles });
  files([{ table: "items", column: "id", directory: "assets" }])();
  assert.throws(files([{ table: "notes", column: "id", directory: "assets" }]), { code: "plugin.manifest_invalid", message: /不带 parent 的表/u }, "a child table's names would outlive their parent's check");
  assert.throws(files([{ table: "items", column: "id", directory: "index.json" }]), /owner_files 里声明的目录/u);
  assert.throws(files([{ table: "items", column: "id", directory: "../elsewhere" }]), /owner_files 里声明的目录/u);
  assert.throws(() => parsePluginManifest(manifest({ ...LIBRARY, project_rows: { ...ROWS, files: [{ table: "items", column: "id", directory: "assets" }] } })),
    /owner_files 里声明的目录/u, "a Manifest with no owner_files has no directory to name");
  assert.throws(files([{ table: "items", column: "id; DROP TABLE items", directory: "assets" }]), /小写标识符/u);
  assert.throws(files([]), /至少要有一项/u);
});

test("RAC-2435 S-86 a declared file is not removed through its directory swapped for a link after the check", async t => {
  const home = withHome(t);
  const images = catalog.find(entry => entry.project_plugin_id === "images")!, library = images.manifest.databases!.home!;
  const assets = join(home, "images", "assets"), outside = join(home, "outside-assets"), moved = join(home, "images", "assets-moved");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name,
      api_format, model, prompt, size, aspect_ratio, status, images_json, error, created_at) VALUES ('job-pa', 'pa', 'request-pa', 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
      .run(JSON.stringify(["first.png", "victim.png"].map(filename => ({ filename, mime_type: "image/png" }))));
  } finally { db.close(); }
  mkdirSync(assets, { recursive: true }); mkdirSync(outside, { recursive: true });
  for (const file of [join(assets, "first.png"), join(assets, "victim.png"), join(outside, "victim.png")]) writeFileSync(file, "png");
  // The seam is in the filesystem calls, not in a sleep: the directory is swapped for a link to a directory outside the declaration at
  // the exact step between the check and the removal. A re-check reads the directory's real path (the swap happens then, so the re-check
  // sees a link); a build without the re-check reaches rmSync with the real directory unchanged, and the swap happens just before the
  // removal, which then removes the same-named file outside the declaration through the link.
  const realRealpath = fs.realpathSync, realRm = fs.rmSync;
  let swapped = false, assetsRealpaths = 0;
  const swap = () => {
    if (swapped) return;
    swapped = true;
    renameSync(assets, moved);
    symlinkSync(outside, assets);
  };
  const realpathObserver = t.mock.method(fs, "realpathSync", (...args: Parameters<typeof realRealpath>) => {
    // The first name's re-check reads the directory's real path before the swap; the second name's re-check is the one that sees it.
    if (String(args[0]) === assets) { assetsRealpaths += 1; if (assetsRealpaths === 2) swap(); }
    return realRealpath(...args);
  });
  const rmObserver = t.mock.method(fs, "rmSync", (...args: Parameters<typeof realRm>) => {
    if (String(args[0]) === join(assets, "victim.png")) swap();
    return realRm(...args);
  });
  try {
    syncBuiltinESMExports();
    assert.equal(await projectDeletedHooksFor(home).clear("images", "pa"), true, "a name whose parent changed is left, not an error");
    assert.ok(existsSync(join(outside, "victim.png")), "the same name outside the declared directory is not removed through the link");
    assert.ok(existsSync(join(moved, "victim.png")), "the file that was in the declared directory is left, not removed elsewhere");
    assert.equal(existsSync(join(moved, "first.png")), false, "the name before the swap was removed normally");
    t.diagnostic("R-62: parent swapped for a link between check and removal; the outside file is not removed and no error is raised");
  } finally {
    realpathObserver.mock.restore();
    rmObserver.mock.restore();
    syncBuiltinESMExports();
  }
});

test("RAC-2436 S-86 a plain file in the declared directory still goes, and a name already gone is no error", async t => {
  const home = withHome(t);
  const images = catalog.find(entry => entry.project_plugin_id === "images")!, library = images.manifest.databases!.home!;
  const assets = join(home, "images", "assets");
  const db = openBaselineHomeSqlite(home, library.store_name, library);
  try {
    db.prepare(`INSERT INTO jobs (id, project_id, request_id, input_hash, connection_id, connection_name,
      api_format, model, prompt, size, aspect_ratio, status, images_json, error, created_at) VALUES ('job-pa', 'pa', 'request-pa', 'h', 'c', 'c', 'openai-images', 'm', 'p', '', '', 'succeeded', ?, '', 'now')`)
      .run(JSON.stringify(["plain.png", "missing.png"].map(filename => ({ filename, mime_type: "image/png" }))));
  } finally { db.close(); }
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "plain.png"), "png");
  assert.equal(await projectDeletedHooksFor(home).clear("images", "pa"), true, "a file already gone is no error");
  assert.equal(existsSync(join(assets, "plain.png")), false, "a plain file in the declared directory is still removed");
});
