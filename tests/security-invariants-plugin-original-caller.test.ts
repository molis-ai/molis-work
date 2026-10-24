import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabaseDeclaration, PluginDefinition, PluginHostServices, PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { captureHostLog, charactersProvider, createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { charactersActions, openCharacters } from "@molis-ai/molis-work-module-characters";
import { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { deferred } from "./fixtures/home-runtime.js";
import { withLibrary } from "./fixtures/home-library.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-18: the platform services a plugin writes through ask the original caller of the action the plugin runs for themselves, in
// the same turn as the write. What the plugin hands them (a wait of its own, or none) cannot stand in for that caller, and a
// service writing for one installation refuses inside another installation's action. A project plugin has no private files
// (`owner_files` is the Home half's, PG-102); the same rules for them are in security-invariants-plugin-owner-files-lifecycle.test.ts.

const ID = "io.molis.work.example.callerprobe", READ = "callerprobe:read", WRITE = "callerprobe:write", ITEM = "example.item";
const LISTENER = "io.molis.work.example.callerlistener", ANNOUNCED = `${ID}.announced`, WRITTEN = `${ID}.written`;
const DATABASE: PluginDatabaseDeclaration = { store_name: "callerprobe", version: 1, read_permission: READ, write_permission: WRITE,
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
/** The probe's own table in the project's library (PLIB-07). */
const PROJECT_DATABASE: PluginDatabaseDeclaration = { store_name: "callerprobe", version: 1, read_permission: READ, write_permission: WRITE,
  schema: "CREATE TABLE callerprobe_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };
const TARGETS = ["database", "project_database", "storage", "publish", "record", "event", "select", "invalidate", "retain"] as const;
type Target = typeof TARGETS[number];
const preview = artifactPreview(ID);

/** What a write needs to exist first, made by the test outside every action: `select` picks a 成果 the probe published. */
function prepare(services: PluginHostServices, target: Target, name: string): void {
  if (target === "select") services.artifacts!.publish({ artifact_id: name, version: 1, artifact_type_id: preview.type.artifact_type_id, schema_version: 1,
    content: { kind: "inline", payload: { name } }, ...pinnedArtifact(name) });
}

/** One write through each service. `wait` is the plugin's own, never the caller's `beforeEffect`. */
async function write(services: PluginHostServices, target: Target, name: string, wait: () => Promise<void>): Promise<void> {
  const content = { kind: "inline" as const, payload: { name } };
  if (target === "database") { await services.database!.transaction(wait, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [name])); return; }
  if (target === "project_database") { await services.project_database!.transaction(wait, tx => tx.run("INSERT INTO callerprobe_notes (text) VALUES (?)", [name])); return; }
  const expected = target === "select" ? services.outputs!.reference("fixed") : null;
  await wait();
  if (target === "storage") services.storage!.set(name, "written");
  else if (target === "publish") services.artifacts!.publish({ artifact_id: name, version: 1, artifact_type_id: preview.type.artifact_type_id, schema_version: 1, content, ...pinnedArtifact(name) });
  else if (target === "record") services.processItems!.record({ artifact_id: name, version: 1, artifact_type_id: ITEM, schema_version: 1, content });
  else if (target === "event") services.events!.publish({ event_type_id: WRITTEN, type_version: 1, payload: { name } });
  else if (target === "select") services.outputs!.select({ port: "fixed", reference: { artifact_id: name, version: 1 }, expected_reference: expected });
  else if (target === "invalidate") services.outputs!.invalidate("item", name);
  else services.outputs!.retain({ artifact_id: name, version: 1 });
}

/** A plugin that exists only for the test: `write` waits for the test inside the wait it hands the service; `leave` writes after it returns. */
function probe() {
  const gate = { corrupt: false, entered: deferred(), release: deferred(), done: deferred(), left: undefined as Promise<void> | undefined };
  let services: PluginHostServices | undefined;
  const shape = { scope: "project" as const, audiences: ["user" as const], permissions: [WRITE], subject_kinds: [], scheduling: "concurrent" as const,
    input_schema: { type: "object", additionalProperties: false, required: ["target", "name"],
      properties: { target: { type: "string", enum: [...TARGETS] }, name: { type: "string" } } }, output_schema: { type: "boolean" } };
  const define = (operation: string, title: string): ActionDefinition<{ target: Target; name: string }, boolean> => ({
    capability_id: `${ID}.${operation}`, version: 1, operation: "command", action: { ...shape, title, description: title, kind: "operation" } });
  const writeAction = define("write", "等测试放行后写一项"), leave = define("leave", "返回之后再写一项"), announce = define("announce", "发一个事件就返回"), output = define("output", "更新输出端口就返回");
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: ID, version: "1.0.0", name: ID, kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-callerprobe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", READ, WRITE, "artifact:read", "artifact:write"].map(permission => ({ permission, required: true, reason: "写自己的数据" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [preview.type], consumes: [{ artifact_type_id: preview.type.artifact_type_id, schema_version: 1 }] },
    process_items: { produces: [{ artifact_type_id: ITEM, schema_version: 1 }], consumes: [] },
    ui: { contributions: [] }, actions: [writeAction, leave, announce, output, preview.definition], databases: { project: PROJECT_DATABASE },
    events: { publishes: [{ event_type_id: ANNOUNCED, type_version: 1 }, { event_type_id: WRITTEN, type_version: 1 }], subscribes: [] },
    ports: { inputs: [], outputs: [{ port: "item", artifact_type_id: ITEM, schema_version: 1 },
      { port: "fixed", artifact_type_id: preview.type.artifact_type_id, schema_version: 1 }] },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const held = () => { gate.entered.resolve(); return gate.release.promise; };
  const alterView = (caller: ActionCallContext) => {
    if (!gate.corrupt) return;
    Object.assign(caller.permissions, { 0: "forged:grant" });
    if (caller.allowed_actions?.[0]) Object.assign(caller.allowed_actions[0], { capability_id: "forged.action" });
    if (caller.allowed_capability_ids) Object.assign(caller.allowed_capability_ids, { 0: "forged.action" });
    if (caller.original_input) {
      Object.assign(caller.original_input, { text: "forged personal words", written_by: "person", use: undefined });
      Object.assign(caller.original_input.action, { capability_id: "forged.action", version: 99, provider_id: "forged-provider" });
    }
    if (caller.signal) Object.assign(caller.signal, { throwIfAborted: () => {} });
    Object.assign(caller, { signal: undefined, assert_authority_current: undefined, beforeEffect: async () => {} });
  };
  const definition: PluginDefinition = { manifest, event_types: [ANNOUNCED, WRITTEN].map(event_type_id => ({ event_type_id, type_version: 1, validate: (payload: unknown) => payload })), start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [
      { ...writeAction, handle: async (caller, input) => {
        alterView(caller);
        const { target, name } = input as { target: Target; name: string };
        try { await write(context.services!, target, name, held); return true; } finally { gate.done.resolve(); }
      } },
      { ...leave, handle: (caller, input) => {
        alterView(caller);
        const { target, name } = input as { target: Target; name: string };
        // Work the action leaves running keeps the action's scope, not its call.
        gate.left = gate.release.promise.then(() => write(context.services!, target, name, async () => {}));
        return true;
      } },
      { ...announce, handle: (_caller, input) => {
        context.services!.events!.publish({ event_type_id: ANNOUNCED, type_version: 1, payload: { name: (input as { name: string }).name } });
        return true;
      } },
      { ...output, handle: (_caller, input) => {
        context.services!.outputs!.publish({ port: "item", content: { kind: "inline", payload: { name: (input as { name: string }).name } } });
        return true;
      } },
      preview.handler,
    ] };
  } };
  return { definition, writeAction, leave, announce, output, gate, services: () => services ?? assert.fail("the probe has not started"),
    reset() { gate.corrupt = false; gate.entered = deferred(); gate.release = deferred(); gate.done = deferred(); gate.left = undefined; } };
}

/**
 * Hears the probe's event and its output port, and writes what it heard to its private storage once the test lets it. Its
 * `borrow` action writes through the probe's services, which a plugin could reach only by sharing them outside the platform.
 */
function listener(probeServices: () => PluginHostServices) {
  const heard = deferred(), release = deferred();
  let services: PluginHostServices | undefined;
  const borrow: ActionDefinition<{ target: Target; name: string }, boolean> = { capability_id: `${LISTENER}.borrow`, version: 1, operation: "command",
    action: { scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], scheduling: "concurrent", title: "用探针的服务写一项",
      description: "用探针的服务写一项", kind: "operation", input_schema: { type: "object", additionalProperties: false, required: ["target", "name"],
        properties: { target: { type: "string", enum: [...TARGETS] }, name: { type: "string" } } }, output_schema: { type: "boolean" } } };
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: LISTENER, version: "1.0.0", name: LISTENER, kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-callerlistener" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", "artifact:read"].map(permission => ({ permission, required: true, reason: "记下听到的" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    process_items: { produces: [], consumes: [{ artifact_type_id: ITEM, schema_version: 1 }] },
    ports: { inputs: [{ port: "item", artifact_type_id: ITEM, schema_version: 1 }], outputs: [] },
    events: { publishes: [], subscribes: [{ event_type_id: ANNOUNCED, type_version: 1, from_plugin_ids: [ID] }] },
    actions: [borrow], upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const definition: PluginDefinition = { manifest, start(context) {
    services = context.services;
    const hear = async (key: string) => { heard.resolve(); await release.promise; services!.storage!.set(key, "heard"); };
    return { kind: "app", views: [], onEvent: event => hear((event.payload as { name: string }).name),
      onUpstreamReady: () => hear("input"), onUpstreamUnavailable: () => {}, actions: [{ ...borrow, handle: async (_caller, input) => {
        const { target, name } = input as { target: Target; name: string };
        await write(probeServices(), target, name, async () => {});
        return true;
      } }] };
  } };
  return { definition, borrow, heard, release, stored: (name: string) => services?.storage?.get(name) ?? null };
}

/** The project platform the Host builds, with the real library, file, private storage and 成果 services. */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "plugin-original-caller-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(ports), processItems = new ProcessItemsModule(ports), privateStorage = new SqlitePluginPrivateStorage(store.db);
  const stores = homeStoreRegistry([...homeStores().stores, { path: DATABASE.store_name, owner: ID, library: { baseline: DATABASE } }]);
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store, artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    home: { directory: home, completeText: () => null, stores } });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const plugin = probe(), subscriber = listener(() => plugin.services());
  assert.deepEqual((await running.start([{ definition: withLibrary(plugin.definition, DATABASE), bundled: true },
    { definition: subscriber.definition, bundled: true }])).running.toSorted(), [LISTENER, ID].toSorted());
  const written = (target: Target, name: string): boolean => {
    const services = plugin.services();
    if (target === "database") return Number(services.database!.get("SELECT count(*) AS n FROM notes WHERE text = ?", [name])!.n) > 0;
    if (target === "project_database") return store.db.prepare("SELECT 1 FROM callerprobe_notes WHERE text = ?").get(name) !== undefined;
    if (target === "storage") return services.storage!.get(name) !== null;
    if (target === "event") return store.db.prepare("SELECT 1 FROM plugin_events WHERE source_plugin_id = ? AND event_type_id = ? AND json_extract(payload_json, '$.name') = ?")
      .get(ID, WRITTEN, name) !== undefined;
    if (target === "select") return running.wiring.outputReference(ID, "fixed")?.artifact_id === name;
    if (target === "invalidate") return (store.db.prepare("SELECT invalidated_reason FROM plugin_port_outputs WHERE project_id = ? AND plugin_id = ? AND port = 'item'")
      .get(DEMO_PROJECT_ID, ID) as { invalidated_reason: string | null } | undefined)?.invalidated_reason === name;
    if (target === "retain") return running.wiring.retained(ID).some(reference => reference.artifact_id === name);
    return !!(target === "publish" ? artifacts : processItems).query.latestArtifactVersion(DEMO_PROJECT_ID, name);
  };
  return { client: actions.client, plugin, subscriber, written, events: running.events, wiring: running.wiring, home,
    stop: () => running.runtime.stop(running.runtime.list().find(install => install.plugin_id === ID)!.install_id),
    restart: () => running.runtime.start(running.runtime.list().find(install => install.plugin_id === ID)!.install_id) };
}

