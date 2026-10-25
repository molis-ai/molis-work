import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDatabase, PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import {
  DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkUninstallService, MolisWorkWebServiceManager, RuntimeIntegrationService, createPluginPlatform, homeStores, seedDemoBoard, removeInstalledPluginLibrary,
} from "@molis-ai/molis-work-app-local-host";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActions } from "./fixtures/plugin-actions.js";

// specs/repository-anti-corruption/slices/pg022-manifest-declarations.md, P1b: a plugin the Host did not ship, run by the Host, gets the
// library its Manifest declares (`databases.home`) under a ledger in the Home. The publisher is the install record's; once a library has
// an owner no other publisher's plugin opens it, and a name a shipped store, another plugin or a directory of the Home has is not taken.
// That the signature is not checked at install is PG-001's gap: these tests pin only what the ledger itself promises.

const STORAGE = { permission: "storage:private", required: true, reason: "插件把自己的数据存进 Home 里它自己的库" } as const;
const READ = { permission: "ledgerprobe:read", required: true, reason: "读自己的库" } as const;
const WRITE = { permission: "ledgerprobe:write", required: true, reason: "写自己的库" } as const;
const GRANTS = [STORAGE.permission, READ.permission, WRITE.permission];
const LIBRARY: HomePluginDatabaseDeclaration = { store_name: "ledger-notes", version: 1, read_permission: READ.permission, write_permission: WRITE.permission,
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const LEDGER = join("plugin-libraries", "plugin-libraries.db");

interface ProbeOptions {
  name?: string;
  signature?: string;
  version?: string;
  library?: Partial<HomePluginDatabaseDeclaration>;
}

/** An installed plugin (not on any start list): one write action over its library; it keeps the services it was started with. */
function probe(options: ProbeOptions = {}) {
  const { name = "ledgerprobe", signature = "publisher-one", version = "1.1.0", library = {} } = options;
  const id = `io.molis.work.example.${name}`;
  const shape = { scope: "project" as const, audiences: ["user" as const], permissions: [], subject_kinds: [] };
  const note: ActionDefinition<{ text: string }, string> = { capability_id: `${id}.note`, version: 1, operation: "command",
    action: { ...shape, title: "记一行", description: "把一行字写进插件自己的库", kind: "operation",
      input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } }, output_schema: { type: "string" } } };
  const started: Array<PluginHostServices | undefined> = [];
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version, name: id, kind: "app",
    publisher: { publisher_id: "molis", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [STORAGE, READ, WRITE], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [note], databases: { home: { ...LIBRARY, ...library } },
    upgrade_compatibility: { compatible_from_versions: Array.from({ length: 12 }, (_, minor) => `1.${minor}.0`).filter(earlier => Number(earlier.split(".")[1]) < Number(version.split(".")[1])), migratable_from_versions: [] } };
  const definition: PluginDefinition = { manifest, async start(context) {
    started.push(context.services);
    return { kind: "app", views: [], actions: [{ ...note, handle: () => "stored" }] };
  } };
  return { definition, id, started, database: (): PluginDatabase => started.at(-1)?.database ?? assert.fail("this start was given no services.database") };
}

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "installed-plugin-libraries-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

/** A project's platform over a Home directory, with the Host's own store registry: only what the test is about differs. */
function platformIn(directory: string, projectId = DEMO_PROJECT_ID) {
  const file = join(mkdtempSync(join(directory, "board-")), "board.db");
  seedDemoBoard(file, projectId);
  const store = new LocalProjectDatabase(file);
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const home = { directory, completeText: () => undefined, stores: homeStores() };
  const platform = createPluginPlatform({ actions: pluginActions(store, projectId), project_id: projectId, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    deleteInstallationData: installId => privateStorage.deleteInstallationData(installId),
    home });
  return { store, platform, privateStorage, home };
}

type Item = ReturnType<typeof platformIn>;
const install = (item: Item, definition: PluginDefinition) => item.platform.runtime.install({ definition, deployment: "local", grants: GRANTS }).install.install_id;
/** Install and start; resolves with the install id. */
async function run(item: Item, definition: PluginDefinition) {
  const installId = install(item, definition);
  await item.platform.runtime.start(installId);
  return installId;
}
/** Install and start, expecting the start to be refused; resolves with the code the Runtime's record keeps. */
async function refused(item: Item, definition: PluginDefinition) {
  const installId = install(item, definition);
  await assert.rejects(item.platform.runtime.start(installId), /启动失败/u);
  return item.platform.runtime.get(installId).last_error_code;
}

