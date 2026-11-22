import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SANDBOX_PACKAGE_FILES, STATE_MACHINES_PROVIDER_ID, stateMachineActions,
  type PluginContribution, type PluginDefinition, type PluginInstanceRecord, type PluginLifecycleState, type PluginManifest,
  type StateMachineDeclaration, type StateMachineGetResult, type StateMachineListResult,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { STATE_VOCABULARIES } from "@molis-ai/molis-work-contracts/platform/state-vocabulary";
import {
  HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PLUGIN_LIFECYCLE_MACHINE, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  PluginRuntime, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, createPluginRuntimeReleaseArtifact,
  lifecycleGuarded, pluginManifestDigest, projectStateMachines, stateMachineActionProvider, type StateMachineRegistryPorts,
} from "@molis-ai/molis-work-plugin-runtime";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { PACKAGE_PLUGIN_ID, packageFiles, payloadOf } from "./fixtures/sandbox-package.js";

/**
 * The three state machine boundaries of the Runtime (specs/state-machine-platform §4.3, §4.4, §5.2): a lifecycle step the platform
 * machine does not list is not written; a plugin whose code runs other machines than its Manifest declares does not start; and the
 * registry reads declarations as data — it runs no entrypoint, grants nothing and returns only the five declared fields.
 */
const machineOf = (pluginId: string, states: StateMachineDeclaration["states"] = { open: "idle", closed: "done" }): StateMachineDeclaration =>
  ({ machine_id: pluginId + ".item", version: 1, states, initial: "open", terminal: ["closed"] });

