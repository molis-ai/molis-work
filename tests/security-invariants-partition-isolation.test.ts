import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  ensureProjectPlugins, LocalProjectDatabase, MolisWorkLocalHost, openHomePluginStore, openPartitionPluginLibrary, openProjectVersionStores,
  PartitionPlatformServices, PartitionPluginAssembly, partitionOverviewLibraries, partitionPluginScope, releaseProjectPlugins, startPartitionPluginInstance,
  type PartitionPluginScope,
} from "@molis-ai/molis-work-app-local-host";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, OVERVIEW_TABLE_SQL, type PluginDatabaseDeclaration, type PluginDefinition, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PartitionDeclarationFields } from "@molis-ai/molis-work-plugin-sdk";
import { overviewRows, partitionDeclarationProblems } from "@molis-ai/molis-work-plugin-sdk";
import { DueTimer, openDueRegistry } from "@molis-ai/molis-work-service-scheduler";

const PLUGIN = "com.example.partition-notes";
const declaration: PluginDatabaseDeclaration = { store_name: "notes", version: 1, schema: "CREATE TABLE notes (note_id TEXT PRIMARY KEY, partition_id TEXT NOT NULL);",
  read_permission: "notes:read", write_permission: "notes:write" };
const record = { install_id: "partition-notes-install" } as PluginInstanceRecord;

async function withPartitions<T>(run: (home: string, a: string, b: string) => Promise<T>): Promise<T> {
  const home = await realpath(await mkdtemp(join(tmpdir(), "molis-work-partition-isolation-")));
  try {
    const [a, b] = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => [
      (await catalog.createProject({ display_name: "项目 A", actor_id: "local-person" })).project_id,
      (await catalog.createProject({ display_name: "项目 B", actor_id: "local-person" })).project_id,
    ]);
    return await run(home, a, b);
  } finally { await rm(home, { recursive: true, force: true }); }
}

const forbidden = { code: "actions.forbidden" };
const unavailable = { code: "actions.plugin_unavailable" };

test("UPP-06 S-partition-isolation each (plugin, partition) instance reaches only its own partition's library and files; a path into another partition is refused", async () => withPartitions(async (home, a, b) => {
  const opened = new Map<string, ReturnType<typeof openPartitionPluginLibrary>>();
  const members = new Map([[PERSONAL_SPACE_PROJECT_ID, [PLUGIN]], [a, [PLUGIN]], [b, [PLUGIN]]]);
  const assembly = new PartitionPluginAssembly({ home, assembled: id => id === PLUGIN, members: id => members.get(id) ?? [], installation: id => id === PLUGIN ? record : null,
    async start(scope) {
      const library = openPartitionPluginLibrary(scope, home, declaration);
      library.writer.prepare("INSERT INTO notes VALUES (?, ?)").run(`note-${scope.partition_id}`, scope.partition_id);
      opened.set(scope.partition_id, library);
      return { async stop() { library.close(); } };
    } });
  try {
    const leases = await Promise.all([PERSONAL_SPACE_PROJECT_ID, a, b].map(id => assembly.acquire(PLUGIN, id, "open")));
    for (const lease of leases) {
      const file = join(partitionRoot(home, lease.scope.partition_id), "libraries", "notes.db");
      assert.equal(lease.scope.libraryPath("notes"), file, "the library is under the partition's own root (U2)");
      const rows = opened.get(lease.scope.partition_id)!.reader.prepare("SELECT partition_id FROM notes").all().map(row => row.partition_id);
      assert.deepEqual(rows, [lease.scope.partition_id], "each partition's library holds only what its own instance wrote");
    }
    assert.equal(existsSync(join(home, "personal-space", "libraries", "notes.db")), true);
    const [, inA, inB] = leases.map(lease => lease.scope);
    assert.throws(() => inA!.assertOwnPath(inB!.libraryPath("notes")), forbidden, "A's instance is refused B's library");
    assert.throws(() => inA!.assertOwnPath(join(inB!.root, "plugin-files")), forbidden, "and B's plugin files");
    assert.throws(() => inA!.assertOwnPath(join(home, "plugin-runtime")), forbidden, "and anything of the Home above the partitions");
    assert.throws(() => inA!.assertOwnPath(join(inA!.root, "..", b, "molis-work.db")), forbidden, "a path that climbs out is resolved first");
    // A link inside A that points into B is B's, however it is spelled.
    symlinkSync(inB!.root, join(inA!.root, "to-b"));
    assert.throws(() => inA!.assertOwnPath(join(inA!.root, "to-b", "libraries", "notes.db")), forbidden);
    assert.equal(inA!.assertOwnPath(inA!.ownerFilesRoot()), join(inA!.root, "plugin-files", record.install_id));
    // A libraries directory swapped for a link into B is refused before a library is opened through it.
    const swapped: PartitionPluginScope = partitionPluginScope(home, a, "com.example.other", "other-install");
    mkdirSync(join(inA!.root, "other"), { recursive: true });
    await rm(join(inA!.root, "libraries"), { recursive: true, force: true });
    symlinkSync(join(inB!.root, "libraries"), join(inA!.root, "libraries"));
    assert.throws(() => openPartitionPluginLibrary(swapped, home, { ...declaration, store_name: "other" }), forbidden);
    assert.equal(existsSync(join(inB!.root, "libraries", "other.db")), false, "nothing was created in B");
    for (const lease of leases) lease.release();
  } finally { await assembly.close(); }
}));