const libraryFile = (home: string, name: string) => join(home, name, `${name}.db`);
function read<T>(file: string, query: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return query(db); } finally { db.close(); }
}
const ledgerRows = (home: string) => existsSync(join(home, LEDGER))
  ? read(join(home, LEDGER), db => db.prepare("SELECT plugin_id, publisher_signature, store_name, version FROM plugin_home_libraries ORDER BY plugin_id").all().map(row => ({ ...row })))
  : [];
const notes = (home: string, name = LIBRARY.store_name) => read(libraryFile(home, name), db => db.prepare("SELECT text FROM notes ORDER BY id").all().map(row => (row as { text: string }).text));
const noteInto = (database: PluginDatabase, text: string) => database.transaction(async () => {}, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [text]));

test("S-68 RAC-242 library cleanup refuses another publisher or a reserved store and never touches unregistered directories", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe();
  const unregistered = join(directory, "not-in-ledger");
  mkdirSync(unregistered); writeFileSync(join(unregistered, "keep.txt"), "unclaimed");
  const absent = { plugin_id: "io.molis.work.example.absent", publisher_signature: "publisher-one" };
  assert.equal(removeInstalledPluginLibrary(directory, absent, homeStores()), false);
  assert.equal(existsSync(join(directory, LEDGER)), false, "a missing ledger is not initialized for cleanup");
  try {
    const id = await run(item, plugin.definition);
    await noteInto(plugin.database(), "protected");
    await item.platform.runtime.stop(id);
    const before = ledgerRows(directory), bytes = readFileSync(libraryFile(directory, LIBRARY.store_name));
    assert.throws(() => removeInstalledPluginLibrary(directory, { plugin_id: plugin.id, publisher_signature: "another-publisher" }, homeStores()),
      { code: "plugin.home_database.publisher_mismatch" });
    const reserved = homeStoreRegistry([...homeStores().stores, { path: LIBRARY.store_name, owner: "system" }]);
    assert.throws(() => removeInstalledPluginLibrary(directory, { plugin_id: plugin.id, publisher_signature: "publisher-one" }, reserved),
      { code: "plugin.home_database.object_taken" });
    assert.deepEqual(ledgerRows(directory), before);
    assert.deepEqual(readFileSync(libraryFile(directory, LIBRARY.store_name)), bytes);
    assert.equal(removeInstalledPluginLibrary(directory, absent, homeStores()), false);
    assert.equal(readFileSync(join(unregistered, "keep.txt"), "utf8"), "unclaimed");
  } finally { item.store.close(); }
}));

test("S-68 RAC-242 cleanup removes only its recorded owner while another retained library and its ledger row stay unchanged", withDirectory(async directory => {
  const item = platformIn(directory), own = probe(), kept = probe({ name: "kept-library", library: { store_name: "kept-library" } });
  try {
    const ownId = await run(item, own.definition), keptId = await run(item, kept.definition);
    await noteInto(own.database(), "discarded"); await noteInto(kept.database(), "retained");
    await item.platform.runtime.stop(ownId); await item.platform.runtime.stop(keptId);
    const before = ledgerRows(directory).filter(row => row.plugin_id === kept.id), bytes = readFileSync(libraryFile(directory, "kept-library"));
    assert.equal(removeInstalledPluginLibrary(directory, { plugin_id: own.id, publisher_signature: "publisher-one" }, homeStores()), true);
    assert.equal(existsSync(join(directory, LIBRARY.store_name)), false);
    assert.deepEqual(ledgerRows(directory), before);
    assert.deepEqual(readFileSync(libraryFile(directory, "kept-library")), bytes);
    assert.deepEqual(notes(directory, "kept-library"), ["retained"]);
    assert.equal(removeInstalledPluginLibrary(directory, { plugin_id: own.id, publisher_signature: "publisher-one" }, homeStores()), false, "cleanup is idempotent");
  } finally { item.store.close(); }
}));