/** The original caller. `replace` is what a caller whose authority moved to another provider reports (an MCP tool that changed, for one). */
function caller() {
  const abort = new AbortController();
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [WRITE], signal: abort.signal,
    assert_authority_current: () => { if (refusal) throw refusal; } };
  return { context, cancel: () => abort.abort(), revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); },
    replace: () => { refusal = new ActionError("actions.provider_changed", "the caller's provider changed"); } };
}

for (const target of TARGETS) {
  test(`S-18 ${target}: a plugin's own wait does not stand in for its caller; revoked, cancelled or moved to another provider while it waits, nothing is written`, async t => {
    const { client, plugin, written } = await platform(t);
    for (const failure of ["revoke", "cancel", "replace"] as const) {
      plugin.reset();
      const call = caller(), name = `${target}-${failure}`;
      prepare(plugin.services(), target, name);
      const pending = client.invoke(call.context, plugin.writeAction, { target, name }).then(() => "written", (error: unknown) => error);
      await plugin.gate.entered.promise;
      call[failure]();
      plugin.gate.release.resolve();
      const outcome = await pending;
      await plugin.gate.done.promise;
      if (failure === "cancel") assert.equal((outcome as { name?: string }).name, "AbortError", name);
      else assert.equal((outcome as { code?: string }).code, failure === "revoke" ? "actions.forbidden" : "actions.provider_changed", name);
      assert.equal(written(target, name), false, `${name}: refused after the plugin's own wait passed`);
    }
    plugin.reset(); plugin.gate.release.resolve();
    prepare(plugin.services(), target, `${target}-current`);
    assert.equal(await client.invoke(caller().context, plugin.writeAction, { target, name: `${target}-current` }), true);
    assert.equal(written(target, `${target}-current`), true, "a current caller writes");
  });
}

