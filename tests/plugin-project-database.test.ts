import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabase, PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest, PluginUpgradeContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import {
  DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkLocalHost, captureHostLog, createPluginPlatform, homeStores, molisWorkHostProjectReference, seedDemoBoard,
  type HostLogEntry,
} from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { withLibrary } from "./fixtures/home-library.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

// W3-06 D: a plugin the Host runs in a project's platform can have a library in the Home, through the one service main has for
// it, `services.database`, when the Host's own start list declares one for it (`PluginPlatformEntry.database`). Nothing the
// plugin holds picks the library: not its definition, not its id, not an action argument.

const STORAGE = { permission: "storage:private", required: true, reason: "插件把自己的数据存进 Home 里它自己的库" } as const;
const READ = { permission: "dataprobe:read", required: true, reason: "读自己的库" } as const;
const WRITE = { permission: "dataprobe:write", required: true, reason: "写自己的库" } as const;
/**
 * The probe's library. A plugin is given only a library the Home's store registry (W4-11) lists as its own, so each platform
 * here registers it to the probe that uses it (`platformIn`); no shipped owner has this name. The Home is a temporary directory.
 */
const LIBRARY = "probe-notes";
const DECLARATION: PluginDatabaseDeclaration = { store_name: LIBRARY, version: 1, read_permission: READ.permission, write_permission: WRITE.permission,
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const idOf = (name: string) => `io.molis.work.example.${name}`;

/** The Home's top-level entries that are not a library, registered or not (docs/system/HOME-DATA.md sections 5 and 6). */
const HOME_DIRECTORIES = ["feed", "config", "agent-runtime", "browser", "shelf", "logs", "releases", "bin", "cache", "backups", "plugin-builder",
  "directory-access", "runtime-integrations", "projects", "sessions", "alchemist", "plugin-files"];

interface ProbeOptions {
  name?: string;
  permissions?: PluginManifest["permissions"];
  execution?: "sandbox";
  version?: string;
  /** What the plugin's own `stop` hook does with its database while the Runtime is stopping it. */
  onStop?: (database: PluginDatabase | undefined) => Promise<void> | void;
}

/** A plugin that exists only for the test: one write action and one read action over its library; it keeps the services it was started with. */
function probe(options: ProbeOptions = {}) {
  const { name = "dataprobe", permissions = [STORAGE, READ, WRITE], execution, version = "1.0.0", onStop } = options;
  const shape = { scope: "project" as const, audiences: ["user" as const], permissions: [], subject_kinds: [] };
  const note: ActionDefinition<{ text: string }, string> = { capability_id: `${idOf(name)}.note`, version: 1, operation: "command",
    action: { ...shape, title: "记一行", description: "把一行字写进插件自己的库", kind: "operation",
      input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } }, output_schema: { type: "string" } } };
  const count: ActionDefinition<Record<string, never>, number> = { capability_id: `${idOf(name)}.count`, version: 1, operation: "query",
    action: { ...shape, title: "数一数", description: "读自己的库里有几行", kind: "query",
      input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "number" } } };
  const started: Array<PluginHostServices | undefined> = [];
  const preflight: Array<PluginUpgradeContext["services"]> = [];
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: idOf(name), version, name: idOf(name), kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions, capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [note, count],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const definition: PluginDefinition = { manifest, ...(execution ? { execution } : {}),
    async start(context) {
      started.push(context.services);
      const database = () => context.services?.database ?? (() => { throw new Error("没有 database"); })();
      return { kind: "app", views: [], actions: [
        { ...note, handle: (caller, input) => database().transaction(caller.beforeEffect, tx => {
          tx.run("INSERT INTO notes (text) VALUES (?)", [(input as { text: string }).text]);
          return "stored";
        }) },
        { ...count, handle: () => Number(database().get("SELECT count(*) AS n FROM notes")!.n) },
      ] };
    },
    async stop(context) { await onStop?.(context.services?.database); },
    async validateUpgrade({ context }) { preflight.push(context.services); } };
  return { definition, note, count, started, preflight, id: idOf(name),
    database: (): PluginDatabase => started.at(-1)?.database ?? assert.fail("this start was given no services.database") };
}

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "plugin-project-database-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