test("UPP-06 S-partition-isolation a partition never runs a plugin it did not enable, one that is not installed, or one the old assemblies run", async () => withPartitions(async (home, a, b) => {
  const starts: string[] = [];
  const assembly = new PartitionPluginAssembly({ home, assembled: id => id !== "io.molis.work.old", members: id => id === a ? [PLUGIN, "com.example.uninstalled"] : [],
    installation: id => id === PLUGIN ? record : null, async start(scope) { starts.push(scope.partition_id); return { async stop() {} }; } });
  await assert.rejects(assembly.acquire(PLUGIN, b, "push"), unavailable, "B did not enable it");
  await assert.rejects(assembly.acquire(PLUGIN, PERSONAL_SPACE_PROJECT_ID, "sync"), unavailable, "nor did the personal space");
  await assert.rejects(assembly.acquire("com.example.uninstalled", a, "open"), unavailable, "enabled but not installed");
  await assert.rejects(assembly.acquire("io.molis.work.old", a, "open"), unavailable, "a plugin the old assemblies run is not started here");
  assert.deepEqual(starts, [], "no refused acquire started anything");
  (await assembly.acquire(PLUGIN, a, "due")).release();
  assert.deepEqual(starts, [a]);
  await assembly.close();
}));

test("UPP-21 one instance per (plugin, partition): started on first use, shared by concurrent uses, stopped when idle, disabled, uninstalled or its partition goes", async () => withPartitions(async (home, a, b) => {
  let now = 0;
  const events: string[] = [];
  const assembly = new PartitionPluginAssembly({ home, idleMs: 1000, now: () => now, assembled: () => true, members: () => [PLUGIN, "com.example.second"],
    installation: id => ({ install_id: `${id.split(".").pop()}-install` } as PluginInstanceRecord),
    async start(scope, reason) { events.push(`start ${scope.plugin_id} ${scope.partition_id} ${reason}`); return { async stop() { events.push(`stop ${scope.plugin_id} ${scope.partition_id}`); } }; } });
  const [first, second] = await Promise.all([assembly.acquire(PLUGIN, a, "open"), assembly.acquire(PLUGIN, a, "due")]);
  assert.equal(events.length, 1, "two uses at once start one instance");
  assert.equal(first.scope, second.scope);
  first.release(); first.release();
  now = 5000;
  assert.equal(await assembly.sweep(), 0, "an instance still in use is not idle");
  second.release();
  now = 5500;
  assert.equal(await assembly.sweep(), 0, "released less than the idle time ago");
  now = 6000;
  assert.equal(await assembly.sweep(), 1);
  assert.deepEqual(assembly.instances(), []);
  for (const [plugin, partition] of [[PLUGIN, a], [PLUGIN, b], ["com.example.second", a]] as const) (await assembly.acquire(plugin, partition, "sync")).release();
  await assembly.stopPlugin(PLUGIN, b);
  assert.deepEqual(assembly.instances().map(item => `${item.plugin_id} ${item.partition_id}`).sort(), [`${PLUGIN} ${a}`, `com.example.second ${a}`].sort(), "disabling in B stops only B's");
  await assembly.stopPartition(a);
  assert.deepEqual(assembly.instances(), [], "the partition going stops every instance in it");
  assert.equal(events.filter(event => event.startsWith("start")).length, 4);
}));