test("S-68 RAC-242 a file-removal failure keeps the owner row and data, and retry actually removes both", async t => {
  const directory = mkdtempSync(join(tmpdir(), "installed-library-cleanup-failure-")), item = platformIn(directory), plugin = probe();
  t.after(() => { item.store.close(); rmSync(directory, { recursive: true, force: true }); });
  const id = await run(item, plugin.definition);
  await noteInto(plugin.database(), "retryable"); await item.platform.runtime.stop(id);
  const before = ledgerRows(directory), bytes = readFileSync(libraryFile(directory, LIBRARY.store_name));
  const failure = new Error("file removal interrupted"), original = fs.rmSync;
  const injected = t.mock.method(fs, "rmSync", (...args: Parameters<typeof fs.rmSync>) => {
    if (args[0] === join(directory, LIBRARY.store_name)) throw failure;
    return original(...args);
  });
  syncBuiltinESMExports();
  try { assert.throws(() => removeInstalledPluginLibrary(directory, { plugin_id: plugin.id, publisher_signature: "publisher-one" }, homeStores()), error => error === failure); }
  finally { injected.mock.restore(); syncBuiltinESMExports(); }
  assert.deepEqual(ledgerRows(directory), before);
  assert.deepEqual(readFileSync(libraryFile(directory, LIBRARY.store_name)), bytes);
  assert.equal(removeInstalledPluginLibrary(directory, { plugin_id: plugin.id, publisher_signature: "publisher-one" }, homeStores()), true);
  assert.equal(existsSync(join(directory, LIBRARY.store_name)), false);
  assert.deepEqual(ledgerRows(directory), []);
});

test("S-68 RAC-242 an installed native package retains its Home library on request and cannot read it after a non-retaining uninstall and reinstall", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe();
  try {
    const id = await run(item, plugin.definition);
    await noteInto(plugin.database(), "kept for reinstall");
    await item.platform.runtime.uninstall(id, { retain_private_data: true });
    assert.equal(ledgerRows(directory).length, 1);
    await run(item, plugin.definition);
    assert.deepEqual(notes(directory), ["kept for reinstall"]);
    await item.platform.runtime.uninstall(id, { retain_private_data: false });
    assert.equal(existsSync(join(directory, LIBRARY.store_name)), false);
    assert.deepEqual(ledgerRows(directory), []);
    await run(item, plugin.definition);
    assert.deepEqual(notes(directory), []);
    await item.platform.runtime.stop(id);
  } finally { item.store.close(); }
}));

test("S-68 RAC-242 lifecycle cleanup uses the platform's actual reserved-store registry and leaves library and KV retryable on refusal", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe();
  try {
    const id = await run(item, plugin.definition);
    await noteInto(plugin.database(), "protected"); plugin.started.at(-1)!.storage!.set("old", "private value");
    await item.platform.runtime.stop(id);
    const before = { rows: ledgerRows(directory), bytes: readFileSync(libraryFile(directory, LIBRARY.store_name)), kv: item.privateStorage.snapshotInstallationData(id) };
    item.home.stores = homeStoreRegistry([...homeStores().stores, { path: LIBRARY.store_name, owner: "system" }]);
    await assert.rejects(item.platform.runtime.uninstall(id, { retain_private_data: false }), { code: "plugin.home_database.object_taken" });
    assert.deepEqual(ledgerRows(directory), before.rows);
    assert.deepEqual(readFileSync(libraryFile(directory, LIBRARY.store_name)), before.bytes);
    assert.deepEqual(item.privateStorage.snapshotInstallationData(id), before.kv);
    item.home.stores = homeStores();
    await item.platform.runtime.uninstall(id);
    assert.equal(existsSync(join(directory, LIBRARY.store_name)), false);
    assert.deepEqual(ledgerRows(directory), []);
    assert.deepEqual(item.privateStorage.snapshotInstallationData(id), []);
  } finally { item.store.close(); }
}));