/** The platform the way a project's start builds it, over a Home directory: only what the test is about differs. */
/** `libraries`: the probe libraries this Home registers, beside the Host's stores, and the plugin each is registered to. */
function platformIn(directory: string, home: string | null = directory, libraries: Record<string, string> = { [LIBRARY]: idOf("dataprobe") }) {
  const stores = homeStoreRegistry([...homeStores().stores, ...Object.entries(libraries).map(([path, owner]) => ({ path, owner, library: { baseline: DECLARATION } }))]);
  const file = join(mkdtempSync(join(directory, "board-")), "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: home === null ? null : { directory: home, completeText: () => undefined, stores } });
  const installId = (pluginId: string) => platform.runtime.list().find(record => record.plugin_id === pluginId)!.install_id;
  return { store, platform, installId };
}

/** node:sqlite hands rows out with a null prototype; deepStrictEqual wants plain objects. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const libraryFile = (home: string, name: string) => join(home, name, `${name}.db`);
/** Reads a library straight from its file, the way nothing of the platform does. */
function inspect<T>(home: string, name: string, read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(libraryFile(home, name), { readOnly: true });
  try { return read(db); } finally { db.close(); }
}
const rows = (home: string, name: string) => inspect(home, name, db => db.prepare("SELECT text FROM notes ORDER BY id").all().map(row => (row as { text: string }).text));
const noteInto = (database: PluginDatabase, text: string) => database.transaction(async () => {}, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [text]));