function manifestOf(pluginId: string, machines?: readonly unknown[], version = "1.0.0"): PluginManifest {
  return {
    schema_version: 1, host_api_version: 1, plugin_id: pluginId, name: pluginId, version, kind: "app",
    publisher: { publisher_id: "state-registry", signature: "state-registry-fixture" },
    entrypoints: [{ deployment: "local", entrypoint: "./must-not-run.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ...(machines ? { state_machines: machines as PluginManifest["state_machines"] } : {}),
  };
}

function definitionOf(manifest: PluginManifest, delivered: (() => unknown) | undefined, starts: string[] = []): PluginDefinition {
  return {
    manifest,
    async start() {
      starts.push(manifest.plugin_id);
      return { kind: "app", views: [], ...(delivered ? { state_machines: delivered() } : {}) } as PluginContribution;
    },
    async stop() {},
  };
}

const record = (state: PluginLifecycleState): PluginInstanceRecord => ({
  install_id: "install-1", installation_generation: "g1", plugin_id: "io.molis.work.lifecycle-step", version: "1.0.0", publisher_id: "p",
  publisher_signature: "s", manifest_digest: "d", deployment: "local", selected_entrypoint: "./entry.mjs", grants: [], execution: "host",
  publisher_trust: "unsigned", state, recovery_count: 0, last_error_code: null, installed_at: "2026-11-21T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z", uninstalled_at: null, retain_private_data: false,
});

test("SMP-05 SMP-20 S-state-machine-lifecycle-steps a lifecycle step the platform machine does not list is refused and nothing is written", () => {
  assert.deepEqual(PLUGIN_LIFECYCLE_MACHINE.describe().states, STATE_VOCABULARIES.pluginLifecycle.states, "the machine's states are the public vocabulary's");
  assert.equal(PLUGIN_LIFECYCLE_MACHINE.describe().machine_id, "platform.plugin-runtime.lifecycle");
  const refused: Array<[PluginLifecycleState | undefined, PluginLifecycleState]> = [
    [undefined, "running"], [undefined, "quarantined"], ["quarantined", "running"], ["quarantined", "installed"], ["quarantined", "disabled"],
    ["uninstalled", "running"], ["uninstalled", "disabled"], ["uninstalled", "crashed"], ["installed", "quarantined"], ["running", "quarantined"],
    ["disabled", "quarantined"],
  ];
  for (const [from, to] of refused) {
    const inner = new MemoryPluginRuntimeRepository(), guarded = lifecycleGuarded(inner);
    if (from) inner.save(record(from));
    assert.throws(() => guarded.save(record(to)), { code: "state_machines.transition_invalid" }, `${from ?? "none"} → ${to}`);
    assert.equal(inner.get("install-1")?.state, from, "the refused step left the stored record as it was");
  }
  assert.throws(() => lifecycleGuarded(new MemoryPluginRuntimeRepository()).save(record("made-up" as PluginLifecycleState)), { code: "state_machines.state_unknown" });
  const inner = new MemoryPluginRuntimeRepository(), guarded = lifecycleGuarded(inner);
  for (const state of ["installed", "running", "crashed", "quarantined", "crashed", "disabled", "running", "installed", "uninstalled", "installed"] as const) {
    guarded.save(record(state));
    assert.equal(inner.get("install-1")?.state, state);
  }
});

test("SMP-06 S-state-machine-redemption a built-in plugin whose code runs other machines than its Manifest declares does not start; the others do", async () => {
  const id = "io.molis.work.redeem-probe", other = "io.molis.work.redeem-other", declared = machineOf(id);
  const wrong: Array<[string, (() => unknown) | undefined]> = [
    ["a different family", () => [{ ...declared, states: { open: "running", closed: "done" } }]],
    ["a different version", () => [{ ...declared, version: 2 }]],
    ["an extra state", () => [{ ...declared, states: { ...declared.states, lost: "failed" } }]],
    ["a different terminal state", () => [{ ...declared, terminal: [] }]],
    ["an undeclared machine", () => [declared, { ...declared, machine_id: id + ".extra" }]],
    ["the same machine twice", () => [declared, declared]],
    ["not a list", () => ({ [declared.machine_id]: declared })],
    ["nothing at all", undefined],
  ];
  for (const [label, delivered] of wrong) {
    const starts: string[] = [];
    const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
    const broken = runtime.install({ trust: HOST_BUILD_TRUST, definition: definitionOf(manifestOf(id, [declared]), delivered, starts), deployment: "local" }).install.install_id;
    const sound = runtime.install({ trust: HOST_BUILD_TRUST, definition: definitionOf(manifestOf(other, [machineOf(other)]), () => [machineOf(other)], starts), deployment: "local" }).install.install_id;
    await assert.rejects(runtime.start(broken), error => error instanceof Error && (delivered === undefined || !Array.isArray(delivered()) || error.message.includes(id + ".")), label);
    assert.notEqual(runtime.get(broken).state, "running", label);
    assert.equal(runtime.contribution(broken), null, label);
    await runtime.start(sound);
    assert.equal(runtime.get(sound).state, "running", label + ": another plugin still starts");
  }
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const matching = runtime.install({ trust: HOST_BUILD_TRUST, definition: definitionOf(manifestOf(id, [declared]), () => [declared]), deployment: "local" }).install.install_id;
  await runtime.start(matching);
  assert.equal(runtime.get(matching).state, "running");
});

test("SMP-06 SMP-15 a development plugin is checked when its code gives machines, and starts when it gives none", async () => {
  const id = "io.molis.work.redeem-dev", declared = machineOf(id);
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const silent = runtime.install({ trust: { level: "unsigned" }, definition: definitionOf(manifestOf(id, [declared]), undefined), deployment: "local" }).install.install_id;
  await runtime.start(silent);
  assert.equal(runtime.get(silent).state, "running", "a form with no code declaration is not checked against code");
  const second = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const lying = second.install({ trust: { level: "unsigned" }, deployment: "local",
    definition: definitionOf(manifestOf(id, [declared]), () => [{ ...declared, states: { open: "blocked", closed: "done" } }]) }).install.install_id;
  await assert.rejects(second.start(lying), error => error instanceof Error && error.message.includes(declared.machine_id));
  assert.notEqual(second.get(lying).state, "running");
});

function registryFixture() {
  const db = openTestSqlite(":memory:");
  db.exec(PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL);
  const repository = new SqlitePluginRuntimeRepository(db), releases = new SqlitePluginRuntimeReleaseArtifactRepository(db);
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS });
  const starts: string[] = [];
  const install = (manifest: PluginManifest, archive = true) => {
    const id = runtime.install({ trust: { level: "unsigned" }, definition: definitionOf(manifest, undefined, starts), deployment: "local" }).install.install_id;
    if (archive) releases.save(createPluginRuntimeReleaseArtifact(manifest, "throw new Error('entrypoint executed')"));
    return id;
  };
  let opened = 0, closed = 0;
  const builtin = manifestOf("io.molis.work.registry-builtin", [machineOf("io.molis.work.registry-builtin")]);
  const ports: StateMachineRegistryPorts = {
    builtin: () => [builtin],
    open: async projectId => { opened += 1; return { stores: projectId === "p1" ? [{ scope: "project", db }] : [], close() { closed += 1; } }; },
  };
  const provider = stateMachineActionProvider(ports);
  const person: ActionCallContext = { actor_id: "local-person", project_id: "p1", audience: "user", permissions: [] };
  const invoke = <T>(capability: string, input: unknown, caller: ActionCallContext = person, from = provider) => {
    const handler = from.handlers.find(one => one.capability_id === capability)!;
    return handler.handle({ ...caller, beforeEffect: async () => {} } as Parameters<typeof handler.handle>[0], input) as Promise<T>;
  };
  return { db, runtime, repository, install, invoke, provider, person, starts, builtin, counts: () => ({ opened, closed }) };
}