test("S-18 a service writing for one installation refuses inside another installation's action", async t => {
  const { client, plugin, subscriber, written } = await platform(t);
  // The listener's action reaches the probe's services. Its caller is current, but it never asked the probe to write.
  for (const target of TARGETS) {
    const name = `${target}-borrowed`;
    prepare(plugin.services(), target, name);
    await assert.rejects(client.invoke(caller().context, subscriber.borrow, { target, name }), { code: "actions.forbidden" }, target);
    assert.equal(written(target, name), false, `${target}: nothing written for the probe from the listener's action`);
  }
});

test("S-18 work an action leaves running cannot write after the action has returned", async t => {
  const { client, plugin, written } = await platform(t);
  for (const target of TARGETS) {
    plugin.reset();
    const name = `${target}-left`;
    prepare(plugin.services(), target, name);
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
    prepare(plugin.services(), target, `${target}-outside`);
    await write(plugin.services(), target, `${target}-outside`, async () => {});
    assert.equal(written(target, `${target}-outside`), true, target);
  }
});

test("S-18 a subscriber or a consumer answers to its own delivery, not to the action that set it off", async t => {
  for (const path of ["event", "input"] as const) {
    const { client, plugin, subscriber, events, wiring } = await platform(t);
    if (path === "input") wiring.bind({ project_id: DEMO_PROJECT_ID, target_plugin_id: LISTENER, target_port: "item", source_plugin_id: ID,
      source_port: "item", origin: "user", actor_id: "owner" });
    // Delivery is set off inside the probe's action; the listener writes only after that action has returned.
    const key = path === "event" ? "announced" : "input";
    assert.equal(await client.invoke(caller().context, path === "event" ? plugin.announce : plugin.output, { target: "storage", name: key }), true);
    await subscriber.heard.promise;
    subscriber.release.resolve();
    await (path === "event" ? events : wiring).drain();
    assert.equal(subscriber.stored(key), "heard", `${path}: the probe's ended call does not refuse the listener's write`);
  }
});

