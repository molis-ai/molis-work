import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabaseDeclaration, PluginDefinition, PluginFilesDeclaration, PluginHostServices, PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-18: the platform services a plugin writes through ask the original caller of the action the plugin runs for themselves, in
// the same turn as the write. What the plugin hands them (a wait of its own, or none) cannot stand in for that caller.

const ID = "io.molis.work.example.callerprobe", READ = "callerprobe:read", WRITE = "callerprobe:write", ITEM = "example.item";
const DATABASE: PluginDatabaseDeclaration = { store_name: "callerprobe", version: 1, read_permission: READ, write_permission: WRITE,
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const FILES: PluginFilesDeclaration = { store_name: "callerprobe-files", directory: "assets", max_file_bytes: 64, read_permission: READ, write_permission: WRITE };
const TARGETS = ["database", "storage", "files", "publish", "record"] as const;
type Target = typeof TARGETS[number];
const preview = artifactPreview(ID);

/** One write through each service. `wait` is the plugin's own, never the caller's `beforeEffect`. */
async function write(services: PluginHostServices, target: Target, name: string, wait: () => Promise<void>): Promise<void> {
  const content = { kind: "inline" as const, payload: { name } };
  if (target === "database") { await services.database!.transaction(wait, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [name])); return; }
  if (target === "files") { await services.files!.create({ beforeEffect: wait }, `${name}.bin`, Buffer.from(name)); return; }
  await wait();
  if (target === "storage") services.storage!.set(name, "written");
  else if (target === "publish") services.artifacts!.publish({ artifact_id: name, version: 1, artifact_type_id: preview.type.artifact_type_id, schema_version: 1, content, ...pinnedArtifact(name) });
  else services.processItems!.record({ artifact_id: name, version: 1, artifact_type_id: ITEM, schema_version: 1, content });
}

/** A plugin that exists only for the test: `write` waits for the test inside the wait it hands the service; `leave` writes after it returns. */
function probe() {
  const gate = { entered: deferred(), release: deferred(), done: deferred(), left: undefined as Promise<void> | undefined };
  let services: PluginHostServices | undefined;
  const shape = { scope: "project" as const, audiences: ["user" as const], permissions: [WRITE], subject_kinds: [], scheduling: "concurrent" as const,
    input_schema: { type: "object", additionalProperties: false, required: ["target", "name"],
      properties: { target: { type: "string", enum: [...TARGETS] }, name: { type: "string" } } }, output_schema: { type: "boolean" } };
  const define = (operation: string, title: string): ActionDefinition<{ target: Target; name: string }, boolean> => ({
    capability_id: `${ID}.${operation}`, version: 1, operation: "command", action: { ...shape, title, description: title, kind: "operation" } });
  const writeAction = define("write", "等测试放行后写一项"), leave = define("leave", "返回之后再写一项");
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: ID, version: "1.0.0", name: ID, kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-callerprobe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", READ, WRITE, "artifact:read", "artifact:write"].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [preview.type], consumes: [] },
    process_items: { produces: [{ artifact_type_id: ITEM, schema_version: 1 }], consumes: [] },
    ui: { contributions: [] }, actions: [writeAction, leave, preview.definition],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const held = () => { gate.entered.resolve(); return gate.release.promise; };
  const definition: PluginDefinition = { manifest, start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [
      { ...writeAction, handle: async (_caller, input) => {
        const { target, name } = input as { target: Target; name: string };
        try { await write(context.services!, target, name, held); return true; } finally { gate.done.resolve(); }
      } },
      { ...leave, handle: (_caller, input) => {
        const { target, name } = input as { target: Target; name: string };
        // Work the action leaves running keeps the action's scope, not its call.
        gate.left = gate.release.promise.then(() => write(context.services!, target, name, async () => {}));
        return true;
      } },
      preview.handler,
    ] };
  } };
  return { definition, writeAction, leave, gate, services: () => services ?? assert.fail("the probe has not started"),
    reset() { gate.entered = deferred(); gate.release = deferred(); gate.done = deferred(); gate.left = undefined; } };
}

/** The project platform the Host builds, with the real library, file, private storage and 成果 services. */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-original-caller-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(ports), processItems = new ProcessItemsModule(ports), privateStorage = new SqlitePluginPrivateStorage(store.db);
  const stores = homeStoreRegistry([...homeStores().stores, { path: DATABASE.store_name, owner: ID, library: { baseline: DATABASE } }, { path: FILES.store_name, owner: ID }]);
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store, artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    home: { directory: home, completeText: () => null, stores } });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const plugin = probe();
  assert.deepEqual((await running.start([{ definition: plugin.definition, database: DATABASE, files: FILES, bundled: true }])).running, [ID]);
  const written = (target: Target, name: string): boolean => {
    const services = plugin.services();
    if (target === "database") return Number(services.database!.get("SELECT count(*) AS n FROM notes WHERE text = ?", [name])!.n) > 0;
    if (target === "storage") return services.storage!.get(name) !== null;
    if (target === "files") return existsSync(join(home, FILES.store_name, FILES.directory, `${name}.bin`));
    return !!(target === "publish" ? artifacts : processItems).query.latestArtifactVersion(DEMO_PROJECT_ID, name);
  };
  return { client: actions.client, plugin, written, home };
}

function caller() {
  const abort = new AbortController();
  let revoked = false;
  const context: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [WRITE], signal: abort.signal,
    assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "the caller was revoked"); } };
  return { context, cancel: () => abort.abort(), revoke: () => { revoked = true; } };
}

for (const target of TARGETS) {
  test(`S-18 ${target}: a plugin's own wait does not stand in for its caller; revoked or cancelled while it waits, nothing is written`, async t => {
    const { client, plugin, written } = await platform(t);
    for (const failure of ["revoke", "cancel"] as const) {
      plugin.reset();
      const call = caller(), name = `${target}-${failure}`;
      const pending = client.invoke(call.context, plugin.writeAction, { target, name }).then(() => "written", (error: unknown) => error);
      await plugin.gate.entered.promise;
      call[failure]();
      plugin.gate.release.resolve();
      const outcome = await pending;
      await plugin.gate.done.promise;
      if (failure === "revoke") assert.equal((outcome as { code?: string }).code, "actions.forbidden", name);
      else assert.equal((outcome as { name?: string }).name, "AbortError", name);
      assert.equal(written(target, name), false, `${name}: refused after the plugin's own wait passed`);
    }
    plugin.reset(); plugin.gate.release.resolve();
    assert.equal(await client.invoke(caller().context, plugin.writeAction, { target, name: `${target}-current` }), true);
    assert.equal(written(target, `${target}-current`), true, "a current caller writes");
  });
}

test("S-18 work an action leaves running cannot write after the action has returned", async t => {
  const { client, plugin, written } = await platform(t);
  for (const target of TARGETS) {
    plugin.reset();
    const name = `${target}-left`;
    assert.equal(await client.invoke(caller().context, plugin.leave, { target, name }), true);
    plugin.gate.release.resolve();
    await assert.rejects(plugin.gate.left!, { code: "actions.expired" }, target);
    assert.equal(written(target, name), false, `${target}: nothing written once the call has ended`);
  }
});

test("S-18 outside every action the installation's grants decide alone", async t => {
  const { plugin, written } = await platform(t);
  // The plugin's `start`, a route and a timer set up there run outside every action: there is no caller to ask.
  for (const target of TARGETS) {
    await write(plugin.services(), target, `${target}-outside`, async () => {});
    assert.equal(written(target, `${target}-outside`), true, target);
  }
});
