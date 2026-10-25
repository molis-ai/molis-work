import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  ActionError, type ActionCallContext, type ActionDefinition, type ActionSceneBinding, type ActionSceneDefinition,
  type ActionSceneExecutionContext,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { artifactPreview } from "./fixtures/artifact-preview.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

const ID = "io.molis.work.example.sceneprobe", EVENT = `${ID}.written`, PERMISSION = "sceneprobe:write";
const scene: ActionSceneDefinition = { scene_id: `${ID}.scene`, version: 1, title: "场景探针", description: "检查场景回调", trigger: "manual",
  scope: "project", subject_kinds: [], input_schema: { type: "object" }, result_schema: { type: "boolean" },
  event_schema: { type: "object" }, permissions: [PERMISSION], configuration_permissions: [PERMISSION] };
const judgment: ActionDefinition = { capability_id: "sceneprobe.judge", version: 1, operation: "command", action: {
  title: "判断探针", description: "返回固定判断", kind: "judgment", scope: "project", audiences: ["user"], permissions: [],
  subject_kinds: [], input_schema: scene.input_schema, output_schema: scene.result_schema,
} };
type Write = "storage" | "event" | "artifact";
type Mutation = "bind" | "consume" | "failed";
type Nested = "own" | "consumed";
type NestedOperation = "query" | "command" | "paid";
type Read = "bindings" | "targets" | "prepare" | "availability" | "configuration";
const nestedDefinition = (route: Nested, operation: NestedOperation): ActionDefinition<Record<string, never>, number> => ({
  capability_id: `sceneprobe.${route}.${operation}`, version: 1, operation: operation === "command" ? "command" : "query",
  action: { title: `${route} ${operation}`, description: "场景间接调用探针", kind: operation === "command" ? "operation" : "query", scope: "project",
    audiences: ["user", "plugin"], permissions: [], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "number" },
    ...(operation === "paid" ? { execution: { cost: "metered" } } : {}) },
});
const preview = artifactPreview(ID, "example.scene-result");

