import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { HOST_BUILD_TRUST, PluginRuntime, UNSIGNED_TRUST, assertHomeScopeAllowed } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

// specs/repository-anti-corruption/slices/platform-local-tools-home-scope.md, PG-011: where a plugin runs is its Manifest's `runtime`,
// and only code of the Host's build can be started in the Home.

const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

const manifest = (runtime: unknown, extra: Partial<PluginManifest> = {}): PluginManifest => ({
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.scope", version: "1.0.0", name: "Scope fixture", kind: "app",
  publisher: { publisher_id: "someone", signature: "scope-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  ...(runtime === undefined ? {} : { runtime }), ...extra,
} as PluginManifest);
const definition = (value: PluginManifest): PluginDefinition =>
  ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} }) as PluginDefinition;

test("RAC-680 a Manifest says it runs in the Home with runtime.scope, and cannot say it is a dual-instance plugin (S-48)", () => {
  assert.equal(parsePluginManifest(manifest(undefined)).runtime, undefined, "a project plugin writes nothing");
  assert.deepEqual(parsePluginManifest(manifest({ scope: "home" })).runtime, { scope: "home" });
  for (const [runtime, mentions] of [
    ["home", /runtime 必须为对象/u],
    [[], /runtime 必须为对象/u],
    [{}, /runtime\.scope 只能写 "home"/u],
    [{ scope: "project" }, /runtime\.scope 只能写 "home"/u],
    [{ scope: "platform" }, /runtime\.scope 只能写 "home"/u],
    [{ scope: "home", dual_instance: true }, /runtime 不认这些字段：dual_instance（双实例的标记只来自宿主的登记/u],
    [{ scope: "home", dual_instance: false }, /runtime 不认这些字段：dual_instance/u],
    [{ dual_instance: true }, /runtime 不认这些字段：dual_instance/u],
    [{ scope: "home", trust: "host" }, /runtime 不认这些字段：trust/u],
  ] as const) {
    assert.throws(() => parsePluginManifest(manifest(runtime)), (error: unknown) => error instanceof ActionError && mentions.test(error.message), JSON.stringify(runtime));
  }
});

test("RAC-681 the Home plugins the Host ships say so in their Manifests, and the Host's code for a Home instance goes with exactly those", () => {
  const home = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope === "home").map(entry => entry.project_plugin_id).sort();
  assert.deepEqual(home, ["cognia", "images", "issues", "jelly", "shelf", "todo"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    assert.equal(entry.runtime !== undefined, entry.manifest.runtime?.scope === "home", `${entry.project_plugin_id}: the registration's runtime (the code) and the Manifest's runtime.scope go together`);
    assert.equal("scope" in (entry.runtime ?? {}), false, `${entry.project_plugin_id}: the registration no longer says where the plugin runs`);
  }
  // The dual-instance mark stays the Host's: on the registration, in no Manifest.
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.dual_instance === true).map(entry => entry.project_plugin_id), ["shelf"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.equal("dual_instance" in (entry.manifest.runtime ?? {}), false, entry.project_plugin_id);
  for (const entry of BUILTIN_PLUGIN_CATALOG) parsePluginManifest(entry.manifest);
});

test("RAC-682 only the Host's own build can be installed with runtime.scope home: an unsigned, pinned or generated plugin that writes it is refused", () => {
  const home = definition(manifest({ scope: "home" }));
  assert.throws(() => new PluginRuntime().install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  const pinned = { level: "pinned", publisher_key_id: `ed25519:sha256:${"a".repeat(64)}` } as const;
  assert.throws(() => new PluginRuntime().install({ definition: home, deployment: "local", grants: [], trust: pinned }), code("plugin.home_scope_unavailable"));
  assert.throws(() => assertHomeScopeAllowed(home.manifest, UNSIGNED_TRUST), code("plugin.home_scope_unavailable"));
  const runtime = new PluginRuntime();
  assert.equal(runtime.install({ definition: home, deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  // A project plugin is not asked: it writes no runtime.
  assert.equal(new PluginRuntime().install({ definition: definition(manifest(undefined)), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  // Nothing was recorded for the refused ones.
  const refused = new PluginRuntime();
  assert.throws(() => refused.install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  assert.deepEqual(refused.list(), []);
});