test("SMP-08 SMP-13 the registry reads stopped, switched-off and never-started installations from their stored release and says unknown instead of guessing", async () => {
  const f = registryFixture();
  try {
    const stopped = "io.molis.work.registry-stopped", off = "io.molis.work.registry-off", bare = "io.molis.work.registry-bare",
      lost = "io.molis.work.registry-lost", gone = "io.molis.work.registry-gone";
    f.install(manifestOf(stopped, [machineOf(stopped)]));
    const offId = f.install(manifestOf(off, [machineOf(off), { ...machineOf(off), machine_id: off + ".second" }]));
    await f.runtime.start(offId);
    await f.runtime.stop(offId);
    f.install(manifestOf(bare));
    f.install(manifestOf(lost, [machineOf(lost)]), false);
    const goneId = f.install(manifestOf(gone, [machineOf(gone)]));
    await f.runtime.uninstall(goneId, { retain_private_data: true });

    const started = [...f.starts];
    const listed = await f.invoke<StateMachineListResult>("state_machines.list", {});
    assert.equal(listed.empty_reason, undefined);
    const by = new Map(listed.entries.map(entry => [entry.owner_id, entry]));
    assert.deepEqual(by.get("platform.plugin-runtime"), { owner: "platform", owner_id: "platform.plugin-runtime", version: null, scope: "platform",
      source: "platform", install_id: null, installation_state: null, machines: [PLUGIN_LIFECYCLE_MACHINE.describe()] });
    assert.deepEqual(by.get(f.builtin.plugin_id), { owner: "plugin", owner_id: f.builtin.plugin_id, version: "1.0.0", scope: "project", source: "builtin",
      install_id: null, installation_state: null, machines: [machineOf(f.builtin.plugin_id)] });
    assert.equal(by.get(stopped)?.installation_state, "installed");
    assert.deepEqual(by.get(stopped)?.machines, [machineOf(stopped)]);
    assert.equal(by.get(off)?.installation_state, "disabled");
    assert.deepEqual(by.get(off)?.machines.map(machine => machine.machine_id), [off + ".item", off + ".second"]);
    assert.deepEqual([by.get(bare)?.machines, by.get(bare)?.unknown], [[], undefined], "a plugin that declares none has an entry with no machines");
    assert.deepEqual([by.get(lost)?.machines, by.get(lost)?.unknown], [[], "manifest_unavailable"], "no stored release: unknown with the reason");
    assert.equal(by.has(gone), false, "an uninstalled plugin leaves no entry");
    assert.deepEqual(f.starts, started, "reading the registry started nothing");
    assert.deepEqual(f.counts(), { opened: 1, closed: 1 });

    assert.deepEqual((await f.invoke<StateMachineListResult>("state_machines.list", { plugin_id: off })).entries.map(entry => entry.owner_id), [off]);
    const got = await f.invoke<StateMachineGetResult>("state_machines.get", { machine_id: off + ".second" });
    assert.deepEqual(got.entry?.machines, [{ ...machineOf(off), machine_id: off + ".second" }]);
    assert.equal(got.entry?.install_id, offId);
    assert.deepEqual(await f.invoke<StateMachineGetResult>("state_machines.get", { machine_id: off + ".second", install_id: "another-install" }), { entry: null });
    assert.deepEqual(await f.invoke<StateMachineGetResult>("state_machines.get", { machine_id: gone + ".item" }), { entry: null });
    assert.deepEqual((await f.invoke<StateMachineGetResult>("state_machines.get", { machine_id: "platform.plugin-runtime.lifecycle" })).entry?.owner, "platform");
  } finally { f.db.close(); }
});