async function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "plugin-scene-control-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(ports), processItems = new ProcessItemsModule(ports), storage = new SqlitePluginPrivateStorage(store.db);
  let services: PluginHostServices | undefined;
  const binding: ActionSceneBinding = { binding_id: "one", scene_id: scene.scene_id, scene_version: 1, project_id: DEMO_PROJECT_ID,
    function: { ...judgment, provider_id: "scene-judgment" }, enabled: true, title: "One", revision: "1" };
  const state = { read: undefined as Read | undefined, target: "storage" as Write, mutation: undefined as Mutation | undefined,
    scrubControl: false, raw: undefined as NestedOperation | undefined, metadata: [] as string[],
    checked: false, failJudgment: false, leave: false, throwAfterLeave: false, model: false, reads: 0, writes: 0,
    nested: undefined as { route: Nested; operation: NestedOperation; spoof?: boolean } | undefined, nestedWrites: 0, nestedReads: 0, holdChild: false,
    entered: deferred(), release: deferred(), late: undefined as Promise<void> | undefined };
  const nestedHandle = async (operation: NestedOperation, beforeEffect: () => Promise<void>) => {
    if (operation === "query") { state.nestedReads++; return 7; }
    if (state.holdChild) { state.entered.resolve(); await state.release.promise; }
    await beforeEffect();
    // The target owns this side effect; no plugin service can accidentally check the parent a second time.
    return ++state.nestedWrites;
  };
  const ownDefinitions = (["query", "command", "paid"] as const).map(operation => nestedDefinition("own", operation));
  const consumedDefinitions = (["query", "command", "paid"] as const).map(operation => nestedDefinition("consumed", operation));
  actions.registry.registerProvider({ provider: { provider_id: "nested-consumer", kind: "system", title: "嵌套目标" }, definitions: consumedDefinitions,
    handlers: consumedDefinitions.map(definition => ({ ...definition, handle: caller => nestedHandle(definition.operation === "command" ? "command" : definition.action.execution?.cost === "metered" ? "paid" : "query", caller.beforeEffect) })) });
  const nested = async () => {
    const asked = state.nested!, definition = nestedDefinition(asked.route, asked.operation);
    const passed = asked.spoof ? { ...definition, action: { ...definition.action, execution: { cost: "free" as const } } } : definition;
    return services!.actions!.invoke(passed, {});
  };
  const alterView = (caller: ActionCallContext) => {
    Object.assign(caller.permissions, { 0: "forged:grant" });
    if (caller.allowed_actions?.[0]) Object.assign(caller.allowed_actions[0], { capability_id: "forged.action" });
    if (caller.allowed_capability_ids) Object.assign(caller.allowed_capability_ids, { 0: "forged.action" });
    if (caller.signal) Object.assign(caller.signal, { throwIfAborted: () => {} });
    Object.assign(caller, { query_only: undefined, read_only_effects: undefined, signal: undefined, assert_authority_current: () => {}, beforeEffect: async () => {} });
  };
  const write = () => {
    if (state.target === "storage") services!.storage!.set("written", "yes");
    else if (state.target === "event") services!.events!.publish({ event_type_id: EVENT, type_version: 1, payload: {} });
    else services!.artifacts!.publish({ artifact_id: "scene-result", version: 1, artifact_type_id: preview.type.artifact_type_id, schema_version: 1,
      content: { kind: "inline", payload: {} }, ...pinnedArtifact("scene-result") });
    state.writes++;
  };
  const read = (name: Read) => {
    assert.equal(services!.storage!.get("seed"), "readable", `${name}: legitimate reads remain available`);
    state.reads++;
    if (state.read === name) write();
  };
  const mutate = async (name: Mutation, caller: ActionSceneExecutionContext) => {
    if (state.mutation !== name) return;
    if (state.scrubControl) alterView(caller);
    if (state.nested) { await nested(); return; }
    if (state.model) {
      assert.ok(services!.model);
      await services!.model.complete(instructed("sceneprobe.prompt", {}));
      return;
    }
    if (state.leave) {
      state.late = state.release.promise.then(write);
      if (state.throwAfterLeave) throw new Error("callback failed before its late write");
      return;
    }
    state.entered.resolve();
    await state.release.promise;
    if (state.checked) await caller.beforeEffect();
    write();
  };
  const definition: PluginDefinition = { manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: ID, version: "1.0.0", name: "Scene probe", kind: "app",
    publisher: { publisher_id: "sceneprobe", signature: "sceneprobe-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: ["storage:private", "artifact:read", "artifact:write", "model:invoke", PERMISSION].map(permission => ({ permission, required: true, reason: "场景验证" })),
    capabilities: { provides: [], consumes: consumedDefinitions.map(value => value.capability_id) }, artifacts: { produces: [preview.type], consumes: [] }, ui: { contributions: [] },
    events: { publishes: [{ event_type_id: EVENT, type_version: 1 }], subscribes: [] }, actions: [preview.definition, ...ownDefinitions], action_scenes: [scene],
  }, event_types: [{ event_type_id: EVENT, type_version: 1, validate: payload => payload }], start(context) {
    services = context.services;
    return { kind: "app", views: [], actions: [preview.handler, ...ownDefinitions.map(definition => ({ ...definition, handle: caller => nestedHandle(definition.operation === "command" ? "command" : definition.action.execution?.cost === "metered" ? "paid" : "query", caller.beforeEffect) }))], action_scenes: [{
      ...scene,
      bindings: () => { read("bindings"); return [binding]; },
      targets: async caller => {
        read("targets");
        state.metadata = actions.client.discover(caller).map(value => value.capability_id);
        if (state.raw) await actions.client.invoke(caller, nestedDefinition("consumed", state.raw), {});
        if (state.scrubControl) alterView(caller);
        if (state.nested && !state.mutation) await nested();
        return [{ binding_id: "one", title: "One", revision: "1" }];
      },
      prepare: (_caller, event) => { read("prepare"); return { input: event }; },
      availability: () => { read("availability"); return { available: true }; },
      configuration_availability: () => { read("configuration"); return { available: true }; },
      bind: caller => mutate("bind", caller), consume: caller => mutate("consume", caller), failed: caller => mutate("failed", caller),
    }] };
  } };
  const platform = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "owner", db: store.db, journal: store, artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest), home: { directory, completeText: () => null, stores: homeStores() } });
  const registerJudgment = () => actions.registry.registerProvider({ provider: { provider_id: "scene-judgment", kind: "system", title: "判断探针" },
    definitions: [judgment], handlers: [{ ...judgment, handle: () => { if (state.failJudgment) throw new Error("judgment failed"); return true; } }] });
  let disposeJudgment = registerJudgment();
  t.after(async () => {
    state.release.resolve(); disposeJudgment();
    try { await platform.closeCoordination(); for (const install of platform.runtime.list()) if (install.state === "running") await platform.runtime.stop(install.install_id); }
    finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  assert.deepEqual((await platform.start([{ definition, trust: { level: "host" }, releaseArtifact: { capture: () => "export {}", restore: () => definition } }])).running, [ID]);
  services!.storage!.set("seed", "readable");
  const caller = (): ActionCallContext => ({ actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [PERMISSION] });
  const invoke = (kind: Mutation, context = caller()) => {
    state.mutation = kind; state.failJudgment = kind === "failed";
    return kind === "bind" ? actions.client.bind(context, binding, { provider_id: actions.client.discoverScenes(context).find(value => value.definition.scene_id === scene.scene_id)!.provider.provider_id, expected_revision: "1" })
      : actions.client.runScene(context, scene, binding.binding_id, {});
  };
  const written = () => ({ storage: services!.storage!.get("written"), events: platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT).length,
    artifact: artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, "scene-result") ?? null });
  return { state, actions: actions.client, caller, invoke, written, binding,
    replaceJudgment: () => { disposeJudgment(); disposeJudgment = registerJudgment(); },
    replaceScene: async () => { const install = platform.runtime.list()[0]!; await platform.runtime.stop(install.install_id); await platform.runtime.start(install.install_id); } };
}

