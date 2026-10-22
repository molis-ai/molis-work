import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";

test("every bundled Manifest passes the same contract a new plugin must meet, including declared action permissions", () => {
  const failures = BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    try { parsePluginManifest(entry.manifest); return []; }
    catch (error) { return [`${entry.manifest.plugin_id}: ${(error as Error).message}`]; }
  });
  assert.deepEqual(failures, []);
});

// REL-03: also check the runtime catalog, independently of the source-level release check.
test("every Manifest in the built-in catalog has the product version", () => {
  const product = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.ok(BUILTIN_PLUGIN_CATALOG.length > 0);
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.equal(entry.manifest.version, product.version, entry.manifest.plugin_id);
});