test("SMP-07 SMP-08 S-state-machine-registry-metadata stored declarations are data: no entrypoint runs, nothing is granted, and only the five declared fields leave", async () => {
  const f = registryFixture();
  try {
    const sound = "io.molis.work.registry-sound", forged = "io.molis.work.registry-forged", stuffed = "io.molis.work.registry-stuffed";
    f.install(manifestOf(sound, [machineOf(sound)]));
    // A stored release is not trusted to be well formed: these two rows are written the way a damaged or forged library would hold them.
    const plant = (pluginId: string, machines: readonly unknown[]) => {
      const clean = manifestOf(pluginId, [machineOf(pluginId)]), id = f.install(clean, false);
      const planted = { ...clean, state_machines: machines } as PluginManifest, digest = pluginManifestDigest(planted);
      f.repository.save({ ...f.repository.get(id)!, manifest_digest: digest });
      f.db.prepare("INSERT INTO plugin_runtime_release_artifacts (plugin_id, publisher_signature, version, manifest_digest, artifact_json) VALUES (?, ?, ?, ?, ?)")
        .run(pluginId, clean.publisher.signature, clean.version, digest,
          JSON.stringify({ ...createPluginRuntimeReleaseArtifact(clean, "throw new Error('entrypoint executed')"), manifest: planted, manifest_digest: digest }));
      return id;
    };
    plant(forged, [{ ...machineOf(forged), machine_id: "platform.plugin-runtime.lifecycle" }]);
    plant(stuffed, [{ ...machineOf(stuffed), secret: "sk-live-value", rows: [{ title: "business contents" }], transitions: { close: { from: ["open"], to: "closed" } } }]);

    const agent: ActionCallContext = { actor_id: "agent-1", project_id: "p1", audience: "agent", permissions: [] };
    for (const caller of [undefined, agent]) {
      const listed = await f.invoke<StateMachineListResult>("state_machines.list", {}, caller);
      const by = new Map(listed.entries.map(entry => [entry.owner_id, entry]));
      assert.deepEqual([by.get(forged)?.machines, by.get(forged)?.unknown], [[], "declaration_invalid"], "a machine under another owner's id is not listed under any name");
      assert.deepEqual([by.get(stuffed)?.machines, by.get(stuffed)?.unknown], [[], "declaration_invalid"], "a declaration carrying other fields is refused whole");
      assert.equal(listed.entries.filter(entry => entry.machines.some(machine => machine.machine_id === "platform.plugin-runtime.lifecycle")).length, 1);
      const text = JSON.stringify(listed);
      for (const leaked of ["sk-live-value", "business contents", "entrypoint executed", "module_source", "must-not-run", "permissions", "grants", "publisher_signature"]) {
        assert.equal(text.includes(leaked), false, leaked);
      }
      for (const entry of listed.entries) {
        assert.deepEqual(Object.keys(entry).filter(key => key !== "unknown").sort(), ["install_id", "installation_state", "machines", "owner", "owner_id", "scope", "source", "version"]);
        for (const machine of entry.machines) assert.deepEqual(Object.keys(machine).sort(), ["initial", "machine_id", "states", "terminal", "version"]);
      }
    }
    assert.deepEqual(f.starts, []);
    assert.deepEqual(f.runtime.list().map(installed => installed.grants), f.runtime.list().map(() => []), "a declaration grants nothing");
    for (const definition of [stateMachineActions.list, stateMachineActions.get]) {
      assert.equal(definition.operation, "query");
      assert.deepEqual(definition.action.permissions, [], "the registry asks for no permission and adds none");
      assert.equal(definition.action.kind, "query");
    }
    // The project is the caller's own: neither query takes one in its input, so a caller cannot read another project's registry.
    for (const definition of [stateMachineActions.list, stateMachineActions.get]) assert.equal(Object.hasOwn(definition.action.input_schema.properties as object, "project_id"), false);
    // Through the action service, naming another project is an input the queries do not take: refused before the handler, no entries leave.
    const service = new ActionService();
    service.registerProvider(f.provider);
    for (const [definition, input] of [[stateMachineActions.list, { project_id: "another-project" }],
      [stateMachineActions.get, { machine_id: "platform.plugin-runtime.lifecycle", project_id: "another-project" }]] as const) {
      let leaked: unknown;
      await assert.rejects(service.invoke(f.person, { capability_id: definition.capability_id, version: definition.version }, input).then(result => { leaked = result; }),
        { code: "actions.input_invalid" }, definition.capability_id);
      assert.equal(leaked, undefined, "a refused read returns nothing");
    }
    await assert.rejects(f.invoke("state_machines.list", {}, { ...agent, signal: AbortSignal.abort() }), { name: "AbortError" });
  } finally { f.db.close(); }
});

