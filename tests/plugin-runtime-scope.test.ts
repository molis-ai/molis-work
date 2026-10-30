import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { HOST_BUILD_TRUST, PluginRuntime, UNSIGNED_TRUST, assertHomeScopeAllowed, assertLocalToolsAllowed, assertScopeFitsRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

// specs/repository-anti-corruption/slices/platform-local-tools-home-scope.md, PG-011: where a plugin runs is its Manifest's `runtime`,
// and only code of the Host's build can be started in the Home. BL-628 (S-80, the person decided 2026-10-26) opens exactly one more
// way in: a signed package of a pinned publisher that runs in the sandbox.

const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

const manifest = (runtime: unknown, extra: Partial<PluginManifest> = {}): PluginManifest => ({
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.scope", version: "1.0.0", name: "Scope fixture", kind: "app",
  publisher: { publisher_id: "someone", signature: "scope-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  ...(runtime === undefined ? {} : { runtime }), ...extra,
} as PluginManifest);
const definition = (value: PluginManifest): PluginDefinition =>
  ({ manifest: value, async start() { return { kind: "app", views: [] }; }, async stop() {} }) as PluginDefinition;
const sandboxed = (value: PluginManifest): PluginDefinition => ({ ...definition(value), execution: "sandbox" }) as PluginDefinition;
const PINNED = { level: "pinned", publisher_key_id: `ed25519:sha256:${"a".repeat(64)}` } as const;
/** What a signed package's Manifest says: its publisher signature is the pinned key's fingerprint (S-75.1). */
const signed = (runtime: unknown) => manifest(runtime, { publisher: { publisher_id: "someone", signature: PINNED.publisher_key_id } });
const runtimeOf = (scope?: "home" | "project") => new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, ...(scope ? { scope } : {}) });

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
  assert.deepEqual(home, ["cognia", "feed", "goals", "images", "issues", "jelly", "shelf", "todo"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    assert.equal(entry.runtime !== undefined, entry.manifest.runtime?.scope === "home", `${entry.project_plugin_id}: the registration's runtime (the code) and the Manifest's runtime.scope go together`);
    assert.equal("scope" in (entry.runtime ?? {}), false, `${entry.project_plugin_id}: the registration no longer says where the plugin runs`);
  }
  // The dual-instance mark stays the Host's: on the registration, in no Manifest.
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.dual_instance === true).map(entry => entry.project_plugin_id).sort(), ["feed", "goals", "shelf"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.equal("dual_instance" in (entry.manifest.runtime ?? {}), false, entry.project_plugin_id);
  for (const entry of BUILTIN_PLUGIN_CATALOG) parsePluginManifest(entry.manifest);
});

test("RAC-741 runtime.scope home is installed only for the Host's own build or a pinned sandbox package: an unsigned plugin, or a pinned one that would run in the Host, is refused", () => {
  const home = definition(manifest({ scope: "home" }));
  assert.throws(() => runtimeOf().install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  assert.throws(() => runtimeOf().install({ definition: home, deployment: "local", grants: [], trust: PINNED }), code("plugin.home_scope_unavailable"), "pinned but running in the Host");
  assert.throws(() => assertHomeScopeAllowed(home.manifest, UNSIGNED_TRUST, "host"), code("plugin.home_scope_unavailable"));
  assert.throws(() => assertHomeScopeAllowed(home.manifest, UNSIGNED_TRUST, "sandbox"), code("plugin.home_scope_unavailable"), "a generated plugin is not opened");
  assert.throws(() => assertHomeScopeAllowed(home.manifest, PINNED, "host"), code("plugin.home_scope_unavailable"));
  assert.equal(runtimeOf().install({ definition: home, deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  // A project plugin is not asked: it writes no runtime.
  assert.equal(runtimeOf().install({ definition: definition(manifest(undefined)), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  // Nothing was recorded for the refused ones.
  const refused = runtimeOf();
  assert.throws(() => refused.install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  assert.throws(() => refused.install({ definition: home, deployment: "local", grants: [], trust: PINNED }), code("plugin.home_scope_unavailable"));
  assert.deepEqual(refused.list(), []);
});

test("RAC-960 a pinned publisher's sandboxed package may write runtime.scope home, and the Host's own level never goes with the sandbox", () => {
  const home = sandboxed(signed({ scope: "home" }));
  assertHomeScopeAllowed(home.manifest, PINNED, "sandbox");
  assert.equal(runtimeOf("home").install({ definition: home, deployment: "local", grants: [], trust: PINNED }).install.publisher_trust, "pinned");
  // The Host's level and the sandbox are still two things that do not go together (S-84's rule, unchanged).
  assert.throws(() => runtimeOf("home").install({ definition: home, deployment: "local", grants: [], trust: HOST_BUILD_TRUST }), code("plugin.grant_denied"));
  // An unsigned sandboxed definition (the plugin builder's) is not opened, and leaves no record.
  const refused = runtimeOf("home");
  assert.throws(() => refused.install({ definition: home, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), code("plugin.home_scope_unavailable"));
  assert.deepEqual(refused.list(), []);
});

test("RAC-961 the Runtime a package is installed into is the one its Manifest names: a Home package never lands in a project, a project package never in the Home", () => {
  const home = sandboxed(signed({ scope: "home" })), project = sandboxed(signed(undefined));
  assert.throws(() => assertScopeFitsRuntime(home.manifest, PINNED, "project"), code("plugin.home_scope_unavailable"));
  assert.throws(() => assertScopeFitsRuntime(project.manifest, PINNED, "home"), code("plugin.home_scope_unavailable"));
  assertScopeFitsRuntime(home.manifest, PINNED, "home");
  assertScopeFitsRuntime(project.manifest, PINNED, "project");
  assertScopeFitsRuntime(home.manifest, PINNED, undefined);
  const projectRuntime = runtimeOf("project"), homeRuntime = runtimeOf("home");
  assert.throws(() => projectRuntime.install({ definition: home, deployment: "local", grants: [], trust: PINNED }), code("plugin.home_scope_unavailable"));
  assert.throws(() => homeRuntime.install({ definition: project, deployment: "local", grants: [], trust: PINNED }), code("plugin.home_scope_unavailable"));
  assert.deepEqual([...projectRuntime.list(), ...homeRuntime.list()], [], "a refused install leaves no record");
  assert.equal(projectRuntime.install({ definition: project, deployment: "local", grants: [], trust: PINNED }).install.publisher_trust, "pinned");
  assert.equal(homeRuntime.install({ definition: home, deployment: "local", grants: [], trust: PINNED }).install.publisher_trust, "pinned");
  // The Host's own build and the Host's test fixtures are not asked: a dual-instance plugin's halves share one Manifest and run in both.
  assert.equal(runtimeOf("project").install({ definition: definition(manifest({ scope: "home" })), deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
  assert.equal(runtimeOf("home").install({ definition: definition(manifest(undefined)), deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  // A Runtime that says nothing about where it is (the Host's own tests) asks nothing.
  assert.equal(runtimeOf().install({ definition: project, deployment: "local", grants: [], trust: PINNED }).install.publisher_trust, "pinned");
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
