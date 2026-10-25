import assert from "node:assert/strict";
import test from "node:test";
import { comparePluginVersions } from "@molis-ai/molis-work-plugin-sdk";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";

test("W1-18-SEMVER-01 preserves hyphens inside prerelease identifiers and follows literal precedence", () => {
  const cases = [
    ["1.0.0-alpha-a", "1.0.0-alpha-b", -1],
    ["1.0.0-alpha-1.2", "1.0.0-alpha-1.10", -1],
    ["1.0.0-alpha-a.9", "1.0.0-alpha-b.1", -1],
    ["1.0.0-1", "1.0.0-alpha-1", -1],
    ["1.0.0-alpha-a", "1.0.0-alpha-a.1", -1],
    ["1.0.0-alpha-a", "1.0.0", -1],
    ["1.0.0-alpha-a+build.1", "1.0.0-alpha-a+build.2", 0],
    ["1.0.0-alpha-a+build.9", "1.0.0-alpha-b+build.1", -1],
    ["1.0.0+build.1", "1.0.0+build.2", 0],
    ["1.0.0-alpha-b", "1.0.1-alpha-a", -1],
  ] as const;
  for (const [left, right, expected] of cases) {
    assert.equal(Math.sign(comparePluginVersions(left, right)), expected, `${left} versus ${right}`);
    assert.equal(Math.sign(comparePluginVersions(right, left)), expected === 0 ? 0 : 1, `${right} versus ${left}`);
  }
});

test("W1-18-SEMVER-01 Runtime upgrades a hyphenated prerelease and refuses an unchanged or older version", async () => {
  const starts: string[] = [];
  const definition = (version: string, from?: string): PluginDefinition => ({
    manifest: {
      schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.semver-probe", version, name: "SemVer probe", kind: "app",
      publisher: { publisher_id: "fixture", signature: "semver-probe-binding" },
      entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }], permissions: [],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      ...(from ? { upgrade_compatibility: { compatible_from_versions: [from] } } : {}),
    },
    async start() { starts.push(version); return { kind: "app" }; },
  });
  const runtime = new PluginRuntime();
  const original = definition("1.0.0-alpha-a"), newer = definition("1.0.0-alpha-b", "1.0.0-alpha-a");
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: original, deployment: "local", grants: [] }).install.install_id;
  try {
    await runtime.start(installId);
    const upgraded = await runtime.upgrade({ install_id: installId, definition: newer });
    assert.equal(upgraded.install.version, "1.0.0-alpha-b");
    assert.equal(upgraded.install.state, "running");
    await assert.rejects(runtime.upgrade({ install_id: installId, definition: newer }), { code: "plugin.upgrade_required" });
    await assert.rejects(runtime.upgrade({ install_id: installId, definition: original }), { code: "plugin.upgrade_required" });
    assert.deepEqual(starts, ["1.0.0-alpha-a", "1.0.0-alpha-b"]);
    assert.equal(runtime.get(installId).version, "1.0.0-alpha-b");
  } finally { await runtime.stop(installId); }
});