function partitionNotes(): PluginDefinition {
  return {
    manifest: { schema_version: 1, host_api_version: 1, plugin_id: PLUGIN, version: "1.0.0", name: "Partition notes", kind: "app",
      publisher: { publisher_id: "example", signature: "partition-notes" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "storage:private", required: true, reason: "分区里的笔记库" }, { permission: "notes:read", required: true, reason: "读笔记" },
        { permission: "notes:write", required: true, reason: "写笔记" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, databases: { partition: declaration } },
    async start() { return { kind: "app" }; },
  } as PluginDefinition;
}

test("UPP-06 S-partition-isolation the old project platform refuses to run a plugin with a library in each partition", async () => withPartitions(async (home, a) => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const store = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const definition = partitionNotes();
  const ports = { store, ...openProjectVersionStores(store), projectId: a, actorId: "local-person", homeDirectory: home, actions: pluginActions(store, a),
    escapeHtml: String, translate: (value: string) => value, installedByHand: new Set([definition]) };
  try {
    const { platform } = await ensureProjectPlugins(ports);
    assert.ok(platform);
    const report = await platform.start([{ definition }]);
    assert.equal(report.running.includes(PLUGIN), false, JSON.stringify(report));
    const refusedState = platform.supervisor.state(PLUGIN)!;
    assert.equal(platform.runtime.get(refusedState.install_id!)?.last_error_code, "plugin.declaration_invalid", "refused for its declaration, before any library");
    assert.equal(existsSync(join(partitionRoot(home, a), "libraries")), false, "no library was opened for it");
  } finally { await releaseProjectPlugins(store, a); store.close(); }
}));

test("UPP-06 S-partition-isolation the per-partition starter runs the plugin on its own partition's library, with the Home's one install table", async () => withPartitions(async (home, a, b) => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const store = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const definition = partitionNotes();
  const installs = openHomePluginStore(home);
  const ports = { store, ...openProjectVersionStores(store), projectId: a, actorId: "local-person", homeDirectory: home, actions: pluginActions(store, a),
    escapeHtml: String, translate: (value: string) => value, installedByHand: new Set([definition]) };
  const scope = partitionPluginScope(home, a, PLUGIN, installIdentity(definition.manifest));
  try {
    const instance = await startPartitionPluginInstance(ports, scope, { definition }, installs.db);
    try {
      const library = join(partitionRoot(home, a), "libraries", "notes.db");
      assert.equal(existsSync(library), true, "its library is A's own");
      const check = new DatabaseSync(library, { readOnly: true });
      try { assert.deepEqual(check.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map(row => row.name), ["molis_storage_space", "notes"]); }
      finally { check.close(); }
      assert.equal(existsSync(join(partitionRoot(home, b), "libraries")), false, "nothing in B");
      const installed = installs.db.prepare("SELECT install_id FROM plugin_runtime_installs").all().map(row => row.install_id);
      assert.equal(installed.length, 1, "the installation is recorded once, in the Home's install table");
      assert.equal((store.db.prepare("SELECT count(*) AS count FROM plugin_runtime_installs").get() as { count: number }).count, 0, "and not in the partition's library");
    } finally { await instance.stop(); }
    const otherInstall = partitionPluginScope(home, a, PLUGIN, "another-install");
    await assert.rejects(startPartitionPluginInstance(ports, otherInstall, { definition }, installs.db), /不一致/u, "a scope for another installation is refused before any start");
    const inB = partitionPluginScope(home, b, PLUGIN, installIdentity(definition.manifest));
    await assert.rejects(startPartitionPluginInstance(ports, inB, { definition }, installs.db), /不一致/u, "and one for another partition than the library it is given");
  } finally { installs.db.close(); store.close(); }
}));

// The overview (specs/unified-partition-plugins §6.1, `overview-readers`): read from each partition's own overview table on a read-only
// connection, only where it changed, and given to each caller only as the platform's reader rule allows.
const OVERVIEW_PLUGIN = "com.example.partition-todo";
const overviewDeclaration: PluginDatabaseDeclaration = { store_name: "todo", version: 1, schema: `CREATE TABLE todos (id TEXT PRIMARY KEY);\n${OVERVIEW_TABLE_SQL}`,
  read_permission: "todo:read", write_permission: "todo:write" };
const overviewManifest = { plugin_id: OVERVIEW_PLUGIN, databases: { partition: overviewDeclaration }, overview_projection: { kinds: ["task"] } } satisfies PartitionDeclarationFields;
const person = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", actor_kind: "user", permissions: [], project_id: null } as ActionCallContext;
const assistant = { ...person, audience: "agent", actor_kind: "runtime" } as ActionCallContext;

