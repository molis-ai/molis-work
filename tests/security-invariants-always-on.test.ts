import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";

// S-34: a 常开插件 (`always_on: true`) cannot be removed, so only a plugin that ships with the Host may declare it. The
// Host says which plugins ship with it (`bundled`); every other install, and every confirmed upgrade, is refused.

const PLUGIN_ID = "io.molis.work.example.always-on";

function manifest(version: string, extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version, name: "Always-on fixture", kind: "app",
    publisher: { publisher_id: "someone", signature: "always-on-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    ...extra,
  };
}

function definition(value: PluginManifest, execution?: "sandbox"): PluginDefinition {
  return { manifest: value, ...(execution ? { execution } : {}), async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition;
}

const refusedAsAlwaysOn = (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("always_on");

test("S-34 a plugin that does not ship with the Host is refused at install when it declares always_on, not installed with the mark ignored", () => {
  const runtime = new PluginRuntime();
  assert.throws(() => runtime.install({ definition: definition(manifest("1.0.0", { always_on: true })), deployment: "local", grants: [] }), refusedAsAlwaysOn);
  assert.equal(runtime.list().length, 0);
  // The plugin studio's output runs sandboxed and is never bundled: refused the same way.
  assert.throws(() => new PluginRuntime().install({ definition: definition(manifest("1.0.0", { always_on: true }), "sandbox"), deployment: "local", grants: [] }), refusedAsAlwaysOn);
  // Without the mark the same plugin installs, and a bundled plugin may carry it.
  assert.equal(new PluginRuntime().install({ definition: definition(manifest("1.0.0")), deployment: "local", grants: [] }).install.plugin_id, PLUGIN_ID);
  assert.equal(new PluginRuntime().install({ definition: definition(manifest("1.0.0", { always_on: true })), deployment: "local", bundled: true }).install.plugin_id, PLUGIN_ID);
});

test("S-34 a confirmed upgrade cannot make an installed plugin always on", async () => {
  const runtime = new PluginRuntime();
  const { install } = runtime.install({ definition: definition(manifest("1.0.0")), deployment: "local", grants: [] });
  const target = manifest("1.1.0", { always_on: true, upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } });
  await assert.rejects(runtime.upgrade({ install_id: install.install_id, definition: definition(target) }), refusedAsAlwaysOn);
  assert.equal(runtime.list()[0]?.version, "1.0.0");
});

test("S-34 the SDK reads always_on only as a v2 boolean", () => {
  assert.equal(parsePluginManifest(manifest("1.0.0", { always_on: true })).always_on, true);
  assert.throws(() => parsePluginManifest({ ...manifest("1.0.0"), always_on: "yes" }), (error: unknown) => error instanceof ActionError && error.code === "plugin.manifest_invalid");
  const v1 = { ...manifest("1.0.0"), schema_version: 1, host_api_version: 1, kind: "native", always_on: true };
  assert.throws(() => parsePluginManifest(v1), (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("always_on"));
});