test("a start-list entry that declares a database gives its plugin services.database: the library is made at the declared baseline when the plugin starts, under the name the entry gave, and the plugin writes through transaction(beforeEffect, …)",
  withDirectory(async directory => {
    const item = platformIn(directory), plugin = probe();
    try {
      assert.deepEqual((await item.platform.start([{ definition: withLibrary(plugin.definition, DECLARATION), trust: { level: "host" } }])).running, [plugin.id]);
      const database = plugin.database();
      assert.equal(existsSync(libraryFile(directory, "dataprobe")), false, "the plugin id's last segment names nothing: the entry does");
      assert.equal(inspect(directory, LIBRARY, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 1);
      assert.equal(statSync(libraryFile(directory, LIBRARY)).mode & 0o777, 0o600, "personal libraries are the person's alone");
      assert.equal(statSync(join(directory, LIBRARY)).mode & 0o777, 0o700);
      await noteInto(database, "一行");
      assert.deepEqual(rows(directory, LIBRARY), ["一行"]);
      assert.deepEqual(plain(database.all("SELECT text FROM notes")), [{ text: "一行" }]);
      assert.equal(Object.isFrozen(database), true, "what the plugin holds cannot be extended into a way round the Host");
    } finally { item.store.close(); }
  }));

test("beforeEffect decides the write: a transaction whose beforeEffect refuses writes nothing, an async body is rolled back, and a read may not write",
  withDirectory(async directory => {
    const item = platformIn(directory), plugin = probe();
    try {
      await item.platform.start([{ definition: withLibrary(plugin.definition, DECLARATION), trust: { level: "host" } }]);
      const database = plugin.database();
      await assert.rejects(database.transaction(async () => { throw new Error("这一次调用已被取消"); }, tx => tx.run("INSERT INTO notes (text) VALUES ('cancelled')")),
        /已被取消/);
      await assert.rejects(database.transaction(async () => {}, (async (tx: { run: (sql: string) => unknown }) => { tx.run("INSERT INTO notes (text) VALUES ('async')"); }) as never));
      assert.throws(() => database.get("DELETE FROM notes"), "reads accept SELECT and WITH only");
      assert.deepEqual(rows(directory, LIBRARY), [], "none of the three wrote");
      await noteInto(database, "kept");
      assert.deepEqual(rows(directory, LIBRARY), ["kept"], "a refused transaction leaves the library usable");
    } finally { item.store.close(); }
  }));

test("RAC-304 only a definition the Host's start list holds is given a library: one listed whose Manifest declares none has none, and another definition that carries the same plugin id and asks for the library in its Manifest is refused and runs nothing, installed over the declared one: the registry's library is the shipped plugin's, and the ledger gives an installed plugin no store the Host's registry holds (plugin.home_database.object_taken)",
  withDirectory(async directory => {
    const first = platformIn(directory), declared = probe(), undeclared = probe({ name: "plainprobe" }), lookalike = probe({ version: "1.1.0" });
    try {
      assert.deepEqual((await first.platform.start([{ definition: withLibrary(declared.definition, DECLARATION), trust: { level: "host" } },
        { definition: undeclared.definition, trust: { level: "host" } }])).running.sort(), [declared.id, undeclared.id].sort());
      assert.ok(declared.started.at(-1)?.database);
      assert.equal(undeclared.started.at(-1)?.database, undefined, "storage:private and the two permissions are in its Manifest, and no entry declared a library");
      // A Manifest that asks for the library does not make the lookalike the plugin the list holds: it is refused, not given a library.
      const asking = probe({ version: "1.2.0" });
      await assert.rejects(first.platform.runtime.upgrade({ install_id: first.installId(declared.id), definition: withLibrary(asking.definition, DECLARATION),
        grants: [STORAGE.permission, READ.permission, WRITE.permission] }), /启动失败/u);
      assert.deepEqual(first.platform.runtime.list().map(record => [record.state, record.version]), [["running", "1.0.0"], ["running", "1.0.0"]], "the refused version left the plugin as it was");
      assert.equal(asking.started.length, 0, "it ran nothing, so it read and wrote nothing of the library");
      // A definition installed beside the list asks for the shipped plugin's library name: the Host's registry holds it, so the
      // ledger refuses (installed-plugin-libraries.test.ts has the installed plugin that asks for a free name), and the Runtime's
      // record says why under the refusal's own code.
      const installed = probe({ name: "askprobe" });
      const { install } = first.platform.runtime.install({ trust: { level: "unsigned" }, definition: withLibrary(installed.definition, DECLARATION), deployment: "local",
        grants: [STORAGE.permission, READ.permission, WRITE.permission] });
      await assert.rejects(first.platform.runtime.start(install.install_id), /启动失败/u);
      assert.equal(installed.started.length, 0, "the installed plugin's code never ran");
      assert.equal(first.platform.runtime.get(install.install_id).last_error_code, "plugin.home_database.object_taken", "not the Runtime's generic executor failure");
      // The entry is about the definition object the Host listed. A different one with the same plugin id, here a version put over
      // the declared plugin, is not it.
      await first.platform.runtime.upgrade({ install_id: first.installId(declared.id), definition: lookalike.definition,
        grants: [STORAGE.permission, READ.permission, WRITE.permission] });
      assert.equal(lookalike.started.length, 1, "the version put over it ran");
      assert.equal(lookalike.started.at(-1)?.database, undefined);
    } finally { first.store.close(); }
    // And a platform whose list carries the same plugin id without a declaration (a developed or generated plugin).
    const second = platformIn(directory), standIn = probe();
    try {
      assert.deepEqual((await second.platform.start([{ definition: standIn.definition }])).running, [declared.id]);
      assert.equal(standIn.started.at(-1)?.database, undefined);
    } finally { second.store.close(); }
  }));

test("a start list that declares a library wrongly does not start at all, and nothing of any library is made: sandboxed code, a platform that reaches no Home, a Manifest that does not list the permissions, a library another owner registered (the Host's, a module's, a shipped plugin's, another probe's), a Home entry that is not a library, a name the Home's store registry does not list, a name that is not one directory",
  withDirectory(async directory => {
    const refuse = async (label: string, entries: Parameters<ReturnType<typeof platformIn>["platform"]["start"]>[0], reason: RegExp, home: string | null = directory,
      libraries?: Record<string, string>) => {
      const item = platformIn(directory, home, libraries);
      try {
        await assert.rejects(item.platform.start(entries), reason, label);
        assert.deepEqual(item.platform.supervisor.states(), [], `${label}: not even the plugins beside it started`);
      } finally { item.store.close(); }
    };
    const beside = probe({ name: "besideprobe" });
    await refuse("sandboxed", [{ definition: withLibrary(probe({ name: "sandboxed", execution: "sandbox" }).definition, DECLARATION), grants: [STORAGE.permission, READ.permission, WRITE.permission] },
      { definition: beside.definition }], /沙箱/);
    await refuse("no Home", [{ definition: withLibrary(probe().definition, DECLARATION), trust: { level: "host" } }, { definition: beside.definition }], /Home/, null);
    await refuse("permissions not listed", [{ definition: withLibrary(probe({ permissions: [STORAGE] }).definition, DECLARATION), trust: { level: "host" } }, { definition: beside.definition }], /权限/);
    await refuse("another probe's", [{ definition: withLibrary(probe({ name: "first" }).definition, DECLARATION), trust: { level: "host" } },
      { definition: withLibrary(probe({ name: "second" }).definition, DECLARATION), trust: { level: "host" } }], /主人/, directory, { [LIBRARY]: idOf("first") });
    const libraries = homeStores().stores.filter(store => store.library).map(store => store.path);
    assert.ok(["assistant", "memory", "functions", "characters", "server", "issues", "todo", "pages"].every(name => libraries.includes(name)));
    for (const name of libraries) {
      await refuse(`library ${name}`, [{ definition: withLibrary(probe().definition, { ...DECLARATION, store_name: name }), trust: { level: "host" } }], /主人/);
    }
    for (const name of HOME_DIRECTORIES) {
      await refuse(`directory ${name}`, [{ definition: withLibrary(probe().definition, { ...DECLARATION, store_name: name }), trust: { level: "host" } }], /不是库|没有登记/);
    }
    assert.equal(homeStores().get("unlisted"), undefined);
    await refuse("not registered", [{ definition: withLibrary(probe().definition, { ...DECLARATION, store_name: "unlisted" }), trust: { level: "host" } }], /没有登记/);
    await refuse("another baseline", [{ definition: withLibrary(probe().definition, { ...DECLARATION, version: 2 }), trust: { level: "host" } }], /基线不同/);
    // PART-02 (specs/plugin-project-partition): a project's plugin keeps its data in the project already; only a Home plugin's library is split by project.
    await refuse("partitioned", [{ definition: withLibrary(probe().definition, { ...DECLARATION, partition: "project" } as PluginDatabaseDeclaration), trust: { level: "host" } }], /Home 级插件/);
    for (const name of ["Dataset", "../data", "a/b", ""]) {
      await refuse(`name ${JSON.stringify(name)}`, [{ definition: withLibrary(probe().definition, { ...DECLARATION, store_name: name }), trust: { level: "host" } }], /库名|目录名/);
    }
    for (const name of [LIBRARY, "unlisted", "Dataset", "a", "data", ...libraries, ...HOME_DIRECTORIES]) {
      assert.equal(existsSync(join(directory, name)), false, `${name}: nothing was made`);
    }
  }));

test("a library at another version is refused when its plugin starts and left as it was; the other plugins on the list still start, and the same version opens again with its rows",
  withDirectory(async directory => {
    const item = platformIn(directory), declared = probe(), beside = probe({ name: "besideprobe" });
    try {
      mkdirSync(join(directory, LIBRARY));
      const older = new DatabaseSync(libraryFile(directory, LIBRARY));
      older.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL); INSERT INTO notes (text) VALUES ('older'); PRAGMA user_version = 7;");
      older.close();
      const report = await item.platform.start([{ definition: withLibrary(declared.definition, DECLARATION), trust: { level: "host" } }, { definition: beside.definition, trust: { level: "host" } }]);
      assert.deepEqual(report.running, [beside.id]);
      assert.deepEqual(report.failed.map(entry => entry.plugin_id), [declared.id]);
      assert.equal(declared.started.length, 0, "the plugin was never given the chance to start without its library");
      assert.equal(inspect(directory, LIBRARY, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 7, "nothing was upgraded in place");
      assert.deepEqual(rows(directory, LIBRARY), ["older"]);
    } finally { item.store.close(); }

    const keptLibrary = { "kept-notes": idOf("keepprobe") };
    const first = platformIn(directory, directory, keptLibrary), kept = probe({ name: "keepprobe" });
    try {
      await first.platform.start([{ definition: withLibrary(kept.definition, { ...DECLARATION, store_name: "kept-notes" }), trust: { level: "host" } }]);
      await noteInto(kept.database(), "kept");
    } finally { first.store.close(); }
    const second = platformIn(directory, directory, keptLibrary), same = probe({ name: "keepprobe" });
    try {
      await second.platform.start([{ definition: withLibrary(same.definition, { ...DECLARATION, store_name: "kept-notes" }), trust: { level: "host" } }]);
      assert.deepEqual(plain(same.database().all("SELECT text FROM notes")), [{ text: "kept" }], "the same version opens the library again with its rows");
    } finally { second.store.close(); }
  }));

test("a library is the plugin's only while the plugin runs: after stop, after a restart (for the handle kept from before) and after uninstall every call is refused and does nothing (BL-411), the stop hook cannot write once the stop has begun, and the library stays when the plugin goes",
  withDirectory(async directory => {
    const stopWrites: string[] = [], logged: HostLogEntry[] = [], restore = captureHostLog(logged);
    const plugin = probe({ name: "lifeprobe", onStop: async database => {
      try { await noteInto(database!, "from the stop hook"); stopWrites.push("written"); }
      catch (error) { stopWrites.push((error as { code?: string }).code ?? "?"); }
    } });
    const item = platformIn(directory, directory, { [LIBRARY]: idOf("lifeprobe") });
    try {
      await item.platform.start([{ definition: withLibrary(plugin.definition, DECLARATION), trust: { level: "host" } }]);
      const first = plugin.database();
      await noteInto(first, "before");
      const installId = item.installId(plugin.id);
      await item.platform.runtime.stop(installId);
      assert.deepEqual(stopWrites, ["actions.forbidden"], "the stop revokes first, then lets the plugin's own cleanup run");
      // BL-411: a handle used outside every call once its activation stopped is refused without a throw: reads return nothing and a
      // write never settles. The Host logs the first refusal of each method; the rows below show none of the writes landed.
      assert.deepEqual([first.get("SELECT 1"), first.all("SELECT 1")], [undefined, undefined]);
      assert.equal(await within(noteInto(first, "after stop")), PENDING);

      await item.platform.runtime.start(installId);
      const second = plugin.database();
      assert.notEqual(second, first);
      assert.equal(await within(noteInto(first, "an old handle")), PENDING, "the handle of the earlier start stays dead");
      assert.deepEqual(plain(second.all("SELECT text FROM notes")), [{ text: "before" }]);

      await item.platform.runtime.stop(installId);
      await item.platform.runtime.uninstall(installId);
      assert.equal(await within(noteInto(second, "uninstalled")), PENDING);
      assert.deepEqual(rows(directory, LIBRARY), ["before"], "uninstalling removes the plugin's key-value data, not its library; the purge is the person's own choice");
      const refused = logged.filter(entry => entry.event === "stopped_service_call").map(entry => entry.fields);
      assert.ok(refused.every(fields => fields?.plugin_id === plugin.id && fields.install_id === installId));
      assert.deepEqual([...new Set(refused.map(fields => `${String(fields?.service)}.${String(fields?.method)}`))].sort(),
        ["database.all", "database.get", "database.transaction"], "every call after the stop was refused, the stop hook's own write is not among them");
    } finally { restore(); item.store.close(); }
  }));

// W4-11: each shipped plugin's library is registered to that plugin, so only it (or the Runtime plugin that replaces it under
// the same id) is given it; the refusals above show every other owner's library is refused to anyone else.
test("RAC-302 every shipped plugin's Home library is registered to that plugin, at the baseline its Manifest declares (databases.home), and a catalog entry's home_store never carries a library of its own", () => {
  const shipped = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    const library = entry.manifest.databases?.home;
    assert.equal(entry.home_store?.library, undefined, `${entry.project_plugin_id}: its library is the Manifest's, written once`);
    return [
      ...entry.home_store ? [{ path: entry.home_store.path, owner: entry.manifest.plugin_id, baseline: undefined }] : [],
      ...library ? [{ path: library.store_name, owner: entry.manifest.plugin_id, baseline: library }] : []];
  });
  assert.deepEqual(shipped.map(store => store.path).sort(), ["artifacts", "cognia", "dataset", "form", "goals", "images", "issues", "jelly", "lingguang", "pages", "ppt", "shelf", "todo", "workflows"]);
  for (const { path, owner, baseline } of shipped) {
    const store = homeStores().get(path);
    assert.equal(store?.owner, owner, path);
    assert.equal(store?.library?.baseline.version, baseline?.version, path);
    assert.equal(store?.library?.baseline.schema, baseline?.schema, path);
  }
});

