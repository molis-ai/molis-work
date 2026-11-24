import assert from "node:assert/strict";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  ensureProjectPlugins, LocalProjectDatabase, MolisWorkLocalHost, openHomePluginStore, openPartitionPluginLibrary, openProjectVersionStores,
  PartitionPluginAssembly, partitionPluginScope, releaseProjectPlugins, startPartitionPluginInstance, type PartitionPluginScope,
} from "@molis-ai/molis-work-app-local-host";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActions } from "./fixtures/plugin-actions.js";

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
    assert.equal(platform.runtime.get(refusedState.install_id)?.last_error_code, "plugin.declaration_invalid", "refused for its declaration, before any library");
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
      assert.equal(store.db.prepare("SELECT count(*) AS count FROM plugin_runtime_installs").get()!.count, 0, "and not in the partition's library");
    } finally { await instance.stop(); }
    const otherInstall = partitionPluginScope(home, a, PLUGIN, "another-install");
    await assert.rejects(startPartitionPluginInstance(ports, otherInstall, { definition }, installs.db), /不一致/u, "a scope for another installation is refused before any start");
    const inB = partitionPluginScope(home, b, PLUGIN, installIdentity(definition.manifest));
    await assert.rejects(startPartitionPluginInstance(ports, inB, { definition }, installs.db), /不一致/u, "and one for another partition than the library it is given");
  } finally { installs.db.close(); store.close(); }
}));