test("S-68 RAC-242 retaining one project's installation leaves a second real project's shared Home library and live WAL connection usable", withDirectory(async directory => {
  const a = platformIn(directory, "library-project-a"), b = platformIn(directory, "library-project-b");
  const first = probe(), second = probe();
  try {
    const aId = await run(a, first.definition), bId = await run(b, second.definition);
    await noteInto(first.database(), "from project A");
    assert.deepEqual(second.database().all("SELECT text FROM notes").map(row => ({ ...row })), [{ text: "from project A" }]);
    await noteInto(second.database(), "from project B");
    const path = libraryFile(directory, LIBRARY.store_name), inode = statSync(path).ino, before = ledgerRows(directory);
    assert.equal(read(path, db => db.prepare("PRAGMA journal_mode").get()?.journal_mode), "wal");
    assert.equal(existsSync(`${path}-wal`), true, "project B still holds the real WAL-backed library");
    await a.platform.runtime.uninstall(aId, { retain_private_data: true });
    assert.equal(b.platform.runtime.get(bId).state, "running");
    assert.equal(statSync(path).ino, inode, "the same shared file remains in place");
    assert.deepEqual(ledgerRows(directory), before);
    await noteInto(second.database(), "B after A uninstall");
    await run(a, first.definition);
    assert.deepEqual(first.database().all("SELECT text FROM notes ORDER BY id").map(row => ({ ...row })),
      [{ text: "from project A" }, { text: "from project B" }, { text: "B after A uninstall" }]);
  } finally {
    for (const item of [a, b]) {
      try { for (const record of item.platform.runtime.list()) if (record.state === "running") await item.platform.runtime.stop(record.install_id); }
      finally { item.store.close(); }
    }
  }
}));