test("the library needs the grants the entry's declaration names: without storage:private the plugin does not start, without the read or the write permission every call of that kind is refused, with them it works",
  withDirectory(async directory => {
    const all = [STORAGE.permission, READ.permission, WRITE.permission];
    const optionalStorage = platformIn(directory, directory, { [LIBRARY]: idOf("nostorage") }), unstorable = probe({ name: "nostorage", permissions: [{ ...STORAGE, required: false }, READ, WRITE] });
    try {
      const refused = await optionalStorage.platform.start([{ definition: withLibrary(unstorable.definition, DECLARATION) }]);
      assert.deepEqual(refused.running, []);
      assert.deepEqual(refused.failed.map(entry => entry.code), ["plugin.grant_denied"]);
      assert.equal(unstorable.started.length, 0, "the plugin was never given the chance to start without its library");
    } finally { optionalStorage.store.close(); }

    const narrow = platformIn(directory, directory, { [LIBRARY]: idOf("heldback") }), held = probe({ name: "heldback", permissions: [STORAGE, { ...READ, required: false }, { ...WRITE, required: false }] });
    try {
      assert.deepEqual((await narrow.platform.start([{ definition: withLibrary(held.definition, DECLARATION) }])).running, [held.id], "the required permission is enough to start");
      const database = held.database();
      assert.throws(() => database.get("SELECT 1"), { code: "plugin.grant_denied" });
      assert.throws(() => database.all("SELECT 1"), { code: "plugin.grant_denied" });
      await assert.rejects(noteInto(database, "held back"), { code: "plugin.grant_denied" });
      assert.deepEqual(rows(directory, LIBRARY), [], "the write that was refused left nothing");
    } finally { narrow.store.close(); }

    const granted = platformIn(directory, directory, { [LIBRARY]: idOf("grantedprobe") }), again = probe({ name: "grantedprobe", permissions: [STORAGE, { ...READ, required: false }, { ...WRITE, required: false }] });
    try {
      assert.deepEqual((await granted.platform.start([{ definition: withLibrary(again.definition, DECLARATION), grants: all }])).running, [again.id]);
      await noteInto(again.database(), "granted");
      assert.deepEqual(plain(again.database().all("SELECT text FROM notes")), [{ text: "granted" }]);
    } finally { granted.store.close(); }
  }));