/** Writes A's and B's overview tables the way a plugin would: through the SDK helper, in the plugin's own transaction. */
function writeTasks(home: string, partition: string, tasks: readonly { id: string; title: string; remind_at?: string }[]) {
  const library = openPartitionPluginLibrary(partitionPluginScope(home, partition, OVERVIEW_PLUGIN, "todo-install"), home, overviewDeclaration);
  try {
    const db = library.writer;
    const tx = { get: (sql: string, values: readonly unknown[] = []) => (db.prepare(sql).get(...(values as never[])) ?? null) as never,
      all: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).all(...(values as never[])) as never,
      run: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).run(...(values as never[])), savepoint: () => { throw new Error("unused"); } };
    db.exec("BEGIN");
    for (const task of tasks) overviewRows(tx as never).upsert("task", { row_id: task.id, title: task.title, status: "open", due_at: "2026-12-01T09:00:00.000Z",
      remind_at: task.remind_at ?? null, updated_at: "2026-11-24T09:00:00.000Z" });
    db.exec("COMMIT");
  } finally { library.close(); }
}

test("UPP-06 S-partition-isolation the overview gives the person what they can read, the assistant only granted partitions and fields, and every other caller nothing", async () => withPartitions(async (home, a, b) => {
  writeTasks(home, a, [{ id: "a1", title: "A 的待办" }]);
  writeTasks(home, b, [{ id: "b1", title: "B 的待办" }]);
  const libraries = partitionOverviewLibraries(home, [a, b].map(partition_id => ({ partition_id, plugins: [{ install_id: "todo-install", manifest: overviewManifest }] })));
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("nothing is woken to read the overview"); } } });
  try {
    let grants = [{ partition_id: a, fields: ["due_at" as const] }];
    const now = () => ({ readable: [a, b], grants });
    const byPerson = services.readOverview(person, libraries, now);
    assert.deepEqual(byPerson.map(row => [row.partition_id, row.fields.title]).sort(), [[a, "A 的待办"], [b, "B 的待办"]].sort(), "the person reads A and B");
    assert.deepEqual(byPerson[0]!.install_id, "todo-install", "the installation is the platform's stamp");
    const byAssistant = services.readOverview(assistant, libraries, now);
    assert.deepEqual(byAssistant.map(row => [row.partition_id, row.fields]), [[a, { due_at: "2026-12-01T09:00:00.000Z" }]], "the assistant gets A's due date, not its title, and nothing of B");
    let calls = 0;
    const revokedInFlight = () => ({ readable: [a, b], grants: calls++ === 0 ? grants : [] });
    assert.deepEqual(services.readOverview(assistant, libraries, revokedInFlight), [], "a grant revoked while the read was under way is not delivered");
    grants = [];
    assert.deepEqual(services.readOverview(assistant, libraries, now), [], "and the next read has nothing either");
    for (const [label, caller] of [
      ["a project Agent", { ...assistant, actor_id: "agent:runtime-1", project_id: a }],
      ["an MCP client", { ...person, audience: "mcp", actor_kind: "runtime" }],
      ["a workflow", { ...person, audience: "workflow", actor_kind: "runtime" }],
      ["a plugin", { ...person, audience: "plugin", actor_kind: "runtime", plugin_install_id: "todo-install" }],
      ["a call handed on by a plugin", { ...person, delegated_by: "todo-install" }],
    ] as const) assert.throws(() => services.readOverview(caller as ActionCallContext, libraries, now), forbidden, label);
    assert.deepEqual(services.readOverview(person, libraries, () => ({ readable: [b], grants: [] })).map(row => row.partition_id), [b], "the person only what they can read now");
  } finally { services.close(); }
}));

test("UPP-34 S-partition-wake-scope a synchronized write into a dormant partition updates the overview without starting anything; a rebuild starts nothing either", async () => withPartitions(async (home, a, b) => {
  writeTasks(home, a, [{ id: "a1", title: "第一条" }]);
  writeTasks(home, b, [{ id: "b1", title: "B 的", remind_at: "2026-11-30T08:00:00.000Z" }]);
  const libraries = partitionOverviewLibraries(home, [a, b].map(partition_id => ({ partition_id, plugins: [{ install_id: "todo-install", manifest: overviewManifest }] })));
  const started: string[] = [];
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async (plugin, partition) => { started.push(`${plugin}@${partition}`); throw new Error("not in this test"); } } });
  try {
    assert.equal(services.readOverview(person, libraries, () => ({ readable: [a, b], grants: [] })).length, 2);
    assert.deepEqual(services.due.entries().map(entry => [entry.partition_id, entry.source, entry.entry_key]), [[b, "overview", "task:b1"]],
      "the reminder time read from B's table is a due entry of B: one synced in rings too");
    // Sync writes into A while it is dormant: the platform only marks it, and reads it on the next open.
    writeTasks(home, a, [{ id: "a2", title: "同步来的" }]);
    services.partitionChanged(a);
    assert.equal(services.overview.refreshDirty(libraries), 1, "only the dirty library is read");
    assert.deepEqual(services.readOverview(person, libraries, () => ({ readable: [a], grants: [] })).map(row => row.fields.title).sort(), ["同步来的", "第一条"]);
    // A rebuild (the index lost, as after a restore) reads every library again, read-only.
    services.close();
    rmSync(join(home, "search"), { recursive: true, force: true });
    const rebuilt = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("unused"); } } });
    try { assert.equal(rebuilt.readOverview(person, libraries, () => ({ readable: [a, b], grants: [] })).length, 3); } finally { rebuilt.close(); }
    assert.deepEqual(started, [], "no instance and no supervisor was started for any of it");
  } finally { try { services.close(); } catch { /* closed above */ } }
}));

