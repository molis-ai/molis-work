import type { OverviewReadResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  ATTENTION_OVERVIEW_SOURCE, attentionOverviewLibrary, createPluginPlatform, ensureProjectPlugins, existingPartitionPluginHost, HomeConsentLedger, homeStores, LocalProjectDatabase,
  mainOverviewLibrary, MolisWorkLocalHost, openHomePluginStore, openPartitionPluginLibrary, openProjectVersionStores, overviewRowsFor, partitionChanged, PartitionPlatformServices,
  PartitionPluginAssembly, partitionOverviewLibraries, partitionPluginScope, pluginInstallRecords, projectPluginPlatform, refreshRunningProjectPlugins, releaseProjectPlugins,
  runningProjectPluginState, startPartitionPluginInstance, type PartitionPluginScope,
} from "@molis-ai/molis-work-app-local-host";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { inDirectoryPass } from "@molis-ai/molis-work-kernel";
import { createPluginRuntimeReleaseArtifact, installIdentity, pluginManifestDigest, SqlitePluginPrivateStorage, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { openOverviewIndex } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";
import { person as runtimePerson, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
import { DATASET_ACTION_PERMISSIONS, datasetActions } from "@molis-ai/molis-work-plugin-dataset";
import { imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { TODO_ACTION_PERMISSIONS, todoActions, todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { ActionError, LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, OVERVIEW_TABLE_SQL, pluginErrors, type PartitionPluginDatabaseDeclaration, type PluginDatabaseDeclaration, type PluginDefinition, type PluginInstanceRecord, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PartitionDeclarationFields } from "@molis-ai/molis-work-plugin-sdk";
import { bindActionHandler, defineSettingsActions, overviewRows, partitionDeclarationProblems } from "@molis-ai/molis-work-plugin-sdk";
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
  const assembly = new PartitionPluginAssembly({ home, library: id => id === PLUGIN ? "notes" : null, members: id => members.get(id) ?? [], installation: id => id === PLUGIN ? record : null,
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
  const assembly = new PartitionPluginAssembly({ home, library: id => id === "io.molis.work.old" ? null : id.split(".").pop()!, members: id => id === a ? [PLUGIN, "com.example.uninstalled"] : [],
    installation: id => id === PLUGIN ? record : null, async start(scope) { starts.push(scope.partition_id); return { async stop() {} }; } });
  await assert.rejects(assembly.acquire(PLUGIN, b, "push"), unavailable, "B did not enable it");
  await assert.rejects(assembly.acquire(PLUGIN, PERSONAL_SPACE_PROJECT_ID, "sync"), unavailable, "nor did the personal space");
  await assert.rejects(assembly.acquire("com.example.uninstalled", a, "open"), unavailable, "enabled but not installed");
  await assert.rejects(assembly.acquire("io.molis.work.old", a, "open"), unavailable, "a plugin the old assemblies run is not started here");
  assert.deepEqual(starts, [], "no refused acquire started anything");
  (await assembly.acquire(PLUGIN, a, "due")).release();
  const twinStarts: string[] = [];
  const twins = new PartitionPluginAssembly({ home, library: () => "todo", members: () => [PLUGIN, "com.example.lookalike"], installation: () => record,
    async start(scope) { twinStarts.push(scope.plugin_id); return { async stop() {} }; } });
  for (const plugin of [PLUGIN, "com.example.lookalike"]) {
    await assert.rejects(twins.acquire(plugin, a, "open"), { code: "actions.forbidden" }, `${plugin}: two plugins here declare one library name`);
  }
  assert.deepEqual(twinStarts, [], "neither is started, so neither opens the other's library");
  assert.deepEqual(starts, [a]);
  await assembly.close();
}));

test("UPP-21 one instance per (plugin, partition): started on first use, shared by concurrent uses, stopped when idle, disabled, uninstalled or its partition goes", async () => withPartitions(async (home, a, b) => {
  let now = 0;
  const events: string[] = [], told: string[] = [];
  const assembly = new PartitionPluginAssembly({ home, idleMs: 1000, now: () => now, library: id => id.split(".").pop()!, members: () => [PLUGIN, "com.example.second"],
    lifecycle: event => told.push(`${event.stage} ${event.scope.plugin_id} ${event.scope.partition_id} ${event.reason} ${event.outcome}`),
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
  // Each start and stop is told with why, for the work records (batch 108).
  assert.deepEqual(told.slice(0, 6), [`start ${PLUGIN} ${a} open succeeded`, `stop ${PLUGIN} ${a} idle succeeded`, `start ${PLUGIN} ${a} sync succeeded`,
    `start ${PLUGIN} ${b} sync succeeded`, `start com.example.second ${a} sync succeeded`, `stop ${PLUGIN} ${b} plugin succeeded`]);
  assert.deepEqual(told.slice(6).sort(), [`stop ${PLUGIN} ${a} partition succeeded`, `stop com.example.second ${a} partition succeeded`].sort());
}));

test("UPP-21 a use waiting for an instance that is stopped while it starts gets no lease on it", async () => withPartitions(async (home, a) => {
  let started!: () => void;
  const stopped: string[] = [];
  const assembly = new PartitionPluginAssembly({ home, library: () => "notes", members: () => [PLUGIN], installation: () => record,
    start: scope => new Promise<{ stop(): Promise<void> }>(resolve => { started = () => resolve({ async stop() { stopped.push(scope.partition_id); } }); }) });
  const waiting = assembly.acquire(PLUGIN, a, "open");
  await new Promise(resolve => setImmediate(resolve));
  const stopping = assembly.stopPlugin(PLUGIN, a);
  started();
  await stopping;
  await assert.rejects(waiting, unavailable, "the plugin was disabled there while it started");
  assert.deepEqual(stopped, [a]);
  assert.deepEqual(assembly.instances(), []);
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

// Batch 107: the Host runs the six plugins with a library in each partition as one instance per (plugin, partition). The partition is the one
// the instance runs for, never one a call names (S-31), and a deleted project's library does not come back from a call begun before (S-18, S-52).
test("UPP-06 S-partition-isolation the old project platform refuses to run a plugin with a library in each partition", async () => withPartitions(async (home, a) => {
  // Since batch 107 such a plugin is the per-partition assembly's (above); handed to a project platform anyway, the platform itself refuses it.
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
    // Opening the partition starts its built-in per-partition plugins with their libraries; this one has none there.
    assert.equal(existsSync(partitionLibraryFile(home, a, declaration.store_name)), false, "no library was opened for it");
  } finally { await releaseProjectPlugins(store, a); store.close(); }
}));

test("UPP-06 S-31 S-partition-isolation the project platform gives a plugin with a library in each partition the library of the project it runs in; a call naming another project or none is refused and makes no library", async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("分区 A", ["dataset"]), b = await f.project("分区 B", ["dataset"]);
  const caller = runtimePerson(DATASET_ACTION_PERMISSIONS, a.project_id), inA = f.host.actionClient(a.reference);
  await inA.invoke(caller, datasetActions.create, { title: "A 的表" });
  const aLibrary = partitionLibraryFile(f.home, a.project_id, "dataset"), bLibrary = partitionLibraryFile(f.home, b.project_id, "dataset");
  assert.equal(existsSync(aLibrary), true, "A's table is in A's own library");
  const before = existsSync(bLibrary);
  await assert.rejects(inA.invoke({ ...caller, project_id: b.project_id }, datasetActions.create, { title: "写进 B" }), { code: "actions.scope_mismatch" },
    "A's instance never takes the partition from the call");
  await assert.rejects(f.host.homeActionClient().invoke({ ...caller, project_id: null }, datasetActions.create, { title: "不在任何项目" }), { code: "actions.scope_mismatch" },
    "a call in no project reaches no project's instance");
  assert.equal(existsSync(bLibrary), before, "B's library was not made by A's call");
  if (before) assert.deepEqual((await f.host.actionClient(b.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, b.project_id), datasetActions.list, {}) as { datasets: unknown[] }).datasets, [], "and holds nothing of A's");
  assert.equal(existsSync(join(f.home, "dataset")), false, "nor a library in the Home");
  assert.equal(existsSync(partitionLibraryFile(f.home, PERSONAL_SPACE_PROJECT_ID, "dataset")), false, "nor in the personal space");
});

test("UPP-06 S-18 S-52 deleting a project stops its plugin's instance and removes the partition library; a write begun before the deletion is refused and makes no library again", async t => {
  const entered = Promise.withResolvers<void>();
  const f = await serveHomeRuntime(t, { completeText: async (_prompt, options) => {
    entered.resolve();
    // The model answers only once the call is given up: the deletion stops the instance it runs on.
    await new Promise<void>(resolve => { if (options?.signal?.aborted) resolve(); else options?.signal?.addEventListener("abort", () => resolve(), { once: true }); });
    return "截止日期";
  } });
  const gone = await f.project("要删的项目", ["dataset"]), kept = await f.project("留下的项目", ["dataset"]);
  const client = f.host.actionClient(gone.reference), caller = runtimePerson(DATASET_ACTION_PERMISSIONS, gone.project_id);
  const { dataset } = await client.invoke(caller, datasetActions.create, {}) as { dataset: { id: string } };
  await f.host.actionClient(kept.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, kept.project_id), datasetActions.create, { title: "留下" });
  const library = partitionLibraryFile(f.home, gone.project_id, "dataset");
  assert.equal(existsSync(library), true);
  const refused = assert.rejects(client.invoke(caller, datasetActions.generateAi, { id: dataset.id, prompt: "计划截止日期" }), (error: { code?: string; name?: string }) =>
    error.name === "AbortError" || /^(?:actions\.(?:cancelled|missing|host_closed)|host\.project_closing)$/u.test(error.code ?? ""));
  await entered.promise;
  const response = await f.request(`/api/settings/projects/${gone.project_id}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: "upp06-delete" } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(((await response.json()) as { deletion: { cleanup_state: string } }).deletion.cleanup_state, "complete");
  await refused;
  for (const suffix of ["", "-journal", "-wal", "-shm"]) assert.equal(existsSync(library + suffix), false, `the deleted project's library${suffix} is gone and the call begun before made none again`);
  assert.equal(existsSync(partitionLibraryFile(f.home, kept.project_id, "dataset")), true, "the other project's library stays");
});

test("UPP-06 S-partition-isolation the per-partition starter runs the plugin on its own partition's library, with the Home's one install table", async () => withPartitions(async (home, a, b) => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const store = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const definition = partitionNotes();
  const installs = openHomePluginStore(home);
  const ports = { store, ...openProjectVersionStores(store), projectId: a, actorId: "local-person", homeDirectory: home, actions: pluginActions(store, a),
    escapeHtml: String, translate: (value: string) => value, installedByHand: new Set([definition]) };
  const scope = partitionPluginScope(home, a, PLUGIN, installIdentity(definition.manifest));
  try {
    // With a release package, so the start keeps one: it goes to the Home's install table with the installation, never the partition's.
    const instance = await startPartitionPluginInstance(ports, scope, { definition, releaseArtifact: { capture: () => "export {};", restore: () => definition } }, installs.db);
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
      const releases = (db: { prepare(sql: string): { get(): unknown } }) => (db.prepare("SELECT count(*) AS count FROM plugin_runtime_release_artifacts").get() as { count: number }).count;
      assert.equal(releases(installs.db), 1, "its release package is kept with the installation, in the Home");
      assert.equal(releases(store.db), 0, "and not in the partition's library");
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
const assistant = { ...person, audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:work-1" } as ActionCallContext;

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

test("UPP-34 a row written past the SDK is left out of the overview; the plugin's other rows still show and still ring", async () => withPartitions(async (home, a) => {
  writeTasks(home, a, [{ id: "a1", title: "A 的待办", remind_at: "2026-12-01T08:00:00.000Z" }]);
  const library = openPartitionPluginLibrary(partitionPluginScope(home, a, OVERVIEW_PLUGIN, "todo-install"), home, overviewDeclaration);
  try {
    const insert = library.writer.prepare(`INSERT INTO ${OVERVIEW_TABLE} (kind, row_id, title, status, tags_json, remind_at, updated_at) VALUES ('task', ?, '坏行', 'open', ?, ?, '2026-11-24T09:00:00.000Z')`);
    insert.run("bad-tags", "{", null);
    insert.run("bad-time", null, "2026-11-30 08:00");
  } finally { library.close(); }
  const libraries = partitionOverviewLibraries(home, [{ partition_id: a, plugins: [{ install_id: "todo-install", manifest: overviewManifest }] }]);
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("nothing is woken to read the overview"); } } });
  try {
    const rows = services.readOverview(person, libraries, () => ({ readable: [a], grants: [] }));
    assert.deepEqual(rows.map(row => row.row_id), ["a1"], "the two malformed rows are left out, and reading does not fail");
    assert.deepEqual(services.due.entries().map(entry => [entry.entry_key, entry.due_at]), [["task:a1", "2026-12-01T08:00:00.000Z"]], "and a1 still rings");
  } finally { services.close(); }
}));

test("UPP-06 S-partition-isolation the overview does not read a library that a link in one partition leads into another", async () => withPartitions(async (home, a, b) => {
  writeTasks(home, b, [{ id: "b1", title: "B 的待办" }]);
  rmSync(join(partitionRoot(home, a), "libraries"), { recursive: true, force: true });
  symlinkSync(join(partitionRoot(home, b), "libraries"), join(partitionRoot(home, a), "libraries"));
  const libraries = partitionOverviewLibraries(home, [a, b].map(partition_id => ({ partition_id, plugins: [{ install_id: "todo-install", manifest: overviewManifest }] })));
  assert.deepEqual(libraries.map(library => library.partition_id), [b], "A's link into B is not read as A's, so B's rows are never stamped A's");
}));

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

/** Waits for a condition the Host reaches on its own (a timer firing), reading it again every 50 ms; fails after `ms`. */
async function until(what: string, ready: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) assert.fail(`timed out waiting: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// Batch 108 item 2 ④: the same rule on the real Host with the real plugins. Todo's reminder (read from its overview table into the due
// registry) and Images' generation deadline (its own due entry) fall due while every partition sleeps; each wakes only its own (plugin,
// partition), opening that partition and no other. Jelly's events join this case when Jelly moves to partitions.
test("UPP-34 S-partition-wake-scope batch 108 on the Host: a Todo reminder and an Images deadline that fall due wake only their own (plugin, partition); the rest stay asleep", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("提醒 A", ["todo", "images"]), b = await f.project("提醒 B", ["todo", "images"]), c = await f.project("提醒 C", ["todo", "images"]);
  const host = existingPartitionPluginHost(f.home), services = host?.services;
  assert.ok(host && services, "the Host started the partition services");
  const soon = new Date(Date.now() + 3_000).toISOString(), later = new Date(Date.now() + 86_400_000).toISOString();
  const remind = (p: typeof a, title: string, at: string) => f.host.actionClient(p.reference).invoke(runtimePerson(TODO_ACTION_PERMISSIONS, p.project_id), todoActions.create, { title, remind_at: at });
  await remind(a, "A 到点", soon);
  await remind(b, "B 明天", later);
  await remind(c, "C 明天", later);
  await until("the reminders are in the due registry", () => [a, b, c].every(p => services.due.entries(p.project_id).length === 1));
  const imagesInstall = installIdentity(imagesManifest);
  const deadline = (p: typeof a, key: string, at: string) => services.registerDue({ install_id: imagesInstall, plugin_id: imagesManifest.plugin_id, partition_id: p.project_id }, { entry_key: key, due_at: at });
  deadline(b, "job:probe", soon);
  deadline(a, "job:later", later);
  deadline(c, "job:later", later);
  // Every project closes and every instance stops before the time comes: the partitions sleep.
  for (const p of [a, b, c]) await f.host.closeProject(p.reference);
  await host.assembly.stopPlugin(todoManifest.plugin_id);
  await host.assembly.stopPlugin(imagesManifest.plugin_id);
  assert.deepEqual(host.assembly.instances(), [], "no instance runs before the time");
  assert.deepEqual(f.host.projects(), [], "and no project is open");

  const fallen = (p: typeof a, plugin: string) => services.due.entries(p.project_id).filter(entry => entry.plugin_id === plugin && Date.parse(entry.due_at) <= Date.parse(soon));
  await until("both fallen-due entries are settled", () => fallen(a, todoManifest.plugin_id).length === 0 && fallen(b, imagesManifest.plugin_id).length === 0);
  assert.deepEqual(host.assembly.instances().map(item => `${item.plugin_id}@${item.partition_id}`).sort(),
    [`${imagesManifest.plugin_id}@${b.project_id}`, `${todoManifest.plugin_id}@${a.project_id}`].sort(),
    "Todo wakes in A and Images in B; Todo in B, Images in A, C and the personal space stay asleep");
  assert.deepEqual(f.host.projects().map(project => project.project_id).sort(), [a.project_id, b.project_id].sort(), "only the woken partitions are opened; C stays closed");
  assert.deepEqual(services.due.entries(c.project_id).map(entry => entry.due_at), [later, later], "C's entries still wait");
  assert.deepEqual(services.due.entries(b.project_id).filter(entry => entry.plugin_id === todoManifest.plugin_id).map(entry => entry.due_at), [later], "B's reminder still waits");
  assert.deepEqual(services.due.entries(a.project_id).filter(entry => entry.plugin_id === imagesManifest.plugin_id).map(entry => entry.entry_key), ["job:later"]);
});

// Batch 107-1: the Host's per-partition assembly (`partition-plugin-host.ts`). A plugin with a library in each partition no longer runs on the
// project platform: each partition it is enabled in has its own instance, with the installation in the Home's install table and its lifecycle
// kept by that instance alone (in memory, per (install, partition)).
const DATASET = "io.molis.work.dataset";

test("UPP-21 BFP-06 each partition sees its current plugin state while one crashing leaves the other instance and the Home installation as they were", async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("分区 A", ["dataset"]), b = await f.project("分区 B", ["dataset"]);
  for (const p of [a, b]) await f.host.actionClient(p.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, p.project_id), datasetActions.create, { title: p.project_id });
  const stateOf = (p: typeof a) => f.host.withProject(p.reference, runtime => runningProjectPluginState(runtime.store, p.project_id));
  const inA = await stateOf(a), inB = await stateOf(b);
  assert.ok(inA && inB);
  assert.equal(inA.platform?.supervisor.state(DATASET) ?? null, null, "the project platform does not run it");
  const own = projectPluginPlatform(inA, DATASET), other = projectPluginPlatform(inB, DATASET);
  assert.ok(own && other && own !== other && own !== inA.platform, "each partition runs its own instance");
  assert.equal(own.supervisor.state(DATASET)?.status, "running");
  assert.deepEqual(existingPartitionPluginHost(f.home)?.assembly.instances().filter(item => item.plugin_id === DATASET).map(item => item.partition_id).sort(),
    [a.project_id, b.project_id].sort());
  const installId = own.supervisor.state(DATASET)!.install_id!;
  const installs = openHomePluginStore(f.home);
  t.after(() => installs.db.close());
  const homeRows = new SqlitePluginRuntimeRepository(installs.db);
  await f.host.withProject(a.reference, runtime => {
    const records = pluginInstallRecords(runtime.store.db);
    inDirectoryPass(() => {
      assert.equal(records.get(installId)?.state, "running");
      assert.equal(records.list().find(record => record.install_id === installId)?.state, "running");
      own.installRecords.save({ ...own.runtime.get(installId), state: "crashed", recovery_count: 1, last_error_code: "plugin.crashed" });
      assert.equal(records.get(installId)?.state, "crashed");
      assert.equal(records.list().find(record => record.install_id === installId)?.state, "crashed");
    });
  });
  assert.equal(own.runtime.get(installId)?.state, "crashed");
  assert.equal(other.runtime.get(installId)?.state, "running", "B's instance is still running");
  // Every other reader of a partition's records (the person's authority over its actions included) reads that partition's instance.
  assert.equal(await f.host.withProject(b.reference, runtime => pluginInstallRecords(runtime.store.db).get(installId)?.state), "running");
  assert.equal(await f.host.withProject(a.reference, runtime => pluginInstallRecords(runtime.store.db).get(installId)?.state), "crashed");
  // The crash was only written down here: A's instance is put back as running, so it stops as usual when the Home closes.
  own.installRecords.save({ ...own.runtime.get(installId), state: "running", recovery_count: 0, last_error_code: null });
  const facts = homeRows.get(installId);
  assert.equal(facts?.state, "installed", "the Home row keeps what the installation is, not any partition's lifecycle");
  assert.equal(facts?.recovery_count, 0);
  assert.equal(facts?.last_error_code, null);
  // The Home plugin store's connection and the instances' each read the row as it is now: a write through one is the next read through the other.
  homeRows.save({ ...facts!, grants: [...facts!.grants, "extra:probe"] });
  assert.ok(own.runtime.get(installId).grants.includes("extra:probe"), "an instance reads what the Home store wrote");
  assert.ok(other.runtime.get(installId).grants.includes("extra:probe"));
  const current = other.runtime.get(installId)!;
  other.installRecords.save({ ...current, grants: current.grants.filter(grant => grant !== "extra:probe") });
  assert.equal(homeRows.get(installId)?.grants.includes("extra:probe"), false, "and the Home store reads what an instance wrote");
  assert.equal(own.runtime.get(installId).grants.includes("extra:probe"), false);
  assert.equal(f.host.homePlugins?.installations().some(record => record.plugin_id === DATASET), false, "it is not listed as a Home plugin");
});

test("UPP-21 batch 107 taking a plugin out of a partition stops its instance there and drops its due entries there; the other partition keeps both", async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("分区 A", ["dataset"]), b = await f.project("分区 B", ["dataset"]);
  for (const p of [a, b]) await f.host.actionClient(p.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, p.project_id), datasetActions.create, { title: p.project_id });
  const host = existingPartitionPluginHost(f.home), services = host?.services;
  assert.ok(host && services, "the Host started the partition services");
  const installId = installIdentity((await import("@molis-ai/molis-work-plugin-dataset")).datasetManifest);
  const future = new Date(Date.now() + 3_600_000).toISOString();
  for (const p of [a, b]) services.registerDue({ install_id: installId, plugin_id: DATASET, partition_id: p.project_id }, { entry_key: "k", due_at: future });
  const catalog = f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog);
  await catalog.withCatalog({ homeDirectory: f.home }, value => value.commit(() => value.removeProjectPlugin({ project_id: a.project_id, plugin_id: "dataset", actor_id: "test" })));
  const unfinished = await f.host.withProject(a.reference, runtime => refreshRunningProjectPlugins(runtime.store, a.project_id));
  assert.deepEqual(unfinished?.filter(item => item.plugin_id === DATASET), []);
  assert.deepEqual(host.assembly.instances().filter(item => item.plugin_id === DATASET).map(item => item.partition_id), [b.project_id], "only A's instance stopped");
  const due = openDueRegistry(f.home);
  try {
    assert.deepEqual(due.entries().filter(entry => entry.install_id === installId).map(entry => entry.partition_id), [b.project_id], "A's due entry went with it, B's stays");
  } finally { due.close(); }
  await assert.rejects(f.host.actionClient(a.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, a.project_id), datasetActions.list, {}));
});

test("UPP-21 batch 107 an instance read as enabled and switched off before it starts never starts; a new instance waits for the old one to finish stopping", async () => withPartitions(async (home, a) => {
  // A use that read the membership before a stop reads it again: the plugin was switched off there in between.
  let enabled = true, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const starts: string[] = [];
  const assembly = new PartitionPluginAssembly({ home, library: () => "notes", installation: () => record,
    members: async () => { const answer = enabled ? [PLUGIN] : []; await gate; return answer; },
    async start(scope) { starts.push(scope.partition_id); return { async stop() {} }; } });
  const waiting = assembly.acquire(PLUGIN, a, "open");
  await new Promise(resolve => setImmediate(resolve));
  enabled = false;
  await assembly.stopPlugin(PLUGIN, a);
  release();
  await assert.rejects(waiting, unavailable, "it was switched off after the first reading");
  assert.deepEqual(starts, [], "and nothing started");
  await assembly.close();

  // The next instance of the same pair starts only once the stopping one has finished.
  const order: string[] = [];
  let finish!: () => void;
  const stopped = new Promise<void>(resolve => { finish = resolve; });
  let count = 0;
  const twice = new PartitionPluginAssembly({ home, library: () => "notes", installation: () => record, members: () => [PLUGIN],
    async start() { const n = ++count; order.push(`start ${n}`); return { async stop() { order.push(`stopping ${n}`); if (n === 1) await stopped; order.push(`stopped ${n}`); } }; } });
  (await twice.acquire(PLUGIN, a, "open")).release();
  const stopping = twice.stopPlugin(PLUGIN, a);
  const again = twice.acquire(PLUGIN, a, "open");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["start 1", "stopping 1"], "the new instance waits");
  finish();
  await stopping;
  (await again).release();
  assert.deepEqual(order, ["start 1", "stopping 1", "stopped 1", "start 2"]);
  await twice.close();
}));

const SIGNED = "com.example.partition-signed";
const SIGNED_KEY = `ed25519:sha256:${"c".repeat(64)}`;
function signedNotes(version: "1.0.0" | "2.0.0", keys: readonly string[]): PluginDefinition {
  const action = (operation: string) => ({ capability_id: `${SIGNED}.settings.${operation}`, version: 1, title: operation, description: operation, permissions: [] });
  const { read, write } = defineSettingsActions({ scope: "project", read: action("read"), write: action("write") });
  return {
    manifest: { schema_version: 1, host_api_version: 1, plugin_id: SIGNED, version, name: "Signed partition notes", kind: "app",
      publisher: { publisher_id: "example", signature: SIGNED_KEY }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "storage:private", required: true, reason: "分区里的笔记库" }, { permission: "notes:read", required: true, reason: "读笔记" },
        { permission: "notes:write", required: true, reason: "写笔记" }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, databases: { partition: declaration },
      actions: [read, write], settings_entries: { entries: keys.map(key => ({ key, title: { key: `partition-signed.settings.${key.replace(".", "-")}` }, layers: ["project"], schema: { type: "string" } })),
        read: { capability_id: read.capability_id, version: read.version }, write: { capability_id: write.capability_id, version: write.version } },
      ...(version === "2.0.0" ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {}) },
    async start() { return { kind: "app", actions: [bindActionHandler(read, () => ({ values: [] })), bindActionHandler(write, () => ({ values: [] }))] }; },
  } as PluginDefinition;
}

test("UPP-21 batch 107 a signed package with a library in each partition installs in its partition instance and upgrades there; the old Manifest's settings are read from the Home install table", async () => withPartitions(async (home, a) => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const store = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const first = signedNotes("1.0.0", ["notes.style", "notes.width"]), next = signedNotes("2.0.0", ["notes.style"]);
  const installs = openHomePluginStore(home);
  const ports = { store, ...openProjectVersionStores(store), projectId: a, actorId: "local-person", homeDirectory: home, actions: pluginActions(store, a),
    escapeHtml: String, translate: (value: string) => value, installedByHand: new Set([first, next]) };
  const scope = partitionPluginScope(home, a, SIGNED, installIdentity(first.manifest));
  const trust = { level: "pinned" as const, publisher_key_id: SIGNED_KEY };
  try {
    const instance = await startPartitionPluginInstance(ports, scope, { definition: first, trust, grants: ["storage:private", "notes:read", "notes:write"],
      releaseArtifact: { capture: () => "export {};", restore: () => first } }, installs.db);
    try {
      assert.equal(instance.platform.supervisor.state(SIGNED)?.status, "running");
      const homeRows = new SqlitePluginRuntimeRepository(installs.db);
      assert.equal(homeRows.get(scope.install_id)?.publisher_trust, "pinned", "installed once, in the Home's install table, as the signed package it is");
      // The upgrade drops a setting the old version declared: what the old version declared is read from the Home install table, where its build is.
      const state = await instance.platform.upgrade(SIGNED, next);
      assert.equal(state?.status, "running");
      assert.equal(homeRows.get(scope.install_id)?.version, "2.0.0", "the installation is the new version");
      assert.equal(homeRows.get(scope.install_id)?.state, "installed", "and the Home row still holds no lifecycle");
      assert.equal(instance.platform.runtime.get(scope.install_id)?.state, "running", "the partition's instance runs the new version");
      assert.equal(existsSync(join(partitionRoot(home, a), "libraries", "notes.db")), true, "on A's own library");
    } finally { await instance.stop(); }
  } finally { installs.db.close(); store.close(); }
}));

test("UPP-06 S-75 ⑥ production startPartitionPluginInstance without installedByHand refuses non-host in-process plugin", async () => withPartitions(async (home, a) => {
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const store = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const definition = partitionNotes();
  const installs = openHomePluginStore(home);
  const ports = { store, ...openProjectVersionStores(store), projectId: a, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home, actions: pluginActions(store, a) };
  const scope = partitionPluginScope(home, a, PLUGIN, installIdentity(definition.manifest));
  try {
    await assert.rejects(
      startPartitionPluginInstance(ports, scope, { definition }, installs.db),
      (error: unknown) => error instanceof ActionError && error.code === "actions.plugin_unavailable"
        && (error.details as { code?: unknown } | undefined)?.code === "plugin.in_process_denied",
      "omitting installedByHand must deny non-host in-process plugins (S-75 ⑥)",
    );
    assert.equal((installs.db.prepare("SELECT count(*) AS count FROM plugin_runtime_installs").get() as { count: number }).count, 0, "no install row persisted on refusal");
    assert.equal(existsSync(join(partitionRoot(home, a), "libraries")), false, "no partition library created on refusal");
  } finally { installs.db.close(); store.close(); }
}));

test("UPP-06 UPP-21 two partitions sharing Home plugin-runtime.db isolate instance runtime state: stopping or crashing B never breaks A or skips A's stop hook", async () => withPartitions(async (home, a, b) => {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const storeA = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const storeB = new LocalProjectDatabase(partitionRoot(home, b) + "/molis-work.db");
  const installs = openHomePluginStore(home);
  const writeNoteAction: ActionDefinition<{ id: string }, { count: number; partition: string }> = {
    capability_id: "com.example.partition-notes.write",
    version: 1,
    operation: "command",
    action: {
      title: "写分区笔记", description: "在当前分区写入一条笔记", kind: "operation", scope: "project",
      audiences: ["user", "plugin"], permissions: ["notes:read", "notes:write"], subject_kinds: [],
      input_schema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
      output_schema: { type: "object", properties: { count: { type: "integer" }, partition: { type: "string" } }, required: ["count", "partition"], additionalProperties: false },
    },
  };
  const stopped: string[] = [];
  const started: string[] = [];
  let failStartOn: string | null = null;
  const definition: PluginDefinition = {
    manifest: { ...partitionNotes().manifest, actions: [writeNoteAction] },
    async start(context) {
      if (failStartOn === context.project_id) throw new Error("partition B start failed");
      started.push(context.project_id!);
      const db = context.services?.database;
      assert.ok(db, "per-partition instance receives services.database");
      return {
        kind: "app",
        views: [],
        actions: [bindActionHandler(writeNoteAction, async (input, caller) => {
          await db.transaction(caller.beforeEffect, tx => {
            tx.run("INSERT INTO notes (note_id, partition_id) VALUES (?, ?)", [input.id, context.project_id!]);
          });
          const rows = db.all("SELECT note_id FROM notes");
          return { count: rows.length, partition: context.project_id! };
        })],
      };
    },
    async stop(context) { stopped.push(context.project_id!); },
  };
  const actionsA = pluginActions(storeA, a);
  const actionsB = pluginActions(storeB, b);
  const installId = installIdentity(definition.manifest);
  const scopeA = partitionPluginScope(home, a, PLUGIN, installId);
  const scopeB = partitionPluginScope(home, b, PLUGIN, installId);
  const portsA = { store: storeA, ...openProjectVersionStores(storeA), projectId: a, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home, actions: actionsA, installedByHand: new Set([definition]) };
  const portsB = { store: storeB, ...openProjectVersionStores(storeB), projectId: b, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home, actions: actionsB, installedByHand: new Set([definition]) };
  const callerFor = (projectId: string): ActionCallContext => ({
    actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: ["notes:read", "notes:write"],
  });
  const ref = { capability_id: writeNoteAction.capability_id, version: writeNoteAction.version, provider_id: installId };
  try {
    const instanceA = await startPartitionPluginInstance(portsA, scopeA, { definition }, installs.db);
    const instanceB = await startPartitionPluginInstance(portsB, scopeB, { definition }, installs.db);
    assert.deepEqual(started, [a, b]);
    const homeRows = installs.db.prepare("SELECT record_json FROM plugin_runtime_installs").all() as Array<{ record_json: string }>;
    assert.equal(homeRows.length, 1, "one shared Home install row for both partitions");
    assert.equal((JSON.parse(homeRows[0]!.record_json) as PluginInstanceRecord).state, "installed", "shared Home row keeps durable installed state rather than transient partition running state");

    assert.deepEqual(await actionsA.client.invoke(callerFor(a), ref, { id: "a-1" }), { count: 1, partition: a });
    assert.deepEqual(await actionsB.client.invoke(callerFor(b), ref, { id: "b-1" }), { count: 1, partition: b });

    // Stopping B must not corrupt Home's install row or break A's live actions / owned action invocation.
    await instanceB.stop();
    assert.deepEqual(stopped, [b], "B's stop hook ran");
    assert.deepEqual(await actionsA.client.invoke(callerFor(a), ref, { id: "a-2" }), { count: 2, partition: a }, "A keeps serving actions after B stopped");

    // Crashing B on restart must not mark Home crashed or break A either.
    failStartOn = b;
    await assert.rejects(startPartitionPluginInstance(portsB, scopeB, { definition }, installs.db), unavailable);
    failStartOn = null;
    assert.deepEqual(await actionsA.client.invoke(callerFor(a), ref, { id: "a-3" }), { count: 3, partition: a }, "A keeps serving actions after B crashed on start");

    // Stopping A afterwards must genuinely execute A's stop() hook and close its resources (not skipped by shutdownStops).
    await instanceA.stop();
    assert.deepEqual(stopped, [b, a], "A's stop hook genuinely ran after B had already stopped");
    await assert.rejects(actionsA.client.invoke(callerFor(a), ref, { id: "a-after-stop" }), (error: unknown) => error instanceof ActionError);

    // Direct check on createPluginPlatform: invokeOwnedAction in A stays alive after B stops, and B's DB still has only its own row.
    const storageA = new SqlitePluginPrivateStorage(storeA.db), storageB = new SqlitePluginPrivateStorage(storeB.db);
    const makePlatform = (projectId: string, store: LocalProjectDatabase, storage: SqlitePluginPrivateStorage, scope: PartitionPluginScope) =>
      createPluginPlatform({
        project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, db: store.db, journal: store, ...openProjectVersionStores(store),
        ui: new UiHost(), privateStorageFor: (ctx, m) => storage.forPlugin(ctx, m),
        actions: pluginActions(store, projectId), home: { directory: home, completeText: () => null, stores: homeStores(), consents: new HomeConsentLedger(home), capturePermission: () => () => {}, assertStorageOwner: () => ({} as never) },
        inProcess: { admit: new Set([definition]) }, installDatabase: installs.db, partitionScope: scope,
      });
    const platformA = makePlatform(a, storeA, storageA, scopeA);
    const platformB = makePlatform(b, storeB, storageB, scopeB);
    try {
      await platformA.start([{ definition }]);
      await platformB.start([{ definition }]);
      const recA = platformA.runtime.get(installId);
      assert.equal(recA.state, "running");
      await platformB.runtime.stop(installId, { preserve_enabled: true });
      assert.equal(platformB.runtime.get(installId).state, "installed");
      assert.equal(platformA.runtime.get(installId).state, "running", "A's platform still sees its own running state after B stopped");
      const invoked = await platformA.invokeOwnedAction(
        { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: a, plugin_id: PLUGIN, install_id: installId, installation_generation: recA.installation_generation },
        ref,
        { id: "a-owned" },
        { beforeEffect: async () => {} },
      );
      assert.deepEqual(invoked, { count: 4, partition: a }, "invokeOwnedAction on A succeeds after B stopped");
      await platformB.runtime.start(installId);
      await platformB.runtime.reportCrash(installId, "plugin.process_crashed");
      assert.equal(platformB.runtime.get(installId).state, "crashed");
      assert.equal(platformA.runtime.get(installId).state, "running", "B crashing never poisons A's state");
      const checkCap = platformA.runtime.capturePermission(installId, "notes:write");
      assert.doesNotThrow(() => checkCap(), "A's captured permission holds even while B is crashed");
      await platformA.runtime.stop(installId, { preserve_enabled: true });
      assert.equal(platformA.runtime.get(installId).state, "installed");
    } finally {
      await platformB.closeCoordination();
      await platformA.closeCoordination();
    }
    const dbB = new DatabaseSync(join(partitionRoot(home, b), "libraries", "notes.db"), { readOnly: true });
    try { assert.deepEqual(dbB.prepare("SELECT note_id FROM notes").all().map(r => r.note_id), ["b-1"]); }
    finally { dbB.close(); }
  } finally { installs.db.close(); storeA.close(); storeB.close(); await host.close(); }
}));

test("UPP-06 S-partition-isolation S-64 real sandbox ownerFiles and project_database stay confined to each partition; symlinked plugin-files into B is refused on start and on uninstall", async () => withPartitions(async (home, a, b) => {
  const probeA = ownerFilesProbe("iso-files", "project");
  const probeB = ownerFilesProbe("iso-files", "project");
  probeA.definition.execution = "sandbox";
  probeB.definition.execution = "sandbox";
  const projA = ownerFilesProject(home, probeA, { file: partitionRoot(home, a) + "/molis-work.db", projectId: a });
  const projB = ownerFilesProject(home, probeB, { file: partitionRoot(home, b) + "/molis-work.db", projectId: b });
  try {
    const recA = projA.platform.runtime.install({ trust: UNSIGNED_TRUST, definition: probeA.definition, deployment: "local", grants: probeA.permissions }).install;
    const recB = projB.platform.runtime.install({ trust: UNSIGNED_TRUST, definition: probeB.definition, deployment: "local", grants: probeB.permissions }).install;
    await projA.platform.runtime.start(recA.install_id);
    await projB.platform.runtime.start(recB.install_id);

    probeA.behavior.write = client => client.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("from-A")));
    probeB.behavior.write = client => client.write(writer => writer.replaceFileAtomic("catalog.json", Buffer.from("from-B")));
    await projA.client.invoke(probeA.caller(a), probeA.writeAction, {});
    await projB.client.invoke(probeB.caller(b), probeB.writeAction, {});
    const fileA = join(partitionRoot(home, a), "plugin-files", recA.install_id, probeA.owner_files.store_name, "catalog.json");
    const fileB = join(partitionRoot(home, b), "plugin-files", recB.install_id, probeB.owner_files.store_name, "catalog.json");
    assert.equal(readFileSync(fileA, "utf8"), "from-A");
    assert.equal(readFileSync(fileB, "utf8"), "from-B");

    // Path traversal from A trying to climb into B is refused.
    probeA.behavior.read = client => client.read(`../../../${b}/plugin-files/${recB.install_id}/${probeB.owner_files.store_name}/catalog.json`);
    await assert.rejects(projA.client.invoke(probeA.caller(a), probeA.readAction, {}), { code: "host.owner_file_invalid" });

    // Swap A's plugin-files directory for a symlink pointing into B's plugin-files:
    // both restarting A and uninstalling A (retain_private_data: false) MUST refuse and leave B's file intact.
    await projA.platform.runtime.stop(recA.install_id);
    const holderA = join(partitionRoot(home, a), "plugin-files");
    const holderB = join(partitionRoot(home, b), "plugin-files");
    rmSync(holderA, { recursive: true, force: true });
    symlinkSync(holderB, holderA);

    await assert.rejects(projA.platform.runtime.start(recA.install_id), (error: unknown) => error instanceof ActionError);
    assert.equal(projA.platform.runtime.get(recA.install_id).last_error_code, "actions.forbidden", "sandboxOwnerFilesFor refuses symlink into partition B before mkdirSync/open");

    await assert.rejects(
      projA.platform.runtime.uninstall(recA.install_id, { retain_private_data: false }),
      { code: pluginErrors.declaration_invalid("x").code },
      "removeSandboxOwnerFiles refuses to follow partition A's symlink into partition B",
    );
    assert.equal(readFileSync(fileB, "utf8"), "from-B", "partition B's owner files are completely untouched");
  } finally {
    await projA.close();
    await projB.close();
  }

  // Real services.project_database isolation: each partition's plugin instance only sees its own partition's molis-work.db tables.
  const projDecl: PluginDatabaseDeclaration = {
    store_name: "pitems", version: 1,
    schema: "CREATE TABLE pitems (item_id TEXT PRIMARY KEY, owner_partition TEXT NOT NULL);",
    read_permission: "pitems:read", write_permission: "pitems:write",
  };
  const writeItem: ActionDefinition<{ id: string }, string[]> = {
    capability_id: "com.example.pitems.write", version: 1, operation: "command",
    action: {
      title: "写项目表", description: "写入分区主库插件表", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["pitems:read", "pitems:write"], subject_kinds: [],
      input_schema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false },
    },
  };
  const projDef: PluginDefinition = {
    manifest: {
      schema_version: 1, host_api_version: 1, plugin_id: "com.example.pitems", version: "1.0.0", name: "PItems", kind: "app",
      publisher: { publisher_id: "example", signature: "pitems-sig" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [
        { permission: "storage:private", required: true, reason: "private" },
        { permission: "pitems:read", required: true, reason: "read" },
        { permission: "pitems:write", required: true, reason: "write" },
      ],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions: [writeItem], databases: { project: projDecl },
    },
    async start(context) {
      const pdb = context.services?.project_database;
      assert.ok(pdb, "project_database is bound");
      return {
        kind: "app", views: [], actions: [bindActionHandler(writeItem, async (input, caller) => {
          await pdb.transaction(caller.beforeEffect, tx => {
            tx.run("INSERT INTO pitems (item_id, owner_partition) VALUES (?, ?)", [input.id, context.project_id!]);
          });
          return pdb.all("SELECT item_id FROM pitems ORDER BY item_id").map(row => String(row.item_id));
        })],
      };
    },
  };
  const storeA = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const storeB = new LocalProjectDatabase(partitionRoot(home, b) + "/molis-work.db");
  const actionsA = pluginActions(storeA, a), actionsB = pluginActions(storeB, b);
  const storageA = new SqlitePluginPrivateStorage(storeA.db), storageB = new SqlitePluginPrivateStorage(storeB.db);
  const platA = createPluginPlatform({ project_id: a, actor_id: LOCAL_PERSON_ACTOR_ID, db: storeA.db, journal: storeA, ...openProjectVersionStores(storeA), ui: new UiHost(), privateStorageFor: (c, m) => storageA.forPlugin(c, m), actions: actionsA, home: null, inProcess: { admit: new Set([projDef]) } });
  const platB = createPluginPlatform({ project_id: b, actor_id: LOCAL_PERSON_ACTOR_ID, db: storeB.db, journal: storeB, ...openProjectVersionStores(storeB), ui: new UiHost(), privateStorageFor: (c, m) => storageB.forPlugin(c, m), actions: actionsB, home: null, inProcess: { admit: new Set([projDef]) } });
  try {
    await platA.start([{ definition: projDef }]);
    await platB.start([{ definition: projDef }]);
    const ref = { capability_id: writeItem.capability_id, version: writeItem.version, provider_id: installIdentity(projDef.manifest) };
    const rowsA = await actionsA.client.invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: a, audience: "user", permissions: ["pitems:read", "pitems:write"] }, ref, { id: "only-a" });
    const rowsB = await actionsB.client.invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: b, audience: "user", permissions: ["pitems:read", "pitems:write"] }, ref, { id: "only-b" });
    assert.deepEqual(rowsA, ["only-a"]);
    assert.deepEqual(rowsB, ["only-b"]);
  } finally {
    await platA.closeCoordination();
    await platB.closeCoordination();
    storeA.close();
    storeB.close();
  }
}));

test("UPP-06 S-82 S-147 per-partition plugin declaring settings_entries starts in multiple partitions and upgrades without self-conflict, while conflicting key and illegal partition upgrade SQL are refused", async () => withPartitions(async (home, a, b) => {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const storeA = new LocalProjectDatabase(partitionRoot(home, a) + "/molis-work.db");
  const storeB = new LocalProjectDatabase(partitionRoot(home, b) + "/molis-work.db");
  const installs = openHomePluginStore(home);
  const makeSettingsPlugin = (pluginId: string, version: string, key: string, extra: Partial<PluginDefinition["manifest"]> = {}): PluginDefinition => {
    const { read, write } = defineSettingsActions({
      scope: "project",
      read: { capability_id: `${pluginId}.settings.read`, version: 1, title: "read", description: "read", permissions: [] },
      write: { capability_id: `${pluginId}.settings.write`, version: 1, title: "write", description: "write", permissions: [] },
    });
    return {
      manifest: {
        schema_version: 1, host_api_version: 1, kind: "app", plugin_id: pluginId, name: pluginId, version,
        publisher: { publisher_id: "example", signature: `sig-${pluginId}` },
        entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
        permissions: [
          { permission: "storage:private", required: true, reason: "db" },
          { permission: "notes:read", required: true, reason: "read" },
          { permission: "notes:write", required: true, reason: "write" },
        ],
        capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
        actions: [read, write],
        settings_entries: {
          entries: [{ key, title: { key: `${pluginId.split(".").pop()}.settings.title` }, layers: ["project"], schema: { type: "string" } }],
          read: { capability_id: read.capability_id, version: read.version },
          write: { capability_id: write.capability_id, version: write.version },
        },
        databases: { partition: declaration },
        ...extra,
      },
      async start() {
        return { kind: "app", actions: [bindActionHandler(read, () => ({ values: [] })), bindActionHandler(write, () => ({ values: [] }))] };
      },
    };
  };
  const v1 = makeSettingsPlugin("com.example.pnotes-settings", "1.0.0", "pnotes.mode");
  const v2 = makeSettingsPlugin("com.example.pnotes-settings", "2.0.0", "pnotes.mode", { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } });
  const rival = makeSettingsPlugin("com.example.pnotes-rival", "1.0.0", "pnotes.mode", {
    databases: { partition: { ...declaration, store_name: "rival" } },
  });
  const badUpgrade = makeSettingsPlugin("com.example.pnotes-bad-sql", "2.0.0", "pnotes.bad", {
    databases: { partition: { ...declaration, store_name: "badsql", version: 2, upgrades: [{ from: 1, sql: "PRAGMA journal_mode = OFF;" }] } },
  });
  const installId = installIdentity(v1.manifest);
  const scopeA = partitionPluginScope(home, a, v1.manifest.plugin_id, installId);
  const scopeB = partitionPluginScope(home, b, v1.manifest.plugin_id, installId);
  const storageA = new SqlitePluginPrivateStorage(storeA.db), storageB = new SqlitePluginPrivateStorage(storeB.db);
  const homePort = { directory: home, completeText: () => null, stores: homeStores(), consents: new HomeConsentLedger(home), capturePermission: () => () => {}, assertStorageOwner: () => ({} as never) };
  const platA = createPluginPlatform({ project_id: a, actor_id: LOCAL_PERSON_ACTOR_ID, db: storeA.db, journal: storeA, ...openProjectVersionStores(storeA), ui: new UiHost(), privateStorageFor: (c, m) => storageA.forPlugin(c, m), actions: pluginActions(storeA, a), home: homePort, inProcess: { admit: new Set([v1, v2, rival, badUpgrade]) }, installDatabase: installs.db, partitionScope: scopeA });
  const platB = createPluginPlatform({ project_id: b, actor_id: LOCAL_PERSON_ACTOR_ID, db: storeB.db, journal: storeB, ...openProjectVersionStores(storeB), ui: new UiHost(), privateStorageFor: (c, m) => storageB.forPlugin(c, m), actions: pluginActions(storeB, b), home: homePort, inProcess: { admit: new Set([v1, v2]) }, installDatabase: installs.db, partitionScope: scopeB });
  try {
    const repA = await platA.start([{ definition: v1, releaseArtifact: { capture: () => "export {};", restore: () => v1 } }]);
    assert.deepEqual(repA.running, [v1.manifest.plugin_id], `v1 must start without settings_entries self-conflict: ${JSON.stringify(repA)}`);
    const repB = await platB.start([{ definition: v1, releaseArtifact: { capture: () => "export {};", restore: () => v1 } }]);
    assert.deepEqual(repB.running, [v1.manifest.plugin_id], `second partition must also start without self-conflict: ${JSON.stringify(repB)}`);

    const upgraded = await platA.upgrade(v1.manifest.plugin_id, v2);
    assert.equal(upgraded?.status, "running", `upgrade reading v1 release from Home install table must succeed: ${JSON.stringify(upgraded)}`);

    // Another plugin declaring the same setting key must still be refused (S-82).
    assert.throws(
      () => platA.runtime.install({ trust: UNSIGNED_TRUST, definition: rival, deployment: "local", grants: ["storage:private", "notes:read", "notes:write"] }),
      { code: "plugin.definition_conflict" },
    );

    // Illegal SQL in databases.partition.upgrades must be refused at install (S-147).
    assert.throws(
      () => platA.runtime.install({ trust: UNSIGNED_TRUST, definition: badUpgrade, deployment: "local", grants: ["storage:private", "notes:read", "notes:write"] }),
      { code: "plugin.project_database.upgrade_out_of_scope" },
    );
  } finally {
    await platB.runtime.stop(installId, { preserve_enabled: true }).catch(() => {});
    await platA.runtime.stop(installId, { preserve_enabled: true }).catch(() => {});
    await platB.closeCoordination();
    await platA.closeCoordination();
    installs.db.close();
    storeA.close();
    storeB.close();
    await host.close();
  }
}));

test("UPP-21 sweep does not stop an instance with pending start waiters, and stopping a failing start does not throw spurious AggregateError", async () => withPartitions(async (home, a) => {
  let now = 0;
  let resolveStart!: () => void;
  let stops = 0;
  const assembly = new PartitionPluginAssembly({
    home, idleMs: 1000, now: () => now, library: () => "notes", members: () => [PLUGIN], installation: () => record,
    start: () => new Promise<{ stop(): Promise<void> }>(resolve => {
      resolveStart = () => resolve({ async stop() { stops += 1; } });
    }),
  });
  const acquiring = assembly.acquire(PLUGIN, a, "open");
  await new Promise(resolve => setImmediate(resolve));
  now = 5000;
  assert.equal(await assembly.sweep(), 0, "sweep skips an instance while callers await its start");
  assert.equal(stops, 0);
  resolveStart();
  const lease = await acquiring;
  assert.equal(lease.scope.partition_id, a);
  lease.release();
  now = 7000;
  assert.equal(await assembly.sweep(), 1, "once released and idle, sweep stops it");
  assert.equal(stops, 1);

  let rejectStart!: (error: Error) => void;
  const failing = new PartitionPluginAssembly({
    home, library: () => "notes", members: () => [PLUGIN], installation: () => record,
    start: () => new Promise<{ stop(): Promise<void> }>((_resolve, reject) => { rejectStart = reject; }),
  });
  const pendingAcquire = failing.acquire(PLUGIN, a, "open");
  await new Promise(resolve => setImmediate(resolve));
  const concurrentStop = failing.stopPlugin(PLUGIN, a);
  rejectStart(new Error("boom-on-start"));
  await concurrentStop; // Must resolve without throwing AggregateError for a start that never produced a handle.
  await assert.rejects(pendingAcquire, /boom-on-start/u);
  assert.deepEqual(failing.instances(), []);
}));

// UPP-05: batch 107's six partition plugins keep one library per partition, so their business code has no `project_id` filter left.
test("UPP-05 the six partition plugins' code never narrows its own tables by project_id", async () => {
  const { readdirSync } = await import("node:fs");
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : /\.(ts|mjs|js)$/u.test(entry.name) ? [join(directory, entry.name)] : []);
  const found = ["pages", "ppt", "form", "dataset", "lingguang", "workflows"].flatMap(plugin => files(join("plugins/native", plugin, "src")))
    .filter(file => /\bproject_id\s*(=|IN)\s*[?(]/iu.test(readFileSync(file, "utf8")));
  assert.deepEqual(found, []);
});

test("F-hc2-18: releasing a partition while refresh is in flight leaves zero leaked instances or failure records", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("并发释放分区", ["dataset"]);
  await f.host.actionClient(a.reference).invoke(runtimePerson(DATASET_ACTION_PERMISSIONS, a.project_id), datasetActions.create, { title: "初始" });
  const partitionHost = existingPartitionPluginHost(f.home);
  assert.ok(partitionHost, "the Home runs the partition plugin host");
  await partitionHost.assembly.stopPlugin(DATASET, a.project_id);
  const refreshing = partitionHost.refresh(a.project_id);
  await partitionHost.releasePartition(a.project_id);
  await refreshing;
  assert.deepEqual(partitionHost.assembly.instances().filter(item => item.partition_id === a.project_id), []);
  assert.equal(partitionHost.failure(a.project_id, DATASET), undefined);
});

test("UPP-06 S-partition-isolation overview.read@1: the person reads every partition's waiting entries, the assistant only what the person granted in its settings, revoked at once; other callers are refused", { timeout: 60_000 }, async t => {
  const { openTestHome } = await import("./fixtures/test-home.js");
  const { ATTENTION_OVERVIEW_SOURCE, assistantSettingActions, assistantSettingOwner } = await import("@molis-ai/molis-work-app-local-host");
  const { OVERVIEW_PROVIDER_ID, overviewReadAction } = await import("@molis-ai/molis-work-contracts/platform/plugin");
  const home = await openTestHome(t);
  const a = await home.createProject("总览 A"), b = await home.createProject("总览 B");
  // Two "waiting on you" entries written where the platform keeps them, one per project, and one already done that is not shown.
  for (const [project, entry, status] of [[a, "wait-a", "open"], [b, "wait-b", "in_progress"], [a, "done-a", "done"]] as const) {
    const db = new DatabaseSync(project.database_path);
    try {
      db.prepare(`INSERT INTO attention_entries (project_id, entry_id, owner_plugin_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at)
        VALUES (?, ?, 'io.molis.work.goals', 'goal', ?, 'needs_decision', ?, '{}', 1, '2026-11-26T09:00:00.000Z', '2026-11-26T09:00:00.000Z')`).run(project.project_id, entry, `subject-${entry}`, status);
    } finally { db.close(); }
  }
  const client = home.host.homeActionClient(), read = { ...overviewReadAction, provider_id: OVERVIEW_PROVIDER_ID };
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", permissions: [], project_id: null } as ActionCallContext;
  const assistant = { ...person, audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:work-1" } as ActionCallContext;
  const rows = async (caller: ActionCallContext) => ((await client.invoke(caller, read, { kinds: ["notification"] })) as OverviewReadResult).rows
    .filter(row => row.install_id === ATTENTION_OVERVIEW_SOURCE).map(row => [row.partition_id, row.row_id, row.fields] as const).sort();

  const byPerson = await rows(person);
  assert.deepEqual(byPerson.map(([partition, id]) => [partition, id]), [[a.project_id, "wait-a"], [b.project_id, "wait-b"]].sort(),
    "the person reads both projects' open entries; a done one is not listed");
  assert.equal(byPerson[0]![2].title, "needs_decision", "the row carries the owner's reason word, not a copy of the object");
  assert.deepEqual(await rows(assistant), [], "the assistant reads nothing until the person grants it a project");

  const write = (expected_revision: string, grants: unknown) => client.invoke(person, { ...assistantSettingActions.write, provider_id: assistantSettingOwner.provider_id },
    { key: "assistant.overview_grants", layer: "personal", expected_revision, change: { set: { grants } }, request_id: `grant-${expected_revision}` });
  await write("0", [{ partition_id: a.project_id, fields: ["title"] }]);
  assert.deepEqual(await rows(assistant), [[a.project_id, "wait-a", { title: "needs_decision" }]], "granted A's titles: A's entry, only its title, nothing of B");
  await write("1", []);
  assert.deepEqual(await rows(assistant), [], "a withdrawn grant takes effect on the next read");

  for (const [label, caller] of [
    ["an Agent of its own (not the person)", { ...assistant, actor_id: "agent:runtime-1" }],
    ["an MCP client", { ...person, audience: "mcp", actor_kind: "runtime" }],
    ["a workflow", { ...person, audience: "workflow", actor_kind: "runtime" }],
    ["a call handed on by a plugin", { ...person, delegated_by: "some-install" }],
  ] as const) await assert.rejects(client.invoke(caller as ActionCallContext, read, {}), (error: ActionError) => error.code === "actions.forbidden" || error.code === "actions.unavailable", label);
});

test("UPP-06 S-partition-isolation AP-01 mainOverviewLibrary, attentionOverviewLibrary, and overview index reject symlink escapes across partitions", async () => withPartitions(async (home, a, b) => {
  const mainManifest = { plugin_id: "io.molis.work.coding", databases: { project: { store_name: "coding" } }, overview_projection: { kinds: ["background_task"] } } as never;
  const dbBPath = join(partitionRoot(home, b), "molis-work.db");
  const dbB = new LocalProjectDatabase(dbBPath);
  try {
    dbB.db.prepare(`INSERT INTO attention_entries (project_id, entry_id, owner_plugin_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at)
      VALUES (?, 'secret-b', 'io.molis.work.goals', 'goal', 'g-b', 'needs_decision', 'open', '{}', 1, '2026-11-26T09:00:00.000Z', '2026-11-26T09:00:00.000Z')`).run(b);
    dbB.db.prepare(`INSERT INTO plugin_overview_rows (install_id, kind, row_id, title, state, waiting, updated_at)
      VALUES ('coding-install', 'background_task', 's-b', 'B 的秘密任务', 'running', 0, '2026-11-26T09:00:00.000Z')`).run();
  } finally { dbB.close(); }

  // Replace A's molis-work.db with a symlink pointing to B's molis-work.db.
  const dbAPath = join(partitionRoot(home, a), "molis-work.db");
  rmSync(dbAPath, { force: true });
  symlinkSync(dbBPath, dbAPath);

  assert.throws(() => mainOverviewLibrary(home, a, "coding-install", mainManifest), forbidden, "mainOverviewLibrary rejects symlinked molis-work.db");
  assert.throws(() => attentionOverviewLibrary(home, a), forbidden, "attentionOverviewLibrary rejects symlinked molis-work.db");
  const resolved = partitionOverviewLibraries(home, [a, b].map(partition_id => ({ partition_id, plugins: [{ install_id: "coding-install", manifest: mainManifest }] })));
  assert.deepEqual(resolved.map(library => library.partition_id), [b], "partitionOverviewLibraries skips symlinked main library in A");

  // Defense in depth: even if a library descriptor with A's symlinked path reaches readLibrary or readOverview directly, it is refused and returns null/empty.
  const index = openOverviewIndex({ homeDirectory: home });
  try {
    assert.equal(index.readLibrary({ partition_id: a, install_id: "coding-install", plugin_id: "io.molis.work.coding", path: dbAPath, kinds: ["background_task"], table: "main" }), null);
  } finally { index.close(); }
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("never woken"); } } });
  try {
    const forgedAttention = { partition_id: a, install_id: ATTENTION_OVERVIEW_SOURCE, plugin_id: ATTENTION_OVERVIEW_SOURCE, path: dbAPath, kinds: ["notification"] as const, table: "attention" as const };
    assert.equal(services.overview.refresh(forgedAttention), null, "readAttentionLibrary refuses symlinked molis-work.db");
    assert.deepEqual(services.readOverview(runtimePerson([], null), [forgedAttention], () => ({ readable: [a], grants: [] })), []);
  } finally { services.close(); }
}));

test("UPP-34 V11 AP-03 AP-17 AP-06 AP-10 AP-11 Host partitionChanged arms synced dormant reminders, overview reads dormant installed packages, disabling main-DB plugins clears stale rows, and live recheck/mid-start stop hold", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const a = await f.project("休眠提醒 A", ["todo", "coding"]);
  const host = existingPartitionPluginHost(f.home), services = host?.services;
  assert.ok(host && services, "the Host started partition services");

  // AP-03: close partition A and stop Todo, then write a reminder directly to A's todo.db (simulating cross-device sync).
  await f.host.closeProject(a.reference);
  await host.assembly.stopPlugin(todoManifest.plugin_id);
  assert.deepEqual(host.assembly.instances(), [], "no plugin instance running before sync arrival");
  const todoInstall = installIdentity(todoManifest);
  const remindAt = "2026-12-10T09:00:00.000Z";
  const todoLib = openPartitionPluginLibrary(partitionPluginScope(f.home, a.project_id, todoManifest.plugin_id, todoInstall), f.home, todoManifest.databases!.partition!);
  try {
    const db = todoLib.writer;
    const tx = { get: (sql: string, values: readonly unknown[] = []) => (db.prepare(sql).get(...(values as never[])) ?? null) as never,
      all: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).all(...(values as never[])) as never,
      run: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).run(...(values as never[])), savepoint: () => { throw new Error("unused"); } };
    db.exec("BEGIN");
    overviewRows(tx as never).upsert("task", { row_id: "synced-dormant-1", title: "休眠同步提醒", status: "open", remind_at: remindAt, updated_at: "2026-11-26T10:00:00.000Z" });
    db.exec("COMMIT");
  } finally { todoLib.close(); }
  partitionChanged(f.home, a.project_id);
  assert.deepEqual(host.assembly.instances(), [], "partitionChanged wakes zero plugins");
  assert.deepEqual(services.due.entries(a.project_id).map(entry => [entry.entry_key, entry.due_at]), [["task:synced-dormant-1", remindAt]],
    "V11: synced reminder in dormant partition immediately populates due-registry without opening Overview");

  // AP-17: dormant third-party partition plugin installed in Home plugin-runtime.db is discovered read-only by overviewRowsFor.
  const thirdPartyId = "com.example.dormant-tasks";
  const thirdPartyDecl: PartitionPluginDatabaseDeclaration = { store_name: "dormant-tasks", version: 1, schema: `CREATE TABLE items (id TEXT PRIMARY KEY);\n${OVERVIEW_TABLE_SQL}`,
    read_permission: "dormant:read", write_permission: "dormant:write" };
  const thirdPartyManifest: PluginManifest = {
    schema_version: 1, host_api_version: 1, plugin_id: thirdPartyId, version: "1.0.0", name: "Dormant Tasks", kind: "app",
    publisher: { publisher_id: "third", signature: "third-sig" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "storage:private", required: true, reason: "db" }, { permission: "dormant:read", required: true, reason: "r" }, { permission: "dormant:write", required: true, reason: "w" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    databases: { partition: thirdPartyDecl }, overview_projection: { kinds: ["task"] },
  };
  const thirdInstallId = installIdentity(thirdPartyManifest);
  const homeStore = openHomePluginStore(f.home);
  try {
    const installsRepo = new SqlitePluginRuntimeRepository(homeStore.db);
    const releasesRepo = new SqlitePluginRuntimeReleaseArtifactRepository(homeStore.db);
    installsRepo.save({
      install_id: thirdInstallId, plugin_id: thirdPartyId, version: "1.0.0", deployment: "local", selected_entrypoint: "./index.js",
      execution: "sandbox", state: "installed", publisher_id: "third", publisher_signature: "third-sig",
      manifest_digest: pluginManifestDigest(thirdPartyManifest), publisher_trust: "unsigned",
      grants: ["storage:private", "dormant:read", "dormant:write"], installed_at: "2026-11-26T00:00:00.000Z", updated_at: "2026-11-26T00:00:00.000Z",
      uninstalled_at: null, retain_private_data: false, installation_generation: "gen-1", recovery_count: 0, last_error_code: null,
    });
    releasesRepo.save(createPluginRuntimeReleaseArtifact(thirdPartyManifest, "export {};"));
  } finally { homeStore.db.close(); }
  const thirdLib = openPartitionPluginLibrary(partitionPluginScope(f.home, a.project_id, thirdPartyId, thirdInstallId), f.home, thirdPartyDecl);
  try {
    const db = thirdLib.writer;
    const tx = { get: (sql: string, values: readonly unknown[] = []) => (db.prepare(sql).get(...(values as never[])) ?? null) as never,
      all: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).all(...(values as never[])) as never,
      run: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).run(...(values as never[])), savepoint: () => { throw new Error("unused"); } };
    db.exec("BEGIN");
    overviewRows(tx as never).upsert("task", { row_id: "ext-1", title: "第三方休眠待办", status: "open", updated_at: "2026-11-26T10:00:00.000Z" });
    db.exec("COMMIT");
  } finally { thirdLib.close(); }

  const overviewSource = { home: f.home, reach: (partitionId: string) => f.host.projectPluginReach(partitionId) };
  const localPerson = runtimePerson([], null);
  const thirdRead = await overviewRowsFor(overviewSource, localPerson, [{ project_id: a.project_id, display_name: "A" }], () => [], { kinds: ["task"], limit: 50 });
  assert.ok(thirdRead?.rows.some(row => row.plugin_id === thirdPartyId && row.row_id === "ext-1"), "dormant third-party plugin row appears in overview without waking plugin");
  assert.deepEqual(host.assembly.instances(), [], "still zero wakes");

  // AP-10: recheckPartitions / live readable drops rows from a partition removed mid-read.
  const liveRecheck = await overviewRowsFor(overviewSource, localPerson, [{ project_id: a.project_id, display_name: "A" }], () => [], { kinds: ["task"], limit: 50 }, {
    recheckPartitions: async () => [],
  });
  assert.deepEqual(liveRecheck?.rows, [], "partition removed before recheck delivers zero rows");

  // AP-06: disabling a main-DB plugin (coding) clears both search.db overview_rows and <partition>/molis-work.db plugin_overview_rows.
  const { codingManifest } = await import("@molis-ai/molis-work-plugin-coding");
  const codingInstallId = installIdentity(codingManifest);
  const mainDb = new DatabaseSync(a.reference.storage_key);
  try {
    mainDb.prepare(`INSERT INTO plugin_overview_rows (install_id, kind, row_id, title, state, waiting, updated_at)
      VALUES (?, 'background_task', 'stale-coding-1', '旧编码任务', 'running', 0, '2026-11-26T10:00:00.000Z')`).run(codingInstallId);
  } finally { mainDb.close(); }
  partitionChanged(f.home, a.project_id, codingInstallId);
  const beforeDisable = await overviewRowsFor(overviewSource, localPerson, [{ project_id: a.project_id, display_name: "A" }], () => [], { kinds: ["background_task"], limit: 50 });
  assert.ok(beforeDisable?.rows.some(row => row.install_id === codingInstallId && row.row_id === "stale-coding-1"));
  const { LocalHostHttpClient, projectPluginRevision } = await import("@molis-ai/molis-work-test-kit/local-host-http");
  const web = new LocalHostHttpClient({ origin: f.origin, controlToken: f.token });
  const revision = await projectPluginRevision(web, a.project_id);
  const disableRes = await f.request(`/api/settings/projects/${encodeURIComponent(a.project_id)}/plugins`, { method: "DELETE", body: { plugin_id: "coding", expected_revision: revision } });
  assert.equal(disableRes.status, 200);
  const verifyMain = new DatabaseSync(a.reference.storage_key, { readOnly: true });
  try {
    assert.deepEqual(verifyMain.prepare("SELECT row_id FROM plugin_overview_rows WHERE install_id = ?").all(codingInstallId), [],
      "disabling main-DB plugin coding clears plugin_overview_rows in molis-work.db");
  } finally { verifyMain.close(); }
  const verifySearch = openOverviewIndex({ homeDirectory: f.home });
  try {
    assert.deepEqual(verifySearch.rows({ partitions: [a.project_id], kinds: ["background_task"], limit: 50 }).filter(row => row.install_id === codingInstallId), [],
      "and clears overview_rows in search.db");
  } finally { verifySearch.close(); }

  // AP-11: PartitionPluginAssembly.hasActiveOrStarting reports true during an in-flight start while started() is still undefined.
  let finishStart!: () => void;
  const startingAssembly = new PartitionPluginAssembly({
    home: f.home, library: () => "notes", members: () => [PLUGIN], installation: () => record,
    start: () => new Promise<{ stop(): Promise<void> }>(resolve => { finishStart = () => resolve({ async stop() {} }); }),
  });
  const pendingAcquire = startingAssembly.acquire(PLUGIN, a.project_id, "due");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(startingAssembly.started(PLUGIN, a.project_id), undefined);
  assert.equal(startingAssembly.hasActiveOrStarting(PLUGIN, a.project_id), true, "mid-startup plugin is detected as active-or-starting");
  const stoppingMidStart = startingAssembly.stopPlugin(PLUGIN, a.project_id);
  finishStart();
  await stoppingMidStart;
  await assert.rejects(pendingAcquire, unavailable);
  assert.equal(startingAssembly.hasActiveOrStarting(PLUGIN, a.project_id), false);
});