test("SMP-06 SMP-11 a generated plugin's machines come from its contract: a Manifest that says otherwise is not installed, and the registry reads the ones the Host wrote", async () => {
  // A generated plugin has no code that declares a machine. Its contract names the field its records carry a state in; the Host writes the Manifest's
  // `state_machines` from that, and compares the package's Manifest with what it wrote.
  const machines = [{ machine_id: PACKAGE_PLUGIN_ID + ".status", version: 1, states: { idle: "idle", done: "done" }, initial: "idle", terminal: ["done"] }];
  const built = (change: { manifest?: unknown; values?: Record<string, string> } = {}) => packageFiles("example", (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const row = (contract.operations[0]!.output as { items: { properties: Record<string, unknown>; required: string[] } }).items;
    row.properties.status = { type: "string", enum: ["草稿", "定稿"] }; row.required.push("status");
    contract.state_machines = [{ field: "status", version: 1, states: change.values ?? { 草稿: "idle", 定稿: "done" }, initial: "草稿", terminal: ["定稿"] }];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    (manifest as { state_machines?: unknown }).state_machines = "manifest" in change ? change.manifest : machines;
  });
  const read = (change?: Parameters<typeof built>[0]) => { const { files, manifest } = built(change); return readSandboxPackage(payloadOf(manifest, files)); };
  const refused = (words: string) => (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes(words);

  const sound = read();
  assert.deepEqual(sound.manifest.state_machines, machines, "a state is named after its family; the person's own words stay in the contract");
  for (const [what, manifest] of [["none", undefined], ["an empty list", []], ["another family", [{ ...machines[0]!, states: { idle: "idle", done: "archived" } }]],
    ["one more machine", [...machines, { ...machines[0]!, machine_id: PACKAGE_PLUGIN_ID + ".other" }]]] as const)
    assert.throws(() => read({ manifest }), refused("清单不是沙箱插件的形状"), `the Manifest declares ${what}`);
  assert.throws(() => read({ values: { 草稿: "idle" } }), refused("取值要和字段的枚举完全一致"), "a contract whose declaration is not the field's values");
  assert.throws(() => read({ values: { 草稿: "idle", 定稿: "finished" } }), refused("没有写可用的状态家族"));

  const f = registryFixture();
  try {
    const id = f.install(sound.manifest);
    const listed = await f.invoke<StateMachineListResult>("state_machines.list", {});
    assert.deepEqual(listed.entries.find(entry => entry.install_id === id)?.machines, machines, "read from the stored release, like any other plugin's");
    assert.deepEqual(f.starts, []);
  } finally { f.db.close(); }
});

test("SMP-08 the provider stays registered without a Home and answers an empty list with the reason", async () => {
  const provider = stateMachineActionProvider();
  assert.equal(provider.provider.provider_id, STATE_MACHINES_PROVIDER_ID);
  assert.deepEqual(provider.definitions.map(definition => `${definition.capability_id}@${definition.version}`), ["state_machines.list@1", "state_machines.get@1"]);
  const caller: ActionExecutionContext = { actor_id: "local-person", project_id: "project", audience: "user", permissions: [], beforeEffect: async () => {} };
  const call = <T>(capability: string, input: unknown) => {
    const handler = provider.handlers.find(one => one.capability_id === capability)!;
    return handler.handle(caller, input) as Promise<T>;
  };
  assert.deepEqual(await call<StateMachineListResult>("state_machines.list", {}), { entries: [], empty_reason: "no_home" });
  assert.deepEqual(await call<StateMachineGetResult>("state_machines.get", { machine_id: "io.molis.work.any.item" }), { entry: null });
  const empty = stateMachineActionProvider({ builtin: () => [], open: async () => ({ stores: [], close() {} }) });
  const handler = empty.handlers.find(one => one.capability_id === "state_machines.list")!;
  const listed = await handler.handle(caller, {}) as StateMachineListResult;
  assert.equal(listed.empty_reason, "no_plugins_in_scope");
  assert.deepEqual(listed.entries.map(entry => entry.owner), ["platform"]);
  assert.deepEqual(projectStateMachines({ builtin: [], installations: [] }), listed.entries, "the page data path and the action share one projection");
});