test("S-68 RAC-242 retained-data discard finishes library and KV cleanup before publishing a replacement, or leaves the old row and data retryable", async t => {
  const directory = mkdtempSync(join(tmpdir(), "installed-library-discard-")), item = platformIn(directory), plugin = probe();
  t.after(async () => {
    try { for (const record of item.platform.runtime.list()) if (record.state === "running") await item.platform.runtime.stop(record.install_id); }
    finally { item.store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  const id = await run(item, plugin.definition);
  await noteInto(plugin.database(), "old library");
  plugin.started.at(-1)!.storage!.set("old", "private value");
  await item.platform.runtime.uninstall(id, { retain_private_data: true });
  const before = structuredClone(item.platform.runtime.get(id)), ledgerBefore = ledgerRows(directory);
  const privateBefore = item.privateStorage.snapshotInstallationData(id), bytes = readFileSync(libraryFile(directory, LIBRARY.store_name));
  assert.equal(privateBefore.length, 1);
  const candidate = probe({ version: "1.2.0" }), failure = new Error("discard file removal interrupted"), original = fs.rmSync;
  const injected = t.mock.method(fs, "rmSync", (...args: Parameters<typeof fs.rmSync>) => {
    if (args[0] === join(directory, LIBRARY.store_name)) throw failure;
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => item.platform.runtime.install({ definition: candidate.definition, deployment: "local", grants: GRANTS, discard_kept_data: true }),
      { code: "plugin.executor_failed" });
  } finally { injected.mock.restore(); syncBuiltinESMExports(); }
  assert.deepEqual(item.platform.runtime.get(id), before, "cleanup failure did not publish a replacement record");
  assert.deepEqual(ledgerRows(directory), ledgerBefore);
  assert.deepEqual(readFileSync(libraryFile(directory, LIBRARY.store_name)), bytes);
  assert.deepEqual(item.privateStorage.snapshotInstallationData(id), privateBefore, "file failure happened before any KV deletion");
  const retry = probe({ version: "1.2.0" });
  const installed = item.platform.runtime.install({ definition: retry.definition, deployment: "local", grants: GRANTS, discard_kept_data: true }).install;
  assert.equal(installed.install_id, id);
  assert.notEqual(installed.installation_generation, before.installation_generation);
  assert.equal(existsSync(join(directory, LIBRARY.store_name)), false);
  assert.deepEqual(ledgerRows(directory), []);
  assert.deepEqual(item.privateStorage.snapshotInstallationData(id), [], "retained=true with explicit discard also clears KV");
  await item.platform.runtime.start(id);
  assert.deepEqual(notes(directory), []);
  assert.equal(candidate.started.length, 0, "the failed candidate never started");
});

test("S-68 RAC-242 invalid grants or a conflicting registered replacement cannot discard an existing library or private data", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe();
  try {
    const id = await run(item, plugin.definition);
    await noteInto(plugin.database(), "old library"); plugin.started.at(-1)!.storage!.set("old", "private value");
    await item.platform.runtime.uninstall(id, { retain_private_data: true });
    const before = { record: structuredClone(item.platform.runtime.get(id)), rows: ledgerRows(directory), bytes: readFileSync(libraryFile(directory, LIBRARY.store_name)),
      kv: item.privateStorage.snapshotInstallationData(id) };
    const registered = probe({ version: "1.2.0" });
    assert.throws(() => item.platform.runtime.install({ definition: registered.definition, deployment: "local", grants: ["undeclared:write"], discard_kept_data: true }), { code: "plugin.grant_denied" });
    item.platform.runtime.register(registered.definition);
    const conflict = probe({ version: "1.2.0" });
    assert.throws(() => item.platform.runtime.install({ definition: conflict.definition, deployment: "local", grants: GRANTS, discard_kept_data: true }), { code: "plugin.definition_conflict" });
    assert.deepEqual(item.platform.runtime.get(id), before.record);
    assert.deepEqual(ledgerRows(directory), before.rows);
    assert.deepEqual(readFileSync(libraryFile(directory, LIBRARY.store_name)), before.bytes);
    assert.deepEqual(item.privateStorage.snapshotInstallationData(id), before.kv);
  } finally { item.store.close(); }
}));

test("RAC-315 an installed plugin the Host runs gets the library its Manifest declares: made when it starts, recorded in the ledger under the publisher of its install record, usable, and the same rows when the plugin is installed and started again", withDirectory(async directory => {
  const first = platformIn(directory), plugin = probe();
  try {
    const installId = await run(first, plugin.definition);
    assert.equal(plugin.started.length, 1);
    await noteInto(plugin.database(), "一行");
    assert.deepEqual(notes(directory), ["一行"]);
    assert.equal(read(libraryFile(directory, LIBRARY.store_name), db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 1);
    const record = first.platform.runtime.get(installId);
    assert.deepEqual(ledgerRows(directory), [{ plugin_id: plugin.id, publisher_signature: record.publisher_signature, store_name: LIBRARY.store_name, version: 1 }],
      "the ledger's publisher is the install record's");
    assert.equal(statSync(join(directory, LEDGER)).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory, "plugin-libraries")).mode & 0o777, 0o700);
  } finally { first.store.close(); }
  const second = platformIn(directory), again = probe();
  try {
    await run(second, again.definition);
    assert.deepEqual(again.database().all("SELECT text FROM notes").map(row => ({ ...row })), [{ text: "一行" }], "the same publisher opens the library again with its rows");
    assert.equal(ledgerRows(directory).length, 1, "one row for the plugin, not one per start");
  } finally { second.store.close(); }
}));

test("RAC-316 another publisher's plugin with the same plugin id is refused a library the ledger gave to the first: it runs nothing, the rows and the row are as they were, and the first plugin still writes", withDirectory(async directory => {
  const item = platformIn(directory), owner = probe(), lookalike = probe({ signature: "publisher-two" });
  try {
    await run(item, owner.definition);
    await noteInto(owner.database(), "first");
    const before = ledgerRows(directory);
    assert.equal(await refused(item, lookalike.definition), "plugin.home_database.publisher_mismatch");
    assert.equal(lookalike.started.length, 0, "the lookalike's code never ran, so it read and wrote nothing");
    assert.deepEqual(notes(directory), ["first"]);
    assert.deepEqual(ledgerRows(directory), before);
    await noteInto(owner.database(), "second");
    assert.deepEqual(notes(directory), ["first", "second"]);
  } finally { item.store.close(); }
}));