for (const target of ["storage", "event", "artifact"] as const) {
  test(`S18-SCENE-READ ${target}: every read callback refuses a direct write while ordinary reads succeed`, async t => {
    const fixture = await setup(t), { state, actions, caller } = fixture;
    state.target = target;
    for (const callback of ["bindings", "targets", "prepare", "availability", "configuration"] as const) {
      state.read = callback;
      const invoke = () => callback === "bindings" ? actions.usages(caller()) : callback === "prepare" ? actions.runScene(caller(), scene, "one", {})
        : callback === "targets" ? actions.targets(caller()) : Promise.resolve().then(() => actions.discoverScenes(caller()));
      await assert.rejects(invoke(), { code: "actions.forbidden" }, callback);
      assert.deepEqual(fixture.written(), { storage: null, events: 0, artifact: null }, callback);
    }
    state.read = undefined;
    assert.equal((await actions.targets(caller())).length, 1);
    assert.equal((await actions.usages(caller())).length, 1);
    await actions.runScene(caller(), scene, "one", {});
    assert.ok(state.reads > 0);
  });
}

for (const mutation of ["bind", "consume", "failed"] as const) {
  test(`S18-SCENE-WRITE ${mutation}: awaits preserve cancellation, authority and original registrations`, async t => {
    for (const failure of ["revoke", "cancel", "judgment", "scene"] as const) for (const checked of [false, true]) {
      const fixture = await setup(t), { state } = fixture, abort = new AbortController();
      state.checked = checked; state.scrubControl = true;
      let revoked = false;
      const caller = { ...fixture.caller(), signal: abort.signal,
        assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "caller was revoked"); } };
      const pending = fixture.invoke(mutation, caller).then(() => undefined, (error: unknown) => error);
      await Promise.race([state.entered.promise, pending.then(result => { if (result) throw result; })]);
      if (failure === "revoke") revoked = true;
      else if (failure === "cancel") abort.abort();
      else if (failure === "judgment") fixture.replaceJudgment();
      else await fixture.replaceScene();
      state.release.resolve();
      const outcome = await pending;
      assert.ok(outcome instanceof Error, `${failure}/${checked}: write was refused`);
      if (failure === "cancel") assert.equal(outcome.name, "AbortError");
      if (failure === "judgment") assert.equal((outcome as { code?: string }).code, "actions.provider_changed");
      assert.equal(state.writes, 0);
      assert.deepEqual(fixture.written(), { storage: null, events: 0, artifact: null });
    }
    const fixture = await setup(t);
    fixture.state.checked = true; fixture.state.release.resolve();
    await fixture.invoke(mutation);
    assert.equal(fixture.state.writes, 1);
    assert.equal(fixture.written().storage, "yes");
  });

  test(`S18-SCENE-END ${mutation}: returned and thrown callbacks cannot leave a writer running`, async t => {
    for (const throwAfterLeave of [false, true]) {
      const fixture = await setup(t), { state } = fixture;
      state.leave = true; state.throwAfterLeave = throwAfterLeave;
      if (throwAfterLeave) await assert.rejects(fixture.invoke(mutation), /callback failed/);
      else await fixture.invoke(mutation);
      state.release.resolve();
      await assert.rejects(state.late!, { code: "actions.expired" });
      assert.equal(state.writes, 0);
      assert.deepEqual(fixture.written(), { storage: null, events: 0, artifact: null });
    }
  });
}