test("UPP-34 the overview table: the SDK checks each row's format and its limit, the Manifest names only kinds, and the platform reads it read-only", async () => withPartitions(async (home, a) => {
  // Read the way a Manifest file is read, so a shape the contract does not have (an unknown kind, a column map) reaches the checks.
  const manifest = (fields: object): PartitionDeclarationFields => JSON.parse(JSON.stringify({ plugin_id: OVERVIEW_PLUGIN, ...fields }));
  assert.deepEqual(partitionDeclarationProblems(overviewManifest), []);
  assert.equal(partitionDeclarationProblems(manifest({ overview_projection: { kinds: ["task"] } })).length, 1, "the table lives in the plugin's own partition library");
  assert.match(partitionDeclarationProblems(manifest({ databases: { partition: overviewDeclaration }, overview_projection: { kinds: ["task"], columns: { title: "name" } } }))[0]!, /不认/u,
    "no column mapping and no SQL");
  assert.match(partitionDeclarationProblems(manifest({ databases: { partition: overviewDeclaration }, overview_projection: { kinds: ["habit"] } }))[0]!, /不是平台的总览种类/u);
  writeTasks(home, a, [{ id: "ok", title: "好的" }]);
  assert.throws(() => writeTasks(home, a, [{ id: "bad", title: "" }]), { code: "actions.input_invalid" });
  assert.throws(() => writeTasks(home, a, [{ id: "bad", title: "x", remind_at: "next tuesday" }]), { code: "actions.input_invalid" });
  const many = Array.from({ length: OVERVIEW_ROW_LIMIT }, (_, i) => ({ id: `t${i}`, title: `第 ${i} 条` }));
  assert.throws(() => writeTasks(home, a, many), { code: "actions.input_invalid" }, `a kind holds at most ${OVERVIEW_ROW_LIMIT} rows`);
  const file = join(partitionRoot(home, a), "libraries", "todo.db");
  const reader = new DatabaseSync(file, { readOnly: true });
  try { assert.throws(() => reader.exec(`DELETE FROM ${OVERVIEW_TABLE}`), /readonly/u, "the platform's connection cannot write the plugin's table"); } finally { reader.close(); }
}));

// S-partition-wake-scope for due entries (§6.1): the one due timer wakes the (plugin, partition) an entry belongs to and nothing else.
const DUE_OWNER = { install_id: "todo-install", plugin_id: "io.molis.work.todo", partition_id: "personal" };
test("UPP-34 S-partition-wake-scope the due timer wakes only the (plugin, partition) an entry belongs to", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-due-wake-"));
  let now = new Date("2026-11-24T10:00:00.000Z");
  const due = openDueRegistry(home, { now: () => now });
  const woken: string[] = [];
  const timer = new DueTimer(due, { now: () => now, wake: async entry => { woken.push(`${entry.plugin_id}@${entry.partition_id}:${entry.entry_key}`); } });
  try {
    for (let i = 0; i < 20; i += 1) due.register({ ...DUE_OWNER, partition_id: `project-${i}` }, { entry_key: "r", due_at: "2026-11-25T00:00:00.000Z" });
    due.register({ ...DUE_OWNER, partition_id: "project-b" }, { entry_key: "now", due_at: "2026-11-24T09:59:00.000Z" });
    await timer.fire();
    assert.deepEqual(woken, ["io.molis.work.todo@project-b:now"], "one of 21 partitions with entries is woken");
    now = new Date("2026-11-25T00:00:01.000Z");
    timer.arm();
    await timer.fire();
    assert.equal(woken.length, 21);
  } finally { timer.close(); due.close(); await rm(home, { recursive: true, force: true }); }
});