test("S-18 Characters publish: a caller gone after its beforeWrite is refused by the Host's 成果 write for that call", async t => {
  const home = mkdtempSync(join(tmpdir(), "characters-original-caller-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID), characters = openCharacters(home, "user");
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(ports);
  t.after(() => { characters.close(); store.close(); rmSync(home, { recursive: true, force: true }); });
  // RAC-64: the handlers are the Module's; RAC-72: the Host's provider (CHR-1) binds them and gives each call a 成果库 that writes for it.
  // Characters checks nothing of its own after `await beforeWrite()`, and its library only reads inside the publish: the 成果
  // is the one write. The caller goes away in that window, after every wait has passed and before the 成果 is written.
  let gone: (() => void) | undefined;
  const characterPorts = { actorId: "user", drafts: characters.service,
    references: () => artifacts.query.listArtifacts(DEMO_PROJECT_ID).map(record => ({ artifact_id: record.artifact_id, version: record.version })),
    publish: (id: string, revision: number, publisher: Parameters<typeof characters.service.publish>[2]) => { gone?.(); return characters.service.publish(id, revision, publisher); } };
  t.after(actions.registry.registerProvider(charactersProvider({ project_id: DEMO_PROJECT_ID, artifacts, processItems: new ProcessItemsModule(ports) }, characterPorts)));
  const created = characters.service.create();
  const draft = characters.service.update(created.character_id, created.revision, { title: "Guarded", instructions: "Fixed instructions", host_tools: null });
  for (const failure of ["revoke", "cancel", "none"] as const) {
    const abort = new AbortController();
    let revoked = false;
    const context: ActionCallContext = { actor_id: "user", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [...charactersActions.publish.action.permissions],
      signal: abort.signal, assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "the caller was revoked"); } };
    gone = failure === "none" ? undefined : () => { if (failure === "cancel") abort.abort(); else revoked = true; };
    const outcome = await actions.client.invoke(context, charactersActions.publish, { id: draft.character_id, expected_revision: draft.revision })
      .then(() => "published", (error: unknown) => error);
    const published = artifacts.query.listArtifacts(DEMO_PROJECT_ID).length;
    if (failure === "none") { assert.equal(outcome, "published"); assert.equal(published, 1, "a current caller publishes"); continue; }
    if (failure === "revoke") assert.equal((outcome as { code?: string }).code, "actions.forbidden", failure);
    else assert.equal((outcome as { name?: string }).name, "AbortError", failure);
    assert.equal(published, 0, `${failure}: nothing published once the caller is gone`);
  }
});