test("RAC-317 the publisher of an install cannot be changed: an upgrade to another publisher's definition under the same install id is refused by the Runtime, and the ledger and the library are as they were", withDirectory(async directory => {
  const item = platformIn(directory), owner = probe();
  try {
    const installId = await run(item, owner.definition);
    await noteInto(owner.database(), "kept");
    const signature = item.platform.runtime.get(installId).publisher_signature;
    const other = probe({ signature: "publisher-two", version: "1.2.0" });
    await assert.rejects(item.platform.runtime.upgrade({ install_id: installId, definition: other.definition, grants: GRANTS }), /同一插件和发布者签名/u);
    assert.equal(other.started.length, 0);
    assert.equal(item.platform.runtime.get(installId).publisher_signature, signature);
    assert.deepEqual(ledgerRows(directory), [{ plugin_id: owner.id, publisher_signature: signature, store_name: LIBRARY.store_name, version: 1 }]);
    assert.deepEqual(notes(directory), ["kept"]);
  } finally { item.store.close(); }
}));

test("RAC-318 an installed plugin is not given a name that is already taken: a shipped store, the ledger's own, another plugin's library, or a directory the Home has that no ledger row made — nothing is made, nothing is changed", withDirectory(async directory => {
  const item = platformIn(directory);
  try {
    for (const name of ["todo", "images", "feed", "config", "projects", "plugin-libraries"]) {
      const taker = probe({ name: `taker-${name}`, library: { store_name: name } });
      assert.equal(await refused(item, taker.definition), "plugin.home_database.object_taken", name);
      assert.equal(taker.started.length, 0, `${name}: the plugin's code never ran`);
    }
    assert.equal(existsSync(join(directory, "todo")), false, "a shipped store's directory is not made for the taker");
    assert.equal(existsSync(join(directory, LEDGER)), false, "a name the registry holds is refused before the ledger is even opened");

    const owner = probe({ name: "owner" });
    await run(item, owner.definition);
    await noteInto(owner.database(), "owner's");
    const theirs = probe({ name: "other" });
    assert.equal(await refused(item, theirs.definition), "plugin.home_database.object_taken", "another plugin's library");
    assert.deepEqual(notes(directory), ["owner's"]);

    mkdirSync(join(directory, "stray"));
    writeFileSync(join(directory, "stray", "kept.txt"), "somebody's file\n");
    const stray = probe({ name: "stray", library: { store_name: "stray" } });
    assert.equal(await refused(item, stray.definition), "plugin.home_database.object_taken", "a directory no row made");
    assert.equal(readFileSync(join(directory, "stray", "kept.txt"), "utf8"), "somebody's file\n");
    assert.deepEqual(ledgerRows(directory).map(row => row.plugin_id), [owner.id], "none of the refusals wrote a row");
  } finally { item.store.close(); }
}));

test("RAC-319 a library is opened only as the ledger recorded it: another version, other tables or another name is refused and the library is left as it was; a first open that fails leaves no row and no directory, so the fixed plugin opens", withDirectory(async directory => {
  const item = platformIn(directory), owner = probe();
  try {
    await run(item, owner.definition);
    await noteInto(owner.database(), "kept");
    await item.platform.runtime.stop(item.platform.runtime.list()[0]!.install_id);
    let n = 0;
    for (const [label, library, code] of [
      ["version", { version: 2 }, "plugin.home_database.version_mismatch"],
      ["tables", { schema: `${LIBRARY.schema} CREATE TABLE extra (id INTEGER PRIMARY KEY);` }, "plugin.home_database.shape_mismatch"],
      ["name", { store_name: "ledger-notes-two" }, "plugin.home_database.shape_mismatch"],
    ] as const) {
      const installId = item.platform.runtime.list()[0]!.install_id;
      await item.platform.runtime.uninstall(installId, { retain_private_data: true });
      n += 1;
      const changed = probe({ version: `1.${n + 1}.0`, library });
      assert.equal(await refused(item, changed.definition), code, label);
      assert.equal(changed.started.length, 0, `${label}: the plugin's code never ran`);
      assert.deepEqual(notes(directory), ["kept"], label);
      assert.deepEqual(ledgerRows(directory).map(row => [row.store_name, row.version]), [[LIBRARY.store_name, 1]], label);
      assert.equal(existsSync(join(directory, "ledger-notes-two")), false, `${label}: no second library`);
    }

    const broken = probe({ name: "broken", library: { store_name: "broken-notes", schema: "CREATE TABLE (" } });
    const code = await refused(item, broken.definition);
    assert.notEqual(code, "plugin.home_database.object_taken");
    assert.equal(existsSync(join(directory, "broken-notes")), false, "the directory the failed open made is gone");
    assert.deepEqual(ledgerRows(directory).map(row => row.plugin_id), [owner.id], "and no row was kept");
    const fixed = probe({ name: "broken", version: "1.2.0", library: { store_name: "broken-notes" } });
    await item.platform.runtime.uninstall(item.platform.runtime.list().find(record => record.plugin_id === broken.id)!.install_id, { retain_private_data: true });
    await run(item, fixed.definition);
    await noteInto(fixed.database(), "fixed");
    assert.deepEqual(notes(directory, "broken-notes"), ["fixed"]);
  } finally { item.store.close(); }
}));

