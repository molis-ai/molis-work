import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
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
import { PERSONAL_HOME_SQLITE_STORES } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import {
  DEMO_PROJECT_ID, LocalProjectDatabase, MolisWorkLocalHost, createPluginPlatform, molisWorkHostProjectReference, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// W3-06 D: a plugin the Host runs in a project's platform can have a library in the Home, through the one service main has for
// it, `services.database`, when the Host's own start list declares one for it (`PluginPlatformEntry.database`). Nothing the
// plugin holds picks the library: not its definition, not its id, not an action argument.

const STORAGE = { permission: "storage:private", required: true, reason: "插件把自己的数据存进 Home 里它自己的库" } as const;
const READ = { permission: "dataprobe:read", required: true, reason: "读自己的库" } as const;
const WRITE = { permission: "dataprobe:write", required: true, reason: "写自己的库" } as const;
/** A library name the uninstall purge lists, so that `--purge-user-data` reaches it. The Home here is a temporary directory. */
const LIBRARY = "dataset";
const DECLARATION: PluginDatabaseDeclaration = { store_name: LIBRARY, version: 1, read_permission: READ.permission, write_permission: WRITE.permission,
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const idOf = (name: string) => `io.molis.work.example.${name}`;

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
function platformIn(directory: string, home: string | null = directory) {
  const file = join(mkdtempSync(join(directory, "board-")), "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: home === null ? null : { directory: home, completeText: () => undefined } });
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
      assert.deepEqual((await item.platform.start([{ definition: plugin.definition, bundled: true, database: DECLARATION }])).running, [plugin.id]);
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
      await item.platform.start([{ definition: plugin.definition, bundled: true, database: DECLARATION }]);
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

test("only the Host's entry gives a library: a definition listed without a declaration has none whatever its Manifest asks for, and neither has another definition that carries the same plugin id",
  withDirectory(async directory => {
    const first = platformIn(directory), declared = probe(), plain1 = probe({ name: "plainprobe" });
    try {
      assert.deepEqual((await first.platform.start([{ definition: declared.definition, bundled: true, database: DECLARATION },
        { definition: plain1.definition, bundled: true }])).running.sort(), [declared.id, plain1.id].sort());
      assert.ok(declared.started.at(-1)?.database);
      assert.equal(plain1.started.at(-1)?.database, undefined, "storage:private and the two permissions are in its Manifest, and no entry declared a library");
    } finally { first.store.close(); }
    // A developed or generated plugin can carry a built-in plugin's id; the entry belongs to the definition the Host listed.
    const second = platformIn(directory), lookalike = probe();
    try {
      assert.deepEqual((await second.platform.start([{ definition: lookalike.definition }])).running, [declared.id]);
      assert.equal(lookalike.started.at(-1)?.database, undefined);
    } finally { second.store.close(); }
  }));

test("a start list that declares a library wrongly does not start at all, and nothing of any library is made: sandboxed code, a platform that reaches no Home, a Manifest that does not list the permissions, a name used twice, plugin-runtime, a name the uninstall purge does not list, a name that is not one directory",
  withDirectory(async directory => {
    const refuse = async (label: string, entries: Parameters<ReturnType<typeof platformIn>["platform"]["start"]>[0], reason: RegExp, home: string | null = directory) => {
      const item = platformIn(directory, home);
      try {
        await assert.rejects(item.platform.start(entries), reason, label);
        assert.deepEqual(item.platform.supervisor.states(), [], `${label}: not even the plugins beside it started`);
      } finally { item.store.close(); }
    };
    const beside = probe({ name: "besideprobe" });
    await refuse("sandboxed", [{ definition: probe({ name: "sandboxed", execution: "sandbox" }).definition, grants: [STORAGE.permission, READ.permission, WRITE.permission], database: DECLARATION },
      { definition: beside.definition }], /沙箱/);
    await refuse("no Home", [{ definition: probe().definition, bundled: true, database: DECLARATION }, { definition: beside.definition }], /Home/, null);
    await refuse("permissions not listed", [{ definition: probe({ permissions: [STORAGE] }).definition, bundled: true, database: DECLARATION }, { definition: beside.definition }], /权限/);
    await refuse("twice", [{ definition: probe({ name: "first" }).definition, bundled: true, database: DECLARATION },
      { definition: probe({ name: "second" }).definition, bundled: true, database: DECLARATION }], /重复|同一个库/);
    await refuse("plugin-runtime", [{ definition: probe().definition, bundled: true, database: { ...DECLARATION, store_name: "plugin-runtime" } }], /plugin-runtime/);
    assert.equal((PERSONAL_HOME_SQLITE_STORES as readonly string[]).includes("unlisted"), false);
    await refuse("not purged", [{ definition: probe().definition, bundled: true, database: { ...DECLARATION, store_name: "unlisted" } }], /purge|清除|清单/);
    for (const name of ["Dataset", "../data", "a/b", ""]) {
      await refuse(`name ${JSON.stringify(name)}`, [{ definition: probe().definition, bundled: true, database: { ...DECLARATION, store_name: name } }], /库名|目录名/);
    }
    for (const name of [LIBRARY, "plugin-runtime", "unlisted", "Dataset", "a", "data"]) assert.equal(existsSync(join(directory, name)), false, `${name}: nothing was made`);
  }));

test("a library is the plugin's only while the plugin runs: after stop, after a restart (for the handle kept from before) and after uninstall every call is refused, the stop hook cannot write once the stop has begun, and the library stays when the plugin goes",
  withDirectory(async directory => {
    const stopWrites: string[] = [];
    const plugin = probe({ name: "lifeprobe", onStop: async database => {
      try { await noteInto(database!, "from the stop hook"); stopWrites.push("written"); }
      catch (error) { stopWrites.push((error as { code?: string }).code ?? "?"); }
    } });
    const item = platformIn(directory);
    try {
      await item.platform.start([{ definition: plugin.definition, bundled: true, database: DECLARATION }]);
      const first = plugin.database();
      await noteInto(first, "before");
      const installId = item.installId(plugin.id);
      await item.platform.runtime.stop(installId);
      assert.deepEqual(stopWrites, ["actions.forbidden"], "the stop revokes first, then lets the plugin's own cleanup run");
      for (const call of [() => first.get("SELECT 1"), () => first.all("SELECT 1"), () => noteInto(first, "after stop")]) {
        await assert.rejects(Promise.resolve().then(call), { code: "actions.plugin_unavailable" });
      }

      await item.platform.runtime.start(installId);
      const second = plugin.database();
      assert.notEqual(second, first);
      await assert.rejects(noteInto(first, "an old handle"), { code: "actions.plugin_unavailable" }, "the handle of the earlier start stays dead");
      assert.deepEqual(plain(second.all("SELECT text FROM notes")), [{ text: "before" }]);

      await item.platform.runtime.stop(installId);
      await item.platform.runtime.uninstall(installId);
      await assert.rejects(noteInto(second, "uninstalled"), { code: "actions.plugin_unavailable" });
      assert.deepEqual(rows(directory, LIBRARY), ["before"], "uninstalling removes the plugin's key-value data, not its library; the purge is the person's own choice");
    } finally { item.store.close(); }
  }));

test("the library needs the grants the entry's declaration names: without storage:private the plugin does not start, without the read or the write permission every call of that kind is refused, with them it works",
  withDirectory(async directory => {
    const all = [STORAGE.permission, READ.permission, WRITE.permission];
    const optionalStorage = platformIn(directory), unstorable = probe({ name: "nostorage", permissions: [{ ...STORAGE, required: false }, READ, WRITE] });
    try {
      const refused = await optionalStorage.platform.start([{ definition: unstorable.definition, database: DECLARATION }]);
      assert.deepEqual(refused.running, []);
      assert.deepEqual(refused.failed.map(entry => entry.code), ["plugin_grant_denied"]);
      assert.equal(unstorable.started.length, 0, "the plugin was never given the chance to start without its library");
    } finally { optionalStorage.store.close(); }

    const narrow = platformIn(directory), held = probe({ name: "heldback", permissions: [STORAGE, { ...READ, required: false }, { ...WRITE, required: false }] });
    try {
      assert.deepEqual((await narrow.platform.start([{ definition: held.definition, database: DECLARATION }])).running, [held.id], "the required permission is enough to start");
      const database = held.database();
      assert.throws(() => database.get("SELECT 1"), { code: "plugin_grant_denied" });
      assert.throws(() => database.all("SELECT 1"), { code: "plugin_grant_denied" });
      await assert.rejects(noteInto(database, "held back"), { code: "plugin_grant_denied" });
      assert.deepEqual(rows(directory, LIBRARY), [], "the write that was refused left nothing");
    } finally { narrow.store.close(); }

    const granted = platformIn(directory), again = probe({ name: "grantedprobe", permissions: [STORAGE, { ...READ, required: false }, { ...WRITE, required: false }] });
    try {
      assert.deepEqual((await granted.platform.start([{ definition: again.definition, grants: all, database: DECLARATION }])).running, [again.id]);
      await noteInto(again.database(), "granted");
      assert.deepEqual(plain(again.database().all("SELECT text FROM notes")), [{ text: "granted" }]);
    } finally { granted.store.close(); }
  }));

test("the upgrade preflight is read-only: it is given no database", withDirectory(async directory => {
  const item = platformIn(directory), plugin = probe({ version: "1.0.0" });
  try {
    await item.platform.start([{ definition: plugin.definition, bundled: true, database: DECLARATION }]);
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
      pluginFixtures: { project: [{ definition: plugin.definition, database: DECLARATION }, undeclared.definition] } });
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
    const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [{ definition: plugin.definition, database: DECLARATION }] } });
    try {
      const [a] = references as [typeof references[number]];
      assert.equal(await reopened.actionClient(a).invoke(asUser(a.project_id), plugin.count, {}), 2, "the rows outlive the Host");
    } finally { await reopened.close(); }
  }));