test("the upgrade preflight is read-only: it is given no database", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe({ version: "1.0.0" });
  try {
    await item.platform.start([{ definition: withLibrary(plugin.definition, DECLARATION), trust: { level: "host" } }]);
    const next = probe({ version: "1.1.0" });
    await item.platform.runtime.upgrade({ install_id: item.installId(plugin.id), definition: next.definition,
      grants: [STORAGE.permission, READ.permission, WRITE.permission] });
    assert.equal(next.preflight.length, 1, "the new version's preflight ran");
    for (const services of next.preflight) assert.equal((services as Record<string, unknown> | undefined)?.database, undefined);
  } finally { item.store.close(); }
}));

const asUser = (projectId: string): ActionCallContext => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [] });

test("production path: a fixture the Host is given with a declaration reaches its Home library from an action called through the Host's action client, in every project's own platform, and the library is the Home's, not one project's",
  withDirectory(async directory => {
    const home = mkdtempSync(join(directory, "home-"));
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const references = [];
    for (const name of ["甲", "乙"]) {
      const created = await catalog.createProject({ display_name: name, actor_id: "web-user" });
      references.push(molisWorkHostProjectReference({ databasePath: created.database_path, projectId: created.project_id }));
    }
    catalog.close();
    const plugin = probe({ name: "hostprobe" }), undeclared = probe({ name: "hostplain" });
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
      pluginFixtures: { project: [{ definition: withLibrary(plugin.definition, DECLARATION) }, undeclared.definition] } });
    try {
      const [a, b] = references as [typeof references[number], typeof references[number]];
      assert.equal(await host.actionClient(a).invoke(asUser(a.project_id), plugin.note, { text: "从甲写入" }), "stored");
      assert.equal(await host.actionClient(b).invoke(asUser(b.project_id), plugin.note, { text: "从乙写入" }), "stored");
      assert.deepEqual(rows(home, LIBRARY), ["从甲写入", "从乙写入"], "one library of the Home, written from two projects");
      assert.equal(await host.actionClient(a).invoke(asUser(a.project_id), plugin.count, {}), 2, "and read from either");
      assert.equal(await host.actionClient(b).invoke(asUser(b.project_id), plugin.count, {}), 2);
      assert.equal(inspect(home, LIBRARY, db => (db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode), "wal");
      assert.ok(undeclared.started.length > 0 && undeclared.started.every(services => services?.database === undefined), "a fixture the Host gave no declaration has no library");
    } finally { await host.close(); }
    const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [{ definition: withLibrary(plugin.definition, DECLARATION) }] } });
    try {
      const [a] = references as [typeof references[number]];
      assert.equal(await reopened.actionClient(a).invoke(asUser(a.project_id), plugin.count, {}), 2, "the rows outlive the Host");
    } finally { await reopened.close(); }
  }));