test("RAC-320 an installed plugin's library is declared the way a shipped one is, but a partitioned one is for the Host's own list only, and the Manifest's names and permissions are checked before anything is made", withDirectory(async directory => {
  const item = platformIn(directory);
  try {
    const partitioned = probe({ name: "partitioned", library: { store_name: "split-notes", partition: "project" } });
    assert.equal(await refused(item, partitioned.definition), "plugin.declaration_invalid");
    assert.equal(partitioned.started.length, 0);
    assert.equal(existsSync(join(directory, "split-notes")), false);
    assert.equal(existsSync(join(directory, LEDGER)), false, "refused before the ledger was opened");
    for (const name of ["Dataset", "../data", "a/b", ""]) {
      assert.throws(() => install(item, probe({ name: "badname", library: { store_name: name } }).definition), "a Manifest with such a library name does not install");
    }
    assert.throws(() => install(item, { ...probe({ name: "noperm" }).definition, manifest: { ...probe({ name: "noperm" }).definition.manifest, permissions: [STORAGE, READ] } }),
      "a Manifest that does not list the write permission does not install");
  } finally { item.store.close(); }
}));

test("RAC-321 uninstall --purge-user-data removes the libraries installed plugins made, named by the ledger, and a row that is not one plain directory name or names a registered store is never listed; a ledger that cannot be read stops the purge", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe();
  try { await run(item, plugin.definition); } finally { item.store.close(); }
  const userHome = join(directory, "user");
  mkdirSync(userHome, { recursive: true });
  const service = () => new MolisWorkUninstallService({ homeDirectory: directory, projects: { inspect: async () => ({ projects: [], conflict: null }), removeDemos: async () => {} },
    runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: directory, userHomeDirectory: userHome,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: directory, userHomeDirectory: userHome, platform: "linux" }) });
  const targets = async () => (await service().prepare({ purge_user_data: true })).changes.map(change => change.target);
  const library = join(directory, LIBRARY.store_name);
  const listed = await targets();
  assert.ok(listed.includes(library), "the plugin's library");
  assert.ok(listed.includes(join(directory, "plugin-libraries")), "and the ledger itself");

  // A row is a name the Host wrote, but it becomes a path that is deleted: tampered names are not followed.
  mkdirSync(join(directory, "feed"), { recursive: true });
  const db = new DatabaseSync(join(directory, LEDGER));
  for (const name of ["feed", "../outside", "a/b", "Upper"]) {
    db.prepare("INSERT INTO plugin_home_libraries VALUES (?, ?, ?, 1, 'digest', '2026-10-24T00:00:00.000Z')").run(`tampered.${name}`, "x", name);
  }
  db.close();
  const after = await targets();
  assert.equal(after.includes(join(directory, "..", "outside")) || after.includes(join(directory, "..", "outside").replace(/\/\.\.\//u, "/")), false);
  assert.equal(after.filter(target => target === join(directory, "feed")).length, 1, "a registered store is listed once, by its own entry");
  assert.ok(after.includes(library));
  assert.equal(after.some(target => /outside|Upper|a\/b$/u.test(target)), false);

  writeFileSync(join(directory, LEDGER), "not a database\n");
  const plan = await service().prepare({ purge_user_data: true });
  assert.equal(plan.status, "conflict");
  assert.match(plan.conflicts.join(" "), /账本读不出来/u);
}));