test("S-18 action callback mutations cannot rewrite original-input proof or erase cancellation, grants or end-of-call authority", async t => {
  const { client, plugin, written } = await platform(t), call = caller();
  const original: HostOfferedOriginalInput = { input_id: "host-original", text: "Host supplied words", written_by: "host", use: "supplement",
    occurred_at: "2026-10-24T00:00:00.000Z", install_id: "original-install",
    action: { capability_id: plugin.writeAction.capability_id, version: 1, provider_id: "original-provider" } };
  const expected = structuredClone(original);
  const context = { ...call.context, original_input: original, allowed_capability_ids: [plugin.writeAction.capability_id],
    allowed_actions: [{ capability_id: plugin.writeAction.capability_id, version: 1 }] };
  plugin.gate.corrupt = true;
  const pending = client.invoke(context, plugin.writeAction, { target: "storage", name: "mutated-cancel" }).then(() => undefined, (error: unknown) => error);
  try {
    await plugin.gate.entered.promise;
    assert.deepEqual(context.permissions, [WRITE]);
    assert.deepEqual(context.allowed_capability_ids, [plugin.writeAction.capability_id]);
    assert.equal(context.allowed_actions[0]!.capability_id, plugin.writeAction.capability_id);
    assert.deepEqual(context.original_input, expected, "the plugin's mutable callback view cannot alter the Host's text, authorship, use or nested Action identity");
    // Public AgentHost admission still sees the Host's proof, so rewriting the callback's view cannot authorize a forged personal start.
    // No adapter is installed: provenance must refuse before any runtime or model can be reached.
    await assert.rejects(new AgentHost().start("prologue", { project_id: DEMO_PROJECT_ID, actor_id: context.actor_id, plugin_id: ID,
      install_id: original.install_id, session: { session_id: "never-started", runtime_id: "prologue" },
      directory: { canonical_path: tmpdir(), realpath_verified: true }, role_id: "probe", task: "forged personal words",
      original_input: { input_id: expected.input_id, text: "forged personal words", written_by: "person", occurred_at: expected.occurred_at } },
      { manifest: { roles: [], prompts: [] }, authorizedDirectories: [tmpdir()], original_input: context.original_input }), { code: "agent.capability_unavailable" });
  } finally {
    call.cancel(); plugin.gate.release.resolve(); await pending;
  }
  const result = await pending;
  assert.ok(result instanceof Error); assert.equal(result.name, "AbortError");
  assert.equal(written("storage", "mutated-cancel"), false);
  plugin.reset(); plugin.gate.corrupt = true;
  await client.invoke(caller().context, plugin.leave, { target: "storage", name: "mutated-late" });
  plugin.gate.release.resolve();
  await assert.rejects(plugin.gate.left!, { code: "actions.expired" });
  assert.equal(written("storage", "mutated-late"), false);
});

test("S-18 BL411-05 stopped output clients cannot invalidate or retain outside an action, including after restart", async t => {
  const fixture = await platform(t), { client, plugin, written, wiring } = fixture, entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  await client.invoke(caller().context, plugin.output, { target: "storage", name: "before-stop" });
  const reference = wiring.outputReference(ID, "item"); assert.ok(reference);
  const old = plugin.services().outputs!;
  await fixture.stop();
  for (const phase of ["stopped", "restarted"] as const) {
    if (phase === "restarted") await fixture.restart();
    // BL-411: outside every call the refusal throws nothing; that nothing was written or retained shows it was refused.
    assert.equal(old.invalidate("item", phase), undefined);
    assert.equal(old.retain(reference), undefined);
    assert.equal(written("invalidate", phase), false);
    assert.deepEqual(wiring.retained(ID), []);
  }
  assert.deepEqual(entries.filter(entry => entry.event === "stopped_service_call" && entry.fields?.plugin_id === ID).map(entry => entry.fields?.method),
    ["invalidate", "retain"], "BL411-05 the Host logs each refused method of the stopped activation once, though it was called in both phases");
  plugin.services().outputs!.invalidate("item", "current-activation");
  plugin.services().outputs!.retain(reference);
  assert.equal(written("invalidate", "current-activation"), true);
  assert.deepEqual(wiring.retained(ID), [reference]);
});