test("W4-11-03 a fixture the Host is given registers its library as its own, so it cannot take one another owner registered",
  withDirectory(async directory => {
    const home = mkdtempSync(join(directory, "home-"));
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const created = await catalog.createProject({ display_name: "甲", actor_id: "web-user" });
    catalog.close();
    const reference = molisWorkHostProjectReference({ databasePath: created.database_path, projectId: created.project_id });
    const plugin = probe({ name: "hostprobe" });
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
      // Lingguang's own name and baseline (a library its owner opens only when used): only that it is another owner's can refuse it.
      pluginFixtures: { project: [{ definition: withLibrary(plugin.definition, { ...DECLARATION, ...homeStores().get("lingguang")!.library!.baseline, store_name: "lingguang" }) }] } });
    try {
      // The project's platform refuses its start list whole (the registry finds `lingguang` registered twice), so the fixture's
      // action never registers: the same answer a caller gets for any plugin that did not start.
      await assert.rejects(host.actionClient(reference).invoke(asUser(reference.project_id), plugin.note, { text: "写进灵光库" }), /能力未注册/);
      assert.equal(plugin.started.length, 0, "the fixture never started");
      assert.equal(existsSync(join(home, "lingguang")), false, "nothing of the Lingguang library was made");
    } finally { await host.close(); }
  }));
