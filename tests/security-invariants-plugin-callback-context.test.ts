import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActionCallContext, ActionDefinition, ActionExecutionContext, ActionProviderRegistration, ActionSceneBinding, ActionSceneDefinition,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";

const pluginId = "io.molis.work.example.callbackcontext";
const action: ActionDefinition = { capability_id: "callbackcontext.read", version: 1, operation: "query", action: {
  title: "Read", description: "Read through the installed action", kind: "query", scope: "project", audiences: ["user"], permissions: [],
  subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "boolean" },
} };
const scene: ActionSceneDefinition = { scene_id: "callbackcontext.scene", version: 1, title: "Scene", description: "Read and consume in the installed scene",
  trigger: "manual", scope: "project", subject_kinds: [], permissions: [], input_schema: { type: "object" }, result_schema: { type: "boolean" } };
const binding: ActionSceneBinding = { binding_id: "one", scene_id: scene.scene_id, scene_version: scene.version, project_id: "sample",
  function: { capability_id: "callbackcontext.judgment", version: 1, provider_id: "test-judgment" }, enabled: true, title: "One", revision: "1" };

test("BRC-01 BSH-12 · each Runtime callback copies references on its first read", async t => {
  const seen: ActionCallContext[] = [], registrations: ActionProviderRegistration[] = [];
  const capture = (view: ActionCallContext): true => { seen.push(view); return true; };
  const definition: PluginDefinition = {
    manifest: { schema_version: 1, host_api_version: 1, plugin_id: pluginId, version: "1.0.0", name: "Callback context", kind: "app",
      publisher: { publisher_id: "callbackcontext", signature: "test-callbackcontext" }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
      ui: { contributions: [] }, actions: [action], action_scenes: [scene] },
    start: async () => ({ kind: "app", views: [], actions: [{ ...action, handle: capture, availability: caller => ({ available: capture(caller) }) }],
      action_scenes: [{ ...scene, bindings: caller => { capture(caller); return [binding]; },
        bind: () => undefined, consume: capture }] }),
  };
  // The port receives the actual bindings the Kernel dispatches. Calling them here also exposes the empty-list shape,
  // which the Kernel normally rejects before selecting any action.
  const runtime = new PluginRuntime(undefined, undefined, {
    hostIds: new Set([pluginId]), actions: { project_id: "sample", registry: {
      registerProvider(registration) {
        registrations.push(registration);
        return () => { registrations.pop(); };
      },
    } },
  });
  const install = runtime.install({ definition, deployment: "local", trust: { level: "host" } }).install;
  t.after(async () => { await runtime.stop(install.install_id); });
  assert.equal((await runtime.start(install.install_id)).install.state, "running");
  const [registered] = registrations;
  assert.ok(registered);
  const [handler] = registered.handlers, [consumer] = registered.scene_handlers ?? [];
  assert.ok(handler?.availability && consumer);
  const callbacks = {
    action: (caller: ActionExecutionContext) => handler.handle(caller, {}),
    availability: (caller: ActionExecutionContext) => handler.availability!(caller),
    sceneRead: (caller: ActionExecutionContext) => consumer.bindings(caller),
    sceneWrite: (caller: ActionExecutionContext) => consumer.consume(caller, {}, true, { binding }),
  };
  const caller: ActionExecutionContext = { actor_id: "person", audience: "user", project_id: "sample", permissions: [], beforeEffect: async () => undefined };
  let copies = 0;
  // The symbol is not read by authorization or JSON. The original getter runs when a reference is copied by spread.
  const copied = Symbol("reference copy");
  const source = [action.capability_id, binding.function.capability_id].map(capability_id => ({
    capability_id, version: 1,
    get [copied]() { copies++; return true; },
  }));
  const scoped = { ...caller, allowed_actions: source };

  for (const [name, invoke] of Object.entries(callbacks)) {
    const view = async (input: ActionExecutionContext): Promise<ActionCallContext> => {
      const index = seen.length;
      await invoke(input);
      assert.equal(seen.length, index + 1, name);
      return seen[index]!;
    };
    copies = 0;
    const first = await view(scoped), second = await view(scoped), overwritten = await view(scoped);
    assert.ok(Object.keys(first).includes("allowed_actions"), name);
    assert.equal(copies, 0, `${name} must hand the plugin its view without copying references`);

    assert.ok(Reflect.set(overwritten, "allowed_actions", undefined));
    assert.equal(overwritten.allowed_actions, undefined);
    assert.equal(Object.hasOwn(overwritten, "allowed_actions"), true);
    assert.equal(copies, 0, `${name} setting the field before its first read skips the copy`);

    const own = first.allowed_actions!;
    assert.equal(copies, source.length, name);
    assert.notEqual(own, source);
    assert.ok(own.every((reference, index) => reference !== source[index]));
    assert.ok(Reflect.set(own[0]!, "capability_id", "forged.action"));
    assert.ok(Reflect.set(own, "length", 1));
    assert.equal(first.allowed_actions, own);
    assert.equal(first.allowed_actions?.[0]?.capability_id, "forged.action");
    assert.deepEqual(source.map(reference => reference.capability_id), [action.capability_id, binding.function.capability_id]);

    const serialized = JSON.parse(JSON.stringify(second));
    assert.deepEqual(serialized.allowed_actions, source.map(({ capability_id, version }) => ({ capability_id, version })));
    const expanded = { ...second };
    assert.equal(expanded.allowed_actions, second.allowed_actions);
    assert.notEqual(expanded.allowed_actions, own);
    assert.equal(copies, 2 * source.length, name);

    assert.equal(Object.hasOwn(await view(caller), "allowed_actions"), false, name);
    const empty: [] = [];
    const emptyView = await view({ ...caller, allowed_actions: empty });
    assert.ok(Object.keys(emptyView).includes("allowed_actions"), name);
    assert.deepEqual(emptyView.allowed_actions, []);
    assert.notEqual(emptyView.allowed_actions, empty, name);
    assert.equal(emptyView.allowed_actions, emptyView.allowed_actions, name);
  }
});
