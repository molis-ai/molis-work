import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSceneBinding, type ActionSceneClient, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-89 (PG-032 P1): a plugin reaches the kernel's scene client only through `services.scenes`, for the scenes its own Manifest declares,
// from inside its own running action, as that action's original caller. The scenes of anyone else are refused and do not show up; a
// stopped, revoked, cancelled or borrowed service does nothing; the kernel's own checks stay.

const SCENES = "scenes:use";
const textInput = { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"], additionalProperties: false };
const decisionOutput = { type: "object", properties: { follow_up: { type: "boolean" } }, required: ["follow_up"], additionalProperties: false };
const judgment: ActionDefinition = { capability_id: "judgments.scene-client", version: 1, operation: "command",
  action: { title: "判断", description: "判断一段文字", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp", "agent"], permissions: [],
    subject_kinds: ["feedback"], input_schema: textInput, output_schema: decisionOutput } };

interface StepInput { readonly step: string; readonly scene?: string; readonly version?: number; readonly binding?: string; readonly project?: string }
interface ProbeOptions { readonly grants?: readonly string[]; readonly scene?: boolean; readonly sceneId?: string }

const bindingOf = (scene: string, id: string, project: string | null = DEMO_PROJECT_ID, version = 1): ActionSceneBinding => ({ binding_id: id, scene_id: scene, scene_version: version,
  project_id: project, function: { capability_id: judgment.capability_id, version: 1 }, enabled: true, title: "绑定", href: "/x" });

/** A plugin of the test: three actions (concurrent, serial, query) that make the scene-client call `step` names, and a scene of its own unless told not. */
function probe(short: string, options: ProbeOptions = {}) {
  const id = `io.molis.work.example.${short}`, grants = options.grants ?? [SCENES], hasScene = options.scene ?? true;
  const scene: ActionSceneDefinition = { scene_id: options.sceneId ?? `${id}.arrived`, version: 1, title: "到达", description: "处理到达的文字", trigger: "arrived", scope: "project",
    subject_kinds: ["feedback"], input_schema: textInput, result_schema: decisionOutput, permissions: [], configuration_permissions: [] };
  const state = { services: undefined as PluginHostServices | undefined, value: undefined as unknown, error: undefined as unknown, hook: () => {}, consumed: [] as unknown[],
    bindings: new Map<string, ActionSceneBinding>() };
  const define = (name: string, operation: "command" | "query", scheduling?: "concurrent"): ActionDefinition<StepInput, boolean> => ({ capability_id: `${id}.${name}`, version: 1, operation,
    action: { scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], title: name, description: name, kind: operation === "query" ? "query" : "operation",
      ...(scheduling ? { scheduling } : {}),
      input_schema: { type: "object", required: ["step"], properties: { step: { type: "string" }, scene: { type: "string" }, version: { type: "integer" }, binding: { type: "string" }, project: { type: "string" } } },
      output_schema: { type: "boolean" } } });
  const wait = define("wait", "command", "concurrent"), serial = define("serial", "command"), look = define("look", "query");
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${short}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: grants.map(permission => ({ permission, required: true, reason: "用自己的场景" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [wait, serial, look],
    ...(hasScene ? { action_scenes: [scene] } : {}), upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
  const attempt = (input: StepInput) => {
    const scenes = state.services!.scenes!, sceneId = input.scene ?? scene.scene_id, version = input.version ?? 1;
    switch (input.step) {
      case "discover": return scenes.discoverScenes(judgment);
      case "usages": return scenes.usages();
      case "targets": return scenes.targets();
      case "targets-scene": return scenes.targets(undefined, { scene_id: sceneId, scene_version: version, provider_id: id });
      case "bind": return scenes.bind(bindingOf(sceneId, input.binding ?? "own-binding", input.project === undefined ? DEMO_PROJECT_ID : input.project, version));
      case "bind-unknown": return scenes.bind({ ...bindingOf(sceneId, "unknown-function"), function: { capability_id: "judgments.nope", version: 1 } });
      case "run": return scenes.runScene({ scene_id: sceneId, version }, input.binding ?? "own-binding", { text: "hello" });
      case "revoked": state.hook(); return scenes.usages();
      case "borrow": return state.services!.scenes!.usages();
      default: throw new Error(`unknown step ${input.step}`);
    }
  };
  const handler = (definition: ActionDefinition<StepInput, boolean>) => ({ ...definition, handle: async (_caller: ActionCallContext, raw: unknown) => {
    try { state.value = await attempt(raw as StepInput); state.error = undefined; } catch (error) { state.value = undefined; state.error = error; }
    return true;
  } });
  const definition: PluginDefinition = { manifest, async start(context) {
    state.services = context.services;
    return { kind: "app", views: [], actions: [handler(wait), handler(serial), handler(look)],
      ...(hasScene ? { action_scenes: [{ scene_id: scene.scene_id, version: 1, bindings: () => [...state.bindings.values()],
        targets: () => [...state.bindings.values()].map(({ binding_id, title }) => ({ binding_id, title, revision: null })),
        bind: (_caller: ActionCallContext, value: ActionSceneBinding) => { state.bindings.set(value.binding_id, value); },
        consume: (_caller: ActionCallContext, input: unknown) => { state.consumed.push(input); return { ok: true }; } }] } : {}) };
  } };
  return { id, short, scene, definition, state, wait, serial, look };
}

async function platform(t: TestContext, wrap?: (scenes: ActionSceneClient) => ActionSceneClient) {
  const home = mkdtempSync(join(tmpdir(), "plugin-scenes-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID), hosted = wrap ? { ...actions, scenes: wrap(actions.scenes) } : actions;
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions: hosted, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const main = probe("scenemain"), other = probe("sceneother"), ungranted = probe("sceneungranted", { grants: [] }), sceneless = probe("scenesceneless", { scene: false });
  const all = [main, other, ungranted, sceneless];
  const started = await running.start(all.map(item => ({ definition: item.definition, trust: { level: "host" as const } })));
  assert.deepEqual(started.running.toSorted(), all.map(item => item.id).toSorted(), JSON.stringify(started));
  actions.registry.registerProvider({ provider: { provider_id: "system-judgments", title: "判断", kind: "system" }, definitions: [judgment],
    handlers: [{ ...judgment, handle: (_caller, input) => ({ follow_up: (input as { text: string }).text.includes("hello") }) }] });
  return { running, registry: actions.registry, client: actions.client, main, other, ungranted, sceneless };
}

/** The original caller; `revoke` makes its last authority check fail from then on. */
function caller() {
  let refusal: ActionError | undefined;
  const context: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [], assert_authority_current: () => { if (refusal) throw refusal; } };
  return { context, revoke: () => { refusal = new ActionError("actions.forbidden", "the caller was revoked"); } };
}

type Env = Awaited<ReturnType<typeof platform>>;
/** Runs `step` inside the concurrent action of `item`, and gives what the scene-client call returned or threw. */
async function inAction(env: Env, item: ReturnType<typeof probe>, input: StepInput, which: "wait" | "serial" | "look" = "wait", who = caller()) {
  item.state.hook = who.revoke; item.state.value = undefined; item.state.error = undefined;
  await env.client.invoke(who.context, item[which], input);
  return { value: item.state.value, error: item.state.error as { code?: string; message?: string } | undefined };
}
const refused = (error: { code?: string; message?: string } | undefined, code: string, why?: RegExp) => error?.code === code && (why === undefined || why.test(error.message ?? ""));
const ids = (list: readonly { scene_id?: string; definition?: { scene_id: string } }[]) => list.map(item => item.scene_id ?? item.definition!.scene_id).toSorted();

test("RAC-830 S-89 the service exists only for a plugin that declares scenes:use and has scenes of its own", async t => {
  const env = await platform(t);
  assert.ok(env.main.state.services!.scenes, "a plugin with scenes:use and a scene has it");
  assert.equal(env.ungranted.state.services!.scenes, undefined, "a scene without scenes:use has no service, though its Manifest declares one");
  assert.equal(env.sceneless.state.services!.scenes, undefined, "scenes:use without a scene of its own has none");
});

test("RAC-831 S-89 a plugin binds, runs and lists its own scene, as the caller of its concurrent action", async t => {
  const env = await platform(t);
  assert.equal((await inAction(env, env.main, { step: "bind" })).error, undefined);
  assert.deepEqual(ids((await inAction(env, env.main, { step: "usages" })).value as never), [env.main.scene.scene_id]);
  assert.deepEqual(ids((await inAction(env, env.main, { step: "discover" })).value as never), [env.main.scene.scene_id]);
  const ran = await inAction(env, env.main, { step: "run" });
  assert.equal(ran.error, undefined, String(ran.error?.message));
  assert.deepEqual(env.main.state.consumed, [{ text: "hello" }], "the kernel ran the judgment and the scene's own consumer");
});

test("RAC-831 S-89 the scenes of another plugin cannot be bound, run or configured, and do not show up in a list", async t => {
  const env = await platform(t);
  await env.client.bind(caller().context, bindingOf(env.other.scene.scene_id, "their-binding"));
  assert.equal(env.other.state.bindings.size, 1, "the other plugin's scene is bound and live");
  for (const step of ["bind", "run", "targets-scene"]) {
    const { error } = await inAction(env, env.main, { step, scene: env.other.scene.scene_id, binding: "their-binding" });
    assert.ok(refused(error, "plugin.scene_not_declared"), `${step}: ${error?.code} ${error?.message}`);
  }
  assert.deepEqual(env.other.state.consumed, [], "nothing of the other plugin's scene ran");
  assert.equal(env.other.state.bindings.get("their-binding")!.title, "绑定", "its binding is untouched");
  await inAction(env, env.main, { step: "bind" });
  assert.deepEqual(ids((await inAction(env, env.main, { step: "usages" })).value as never), [env.main.scene.scene_id], "a list holds only the plugin's own");
  assert.deepEqual(ids((await inAction(env, env.main, { step: "targets" })).value as never).filter(id => id !== env.main.scene.scene_id), []);
  const host = await inAction(env, env.main, { step: "run", scene: "home.dock", binding: "home.dock:x" });
  assert.ok(refused(host.error, "plugin.scene_not_declared"), "a scene of the Host is not the plugin's either");
});

test("RAC-832 S-89 a scene that is not declared at that version, or not declared at all, is refused", async t => {
  const env = await platform(t);
  const version = await inAction(env, env.main, { step: "bind", version: 2 });
  assert.ok(refused(version.error, "plugin.scene_not_declared"), "the Manifest declares version 1");
  const unknown = await inAction(env, env.main, { step: "run", scene: `${env.main.id}.never-declared` });
  assert.ok(refused(unknown.error, "plugin.scene_not_declared"));
  assert.equal(env.main.state.bindings.size, 0);
});

test("RAC-833 S-89 a stopped installation and a handle kept past the action do nothing", async t => {
  const env = await platform(t);
  const kept = env.main.state.services!.scenes!;
  await assert.rejects(kept.usages(), (error: ActionError) => error.code === "actions.forbidden", "outside every action there is no caller to act for");
  await assert.rejects(kept.runScene({ scene_id: env.main.scene.scene_id, version: 1 }, "x", { text: "hello" }), (error: ActionError) => error.code === "actions.forbidden");
  const install = env.running.runtime.list().find(item => item.plugin_id === env.main.id)!;
  await env.running.runtime.stop(install.install_id);
  // A stopped activation's services do nothing for code it left running (BL-411): the call never answers with the kernel's scenes.
  const after = await Promise.race([kept.usages().then(value => ({ value }), (error: unknown) => ({ error })), new Promise<"pending">(resolve => setTimeout(() => resolve("pending"), 200))]);
  assert.ok(after === "pending" || (after as { error?: ActionError }).error?.code === "actions.forbidden", JSON.stringify(after));
});

test("RAC-833 S-89 a caller revoked while the action runs gets nothing from the next call", async t => {
  const env = await platform(t);
  const { error } = await inAction(env, env.main, { step: "revoked" });
  assert.ok(refused(error, "actions.forbidden", /the caller was revoked/), `${error?.code} ${error?.message}`);
});

test("RAC-834 S-89 a service reached through one installation is refused inside another installation's action, and a project that is not the call's", async t => {
  const env = await platform(t);
  // The other plugin's action reaches the main plugin's service.
  env.other.state.services = { ...env.other.state.services, scenes: env.main.state.services!.scenes } as PluginHostServices;
  const borrowed = await inAction(env, env.other, { step: "borrow" });
  assert.ok(refused(borrowed.error, "actions.forbidden", /本插件正在执行的动作/), `${borrowed.error?.code} ${borrowed.error?.message}`);
  const elsewhere = await inAction(env, env.main, { step: "bind", project: "another-project" });
  assert.ok(refused(elsewhere.error, "actions.scope_mismatch"), `${elsewhere.error?.code} ${elsewhere.error?.message}`);
  assert.equal(env.main.state.bindings.size, 0);
});

test("RAC-835 S-89 the kernel's checks are the ones that apply: an unknown judgment function and a missing binding are refused as they are for any caller", async t => {
  const env = await platform(t);
  const unknown = await inAction(env, env.main, { step: "bind-unknown" });
  assert.ok(refused(unknown.error, "actions.scene_incompatible"), `${unknown.error?.code} ${unknown.error?.message}`);
  assert.equal(env.main.state.bindings.size, 0);
  assert.equal((await inAction(env, env.main, { step: "bind" })).error, undefined);
  const missing = await inAction(env, env.main, { step: "run", binding: "no-such-binding" });
  assert.ok(refused(missing.error, "actions.binding_missing"), `${missing.error?.code} ${missing.error?.message}`);
  const kernel = await env.client.runScene(caller().context, env.main.scene, "own-binding", { text: "hello" });
  assert.deepEqual(kernel, { ok: true }, "the same scene run directly gives the same result");
});

test("RAC-836 S-89 runScene waits for a judgment, so only a concurrent action may call it; a query action changes nothing", async t => {
  const env = await platform(t);
  await inAction(env, env.main, { step: "bind" });
  const serial = await inAction(env, env.main, { step: "run" }, "serial");
  assert.ok(refused(serial.error, "actions.forbidden", /并行/), `${serial.error?.code} ${serial.error?.message}`);
  const query = await inAction(env, env.main, { step: "bind", binding: "from-query" }, "look");
  assert.ok(refused(query.error, "actions.forbidden", /只读/), `${query.error?.code} ${query.error?.message}`);
  const queryRun = await inAction(env, env.main, { step: "run" }, "look");
  assert.ok(refused(queryRun.error, "actions.forbidden", /只读/), `${queryRun.error?.code} ${queryRun.error?.message}`);
  assert.deepEqual(env.main.state.consumed, [], "no judgment ran");
  assert.equal(env.main.state.bindings.has("from-query"), false);
  assert.deepEqual(ids((await inAction(env, env.main, { step: "usages" }, "look")).value as never), [env.main.scene.scene_id], "a query action may read");
});

test("RAC-838 S-89 a second provider cannot register a scene id that is taken, so a Manifest cannot claim another provider's scene", async t => {
  const env = await platform(t);
  const clash = probe("sceneclash", { sceneId: env.main.scene.scene_id });
  const started = await env.running.start([{ definition: clash.definition, trust: { level: "host" as const } }]);
  assert.equal(started.running.includes(clash.id), false, JSON.stringify(started));
  assert.match(JSON.stringify(started.failed), /消费场景重复/, "the kernel refuses the second registration of the id");
  const system: ActionSceneDefinition = { ...env.main.scene, scene_id: "system.taken", title: "系统场景" };
  env.registry.registerProvider({ provider: { provider_id: "system-scenes", title: "系统", kind: "system" }, definitions: [], handlers: [], scenes: [system],
    scene_handlers: [{ scene_id: system.scene_id, version: 1, bindings: () => [], bind: () => {}, consume: () => ({}) }] });
  const squat = probe("scenesquat", { sceneId: system.scene_id });
  const squatted = await env.running.start([{ definition: squat.definition, trust: { level: "host" as const } }]);
  assert.equal(squatted.running.includes(squat.id), false, JSON.stringify(squatted));
  assert.match(JSON.stringify(squatted.failed), /消费场景重复/);
  assert.notEqual(env.running.runtime.list().find(item => item.plugin_id === squat.id)?.state, "running", "the squatter is not running: its actions were never registered and its activation is stopped");
  assert.equal((await inAction(env, env.main, { step: "bind" })).error, undefined, "the first provider's scene still works");
});

test("RAC-839 S-89 an id that the Manifest declares but another provider holds is refused by bind and runScene, though the kernel resolves it", async t => {
  const calls: string[] = [];
  const env = await platform(t, scenes => ({
    discoverScenes: async (caller, judgment) => (await scenes.discoverScenes(caller, judgment)).map(view => ({ ...view, provider: { ...view.provider, plugin_id: "io.molis.work.someone-else" } })),
    usages: (caller, judgment) => scenes.usages(caller, judgment),
    targets: (caller, judgment, scene) => scenes.targets(caller, judgment, scene),
    bind: (caller, binding, options) => { calls.push("bind"); return scenes.bind(caller, binding, options); },
    runScene: (caller, scene, bindingId, event) => { calls.push("run"); return scenes.runScene(caller, scene, bindingId, event); },
  }));
  for (const step of ["bind", "run"]) {
    const { error } = await inAction(env, env.main, { step });
    assert.ok(refused(error, "plugin.scene_not_declared", /别的提供方/), `${step}: ${error?.code} ${error?.message}`);
  }
  assert.deepEqual(calls, [], "the kernel was not asked to bind or run it");
  assert.deepEqual((await inAction(env, env.main, { step: "discover" })).value, [], "and a list shows none of them as the plugin's");
});

for (const step of ["usages", "targets"] as const) test(`RAC-839 S-89 ${step} hides a declared id held by another provider or missing from the current directory`, async t => {
  let ownership: "own" | "other" | "missing" = "own", claimedScene = "";
  let sceneClient: ActionSceneClient | undefined;
  // The same provider-view seam as RAC-839 above; binding and target rows still come from the real kernel and scene callbacks.
  const env = await platform(t, scenes => (sceneClient = {
    discoverScenes: async (caller, judgment) => (await scenes.discoverScenes(caller, judgment)).flatMap(view => {
      if (view.definition.scene_id !== claimedScene || ownership === "own") return [view];
      return ownership === "missing" ? [] : [{ ...view, provider: { ...view.provider, plugin_id: "io.molis.work.someone-else" } }];
    }),
    usages: (caller, judgment) => scenes.usages(caller, judgment),
    targets: (caller, judgment, scene) => scenes.targets(caller, judgment, scene),
    bind: (caller, binding, options) => scenes.bind(caller, binding, options),
    runScene: (caller, scene, bindingId, event) => scenes.runScene(caller, scene, bindingId, event),
  }));
  claimedScene = env.main.scene.scene_id;
  await env.client.bind(caller().context, bindingOf(claimedScene, "claimed-binding"));
  await env.client.bind(caller().context, bindingOf(env.other.scene.scene_id, "other-binding"));
  const before = structuredClone({ claimed: [...env.main.state.bindings.values()], other: [...env.other.state.bindings.values()] });
  try {
    const raw = await env.client[step](caller().context);
    assert.deepEqual(raw.map(row => row.binding_id).toSorted(), ["claimed-binding", "other-binding"], "the real kernel returned non-empty binding/target data");
    for (const current of ["own", "other", "missing", "own"] as const) {
      ownership = current;
      const resolved = (await sceneClient!.discoverScenes(caller().context)).find(view => view.definition.scene_id === claimedScene && view.definition.version === env.main.scene.version);
      assert.equal(resolved?.provider.plugin_id, current === "missing" ? undefined : current === "own" ? env.main.id : "io.molis.work.someone-else", "the declared id/version really resolves to this current provider at the service port");
      const listed = await inAction(env, env.main, { step }, "look");
      assert.equal(listed.error, undefined, `${step}: ${listed.error?.code} ${listed.error?.message}`);
      const expected = current === "own" ? ["claimed-binding"] : [];
      assert.deepEqual((listed.value as readonly { binding_id: string }[]).map(row => row.binding_id), expected, `${step}: current provider is ${current}`);
      if (step === "targets") {
        const selected = await inAction(env, env.main, { step: "targets-scene" }, "look");
        assert.equal(selected.error, undefined);
        assert.deepEqual((selected.value as readonly { binding_id: string }[]).map(row => row.binding_id), expected, "an explicit declared scene uses the same current-provider boundary");
      }
    }
    const other = await inAction(env, env.other, { step }, "look");
    assert.equal(other.error, undefined);
    assert.deepEqual((other.value as readonly { binding_id: string }[]).map(row => row.binding_id), ["other-binding"], "the other plugin can still list its own legitimate data");
  } finally {
    assert.deepEqual({ claimed: [...env.main.state.bindings.values()], other: [...env.other.state.bindings.values()] }, before, "listing never edits either provider's bindings, even when an assertion fails");
  }
});

test("RAC-833 S-89 a caller revoked while the kernel reads a list receives no result", async t => {
  let revoke = () => {};
  const env = await platform(t, scenes => ({
    discoverScenes: (caller, judgment) => scenes.discoverScenes(caller, judgment),
    usages: async (caller, judgment) => { const value = await scenes.usages(caller, judgment); revoke(); return value; },
    targets: async (caller, judgment, scene) => { const value = await scenes.targets(caller, judgment, scene); revoke(); return value; },
    bind: (caller, binding, options) => scenes.bind(caller, binding, options),
    runScene: (caller, scene, bindingId, event) => scenes.runScene(caller, scene, bindingId, event),
  }));
  await env.client.bind(caller().context, bindingOf(env.main.scene.scene_id, "read-binding"));
  const before = structuredClone([...env.main.state.bindings.values()]);
  for (const step of ["usages", "targets"] as const) {
    const who = caller(); revoke = who.revoke;
    const result = await inAction(env, env.main, { step }, "look", who);
    assert.ok(refused(result.error, "actions.forbidden", /the caller was revoked/), `${step}: ${result.error?.code} ${result.error?.message}`);
    assert.equal(result.value, undefined, "the caller is checked again before the list can be returned");
  }
  assert.deepEqual([...env.main.state.bindings.values()], before);
});