test("S18-SCENE-READ a scene cannot impersonate a concurrent action to call the model", async t => {
  const fixture = await setup(t);
  fixture.state.model = true;
  await assert.rejects(fixture.invoke("consume"), { code: "plugin.model_action_required" });
  assert.equal(fixture.state.writes, 0);
});

// S18-SCENE-NESTED: dispatchers use registered operation/cost, and preserve the real scene after crossing providers.
for (const route of ["own", "consumed"] as const) {
  test(`S18-SCENE-NESTED ${route}: read callbacks allow queries but refuse writes and metered queries`, async t => {
    const fixture = await setup(t), { state } = fixture;
    state.nested = { route, operation: "query" }; state.scrubControl = true;
    const references = [judgment, ...(["query", "command", "paid"] as const).map(operation => nestedDefinition("own", operation))];
    const caller = { ...fixture.caller(), allowed_actions: references.map(value => ({ capability_id: value.capability_id, version: value.version })),
      allowed_capability_ids: references.map(value => value.capability_id) };
    assert.equal((await fixture.actions.targets(caller)).length, 1);
    assert.deepEqual(caller.permissions, [PERMISSION]);
    assert.equal(caller.allowed_actions[0]!.capability_id, judgment.capability_id);
    assert.equal(caller.allowed_capability_ids[0], judgment.capability_id);
    assert.equal(state.nestedReads, 1);
    assert.ok(state.metadata.includes(judgment.capability_id), "authorized judgment metadata remains visible");
    assert.ok(state.metadata.includes(nestedDefinition("own", "command").capability_id));
    for (const operation of ["command", "paid"] as const) {
      state.nested = { route, operation, spoof: operation === "paid" };
      await assert.rejects(fixture.actions.targets(fixture.caller()), error => error instanceof ActionError && ["actions.forbidden", "actions.dependency_missing"].includes(error.code));
      assert.equal(state.nestedWrites, 0);
    }
  });
  test(`S18-SCENE-NESTED ${route}: a child waiting to write still checks its original scene`, async t => {
    for (const failure of ["revoke", "cancel", "judgment", "scene", "none"] as const) {
      const fixture = await setup(t), { state } = fixture, abort = new AbortController();
      state.nested = { route, operation: "command" }; state.holdChild = true; state.scrubControl = true;
      let revoked = false;
      const caller = { ...fixture.caller(), signal: abort.signal,
        assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "original scene revoked"); } };
      const pending = fixture.invoke("consume", caller).then(() => undefined, (error: unknown) => error);
      await Promise.race([state.entered.promise, pending.then(result => { if (result) throw result; })]);
      if (failure === "revoke") revoked = true;
      else if (failure === "cancel") abort.abort();
      else if (failure === "judgment") fixture.replaceJudgment();
      else if (failure === "scene") await fixture.replaceScene();
      state.release.resolve();
      const result = await pending;
      if (failure === "none") { assert.equal(result, undefined); assert.equal(state.nestedWrites, 1); }
      else { assert.ok(result instanceof Error, failure); assert.equal(state.nestedWrites, 0, failure); }
    }
  });
}

test("S18-SCENE-READ Kernel metadata inspection does not authorize command or metered execution", async t => {
  const fixture = await setup(t);
  for (const operation of ["command", "paid"] as const) {
    fixture.state.raw = operation;
    await assert.rejects(fixture.actions.targets(fixture.caller()), { code: "actions.forbidden" });
    assert.ok(fixture.state.metadata.includes(nestedDefinition("consumed", operation).capability_id));
    assert.equal(fixture.state.nestedWrites, 0);
  }
  fixture.state.raw = "query";
  await fixture.actions.targets(fixture.caller());
  assert.equal(fixture.state.nestedReads, 1);
});
