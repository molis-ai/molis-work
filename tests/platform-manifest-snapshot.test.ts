import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginRuntimeRepository, PluginRuntime, PluginSupervisor, UNSIGNED_TRUST, definitionOrigin, isFrozenRegisteredManifest,
  platformDefinition } from "@molis-ai/molis-work-plugin-runtime";
import { captureRuntimeStageOwner } from "@molis-ai/molis-work-app-local-host";

/**
 * T402 stage owner fence and S-75 (SECURITY-INVARIANTS「Home 的提供方、库归属只认宿主实际定义对象」): the platform keeps a deep-frozen copy
 * of the Manifest it is handed and reads only that copy, so the caller changing its own declaration has no effect on the running
 * instance, and the fence no longer re-serializes the copy on every check. The platform's view of a definition is still the Host's
 * object for every identity the Host keyed by it, and a copy of that view is not.
 */
const ID = "io.molis.work.frozen-manifest-probe";
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function probe(manifestTweak?: (manifest: PluginManifest) => void) {
  const manifest = {
    schema_version: 1, host_api_version: 1, plugin_id: ID, version: "1.0.0", name: "Frozen probe", kind: "app",
    publisher: { publisher_id: "molis", signature: "frozen-manifest-probe" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [ID + ".main"], views: [{ view_id: "main", slot: "stage", title: "Main" }] },
    events: { publishes: [], subscribes: [] },
  } as PluginManifest;
  manifestTweak?.(manifest);
  const seen: { self?: unknown; starts: number } = { starts: 0 };
  const definition = {
    manifest,
    event_types: [],
    async start() {
      // A method runs with `this` as the object it was defined on, as when the Runtime called it on that object directly.
      seen.self = this; seen.starts++;
      return { kind: "app", views: [{ descriptor: { contribution_id: ID + ".main", kind: "primary-page", label: "m", slots: [] },
        render: () => "<p>stage</p>" }] };
    },
    async stop() {},
  } as PluginDefinition;
  return { definition, manifest, seen };
}

async function running(definition: PluginDefinition) {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition, grants: [] }]);
  assert.equal(supervisor.state(ID)?.status, "running");
  return { runtime, supervisor };
}

test("T402 the platform reads a deep-frozen copy of the Manifest: changing it is refused, and the caller's changes reach nothing running", async () => {
  const { definition, manifest, seen } = probe();
  const before = JSON.stringify(manifest);
  const { runtime, supervisor } = await running(definition);
  const platform = supervisor.manifest(ID)!;
  assert.notEqual(platform, manifest, "the platform holds its own copy");
  assert.equal(JSON.stringify(platform), before);
  assert.equal(isFrozenRegisteredManifest(platform), true);
  assert.equal(isFrozenRegisteredManifest(manifest), false, "the caller's object is left as it was, unfrozen");
  assert.ok(Object.isFrozen(platform) && Object.isFrozen(platform.ui.views![0]) && Object.isFrozen(platform.permissions), "every level of the copy is frozen");
  assert.throws(() => { (platform as { name: string }).name = "Renamed"; }, TypeError);
  assert.throws(() => { (platform.ui.views![0] as { title: string }).title = "Retitled"; }, TypeError);
  assert.throws(() => { (platform.permissions as unknown[]).push({ permission: "storage:private", required: false, reason: "late" }); }, TypeError);
  assert.equal(seen.self, definition, "the plugin's method ran with `this` as its own object");

  const owner = captureRuntimeStageOwner({ runtime, supervisor }, "project", { project_plugin_id: "frozen-probe", manifest })!;
  assert.ok(owner, "the running instance owns its stage");
  assert.equal(owner.entry.manifest, platform, "the owner is judged on the platform's copy");
  const record = runtime.get(owner.install_id);
  const rendered = owner.view.render({} as never);

  // The caller that handed the definition over changes its declaration in place, and then replaces it outright.
  Object.assign(manifest, { name: "Changed by the caller", version: "9.9.9" });
  (manifest.ui.views![0] as { slot: string }).slot = "island";
  (manifest.permissions as unknown[]).push({ permission: "storage:private", required: true, reason: "late" });
  Object.assign(definition, { manifest: { ...manifest, plugin_id: "io.molis.work.other" } });

  assert.equal(supervisor.manifest(ID), platform, "the running instance keeps the same Manifest");
  assert.equal(JSON.stringify(platform), before, "and its content");
  assert.doesNotThrow(() => owner.assertCurrent(), "the owner fence still holds");
  const again = captureRuntimeStageOwner({ runtime, supervisor }, "project", { project_plugin_id: "frozen-probe", manifest: platform })!;
  assert.equal(again.install_id, owner.install_id);
  assert.equal(again.producer, owner.producer, "the same owner is judged");
  assert.deepEqual(runtime.get(owner.install_id), record, "the install record is unchanged");
  assert.equal(owner.view.render({} as never), rendered, "the stage reads the same");

  // Every other part of the fence is still checked: a stopped instance is refused.
  supervisor.revoke(ID);
  assert.throws(() => owner.assertCurrent(), code("actions.provider_changed"));
});

test("T402 a declaration that is not plain data is not copied, and the fence keeps comparing its serialization", async () => {
  let label = "Accessor probe";
  const { definition, manifest } = probe(value => { Object.defineProperty(value, "name", { enumerable: true, configurable: true, get: () => label }); });
  const withFunction = probe(value => { Object.defineProperty(value, "~standard", { value: { validate: () => ({}) }, enumerable: false }); });
  assert.equal(platformDefinition(withFunction.definition), withFunction.definition, "a hidden function-valued key is not copied away silently");
  const { runtime, supervisor } = await running(definition);
  assert.equal(supervisor.manifest(ID), manifest, "the platform reads the caller's object as before");
  assert.equal(isFrozenRegisteredManifest(manifest), false);
  assert.equal(Object.isFrozen(manifest), false, "nothing is frozen");
  const owner = captureRuntimeStageOwner({ runtime, supervisor }, "project", { project_plugin_id: "frozen-probe", manifest })!;
  assert.doesNotThrow(() => owner.assertCurrent());
  label = "Changed after capture";
  assert.throws(() => owner.assertCurrent(), code("actions.provider_changed"), "a changed serialization is still refused");
});

test("S-75 the platform's view of the Host's definition is admitted as that object; a copy of the view is not", async () => {
  const { definition } = probe();
  const view = platformDefinition(definition);
  assert.notEqual(view, definition);
  assert.equal(definitionOrigin(view), definition, "the view answers as the Host's object");
  assert.equal(platformDefinition(definition), view, "the same view while the declaration is unchanged");
  assert.equal(platformDefinition(view), view);
  const copy = { ...view };
  assert.equal(definitionOrigin(copy), copy, "a copy of the view is its own object, not the Host's");
  assert.notEqual(copy.manifest, definition.manifest);

  const admitted = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, inProcess: { admit: new Set([definition]) } });
  assert.throws(() => admitted.install({ definition: copy, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"), "a copy of the view");
  assert.throws(() => admitted.install({ definition: { ...definition }, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.in_process_denied"), "a copy of the Host's object");
  const { install } = admitted.install({ definition: view, deployment: "local", grants: [], trust: UNSIGNED_TRUST });
  await admitted.start(install.install_id);
  assert.equal(admitted.get(install.install_id).state, "running", "the view of the admitted object runs");
});
