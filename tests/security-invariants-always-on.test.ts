import { HOST_STAND_IN_IDS, ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PluginRuntime, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";

// S-34 (44B): there is no 常开插件. No declaration makes a plugin one that every project has and nobody can remove: a Manifest that
// still writes `always_on` is an ordinary plugin, its install asks no consent for it, and the Runtime uninstalls it like any other.
// Shelf, the last one, is a platform part the runtime hosts (`system.shelf`), with no install record to keep or remove.

function definition(extra: Record<string, unknown>): PluginDefinition {
  const manifest = {
    schema_version: 1, host_api_version: 1, plugin_id: "com.example.stays", version: "1.0.0", name: "Stays on", kind: "app",
    publisher: { publisher_id: "someone", signature: "stays-on-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
  } as PluginManifest;
  return { manifest, async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition;
}

test("RAC-386 S-34 a Manifest that writes always_on installs as an ordinary plugin, asks no consent for it, and is uninstalled", async () => {
  const consents = new MemoryPluginConsentLedger();
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS, consents });
  const { install } = runtime.install({ trust: UNSIGNED_TRUST, definition: definition({ always_on: true }), deployment: "local", grants: [] });
  await runtime.start(install.install_id);
  assert.deepEqual(consents.consents(install.plugin_id), [], "nothing is agreed to on its behalf");
  await runtime.uninstall(install.install_id);
  assert.equal(runtime.list()[0]!.state, "uninstalled", "no declaration keeps a plugin from being removed");
});
