import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

test("every bundled Manifest passes the same contract a new plugin must meet, including declared action permissions", () => {
  const failures = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    try { parsePluginManifest(entry.manifest); return []; }
    catch (error) { return [`${entry.manifest.plugin_id}: ${(error as Error).message}`]; }
  });
  assert.deepEqual(failures, []);
});
