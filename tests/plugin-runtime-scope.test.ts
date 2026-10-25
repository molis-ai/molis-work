import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { HOST_BUILD_TRUST, PluginRuntime, UNSIGNED_TRUST, assertHomeScopeAllowed, assertLocalToolsAllowed } from "@molis-ai/molis-work-plugin-runtime";
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

test("RAC-739 a Manifest says it runs in the Home with runtime.scope, and cannot say it is a dual-instance plugin (S-48)", () => {
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

test("RAC-740 the Home plugins the Host ships say so in their Manifests, and the Host's code for a Home instance goes with exactly those", () => {
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

test("RAC-741 only the Host's own build can be installed with runtime.scope home: an unsigned, pinned or generated plugin that writes it is refused", () => {
  const home = definition(manifest({ scope: "home" }));
  assert.throws(() => new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  const pinned = { level: "pinned", publisher_key_id: `ed25519:sha256:${"a".repeat(64)}` } as const;
  assert.throws(() => new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: home, deployment: "local", grants: [], trust: pinned }), code("plugin.home_scope_unavailable"));
  assert.throws(() => assertHomeScopeAllowed(home.manifest, UNSIGNED_TRUST), code("plugin.home_scope_unavailable"));
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  assert.equal(runtime.install({ definition: home, deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  // A project plugin is not asked: it writes no runtime.
  assert.equal(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: definition(manifest(undefined)), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  // Nothing was recorded for the refused ones.
  const refused = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  assert.throws(() => refused.install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  assert.deepEqual(refused.list(), []);
});

test("RAC-742 only the Host's own build can be installed with local_tools: an unsigned, pinned or generated plugin that declares them is refused before any record", () => {
  const declared = definition(manifest(undefined, {
    permissions: [{ permission: "local-tools:read", required: true, reason: "Look for the tools it can use" }],
    local_tools: { tools: [{ tool_id: "probe", binaries: ["probe"] }] },
  } as Partial<PluginManifest>));
  const pinned = { level: "pinned", publisher_key_id: `ed25519:sha256:${"b".repeat(64)}` } as const;
  for (const trust of [UNSIGNED_TRUST, pinned]) {
    const refused = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
    assert.throws(() => refused.install({ definition: declared, deployment: "local", grants: [], trust }), code("plugin.declaration_invalid"));
    assert.deepEqual(refused.list(), [], "nothing is recorded for a refused install");
  }
  assert.throws(() => assertLocalToolsAllowed(declared.manifest, UNSIGNED_TRUST), code("plugin.declaration_invalid"));
  // The Host's own build is asked nothing, and a plugin that declares none is not asked either.
  assert.equal(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: declared, deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  assert.equal(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: definition(manifest(undefined)), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
});
