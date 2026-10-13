import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { olderCharactersManifest } from "./fixtures/older-characters-manifest.js";

test("every bundled Manifest passes the same contract a new plugin must meet, including declared action permissions", () => {
  const failures = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    try { parsePluginManifest(entry.manifest); return []; }
    catch (error) { return [`${entry.manifest.plugin_id}: ${(error as Error).message}`]; }
  });
  assert.deepEqual(failures, []);
});

// The survey above reads each Manifest as it ships. A journey that starts from an older install derives another one from it,
// and only that journey's browser test would learn that the contract moved (W3-05-2 made it refuse a produced type with no
// preview action, which the older install had no way to declare).
test("the older Characters install that the recovery journey starts from still passes the contract and installs", () => {
  const older = olderCharactersManifest();
  assert.doesNotThrow(() => parsePluginManifest(older));
  const runtime = new PluginRuntime();
  const receipt = runtime.install({ definition: { manifest: older, async start() { return {}; } }, deployment: "local", grants: older.permissions.filter(p => p.required).map(p => p.permission) });
  assert.equal(receipt.install.version, "1.0.0");
});
