import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parsePluginManifest, PluginManifestError } from "@molis-ai/molis-work-contracts/platform/plugin";

function manifest() {
  return {
    schema_version: 1, host_api_version: 1,
    plugin_id: "io.molis.work.example.notes", version: "1.0.0", name: "Notes", kind: "integration",
    publisher: { publisher_id: "local-developer", signature: "local-development-identity" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:write", required: true, reason: "分享用户选择的笔记" }],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [{ artifact_type_id: "example.note", schema_version: 1 }], consumes: [] },
    ui: { contributions: ["notes.main"] },
  };
}

test("public Manifest parser preserves author declarations and rejects unsupported Host API before use", () => {
  const input = manifest();
  assert.deepEqual(parsePluginManifest(input), input);
  assert.throws(() => parsePluginManifest({ ...input, host_api_version: 2 }),
    (error: unknown) => error instanceof PluginManifestError && error.code === "plugin_manifest_invalid"
      && error.message.includes("host_api_version"));
});

test("Manifest upgrade declarations use exact older source versions with one disposition each", () => {
  const compatible = { ...manifest(), version: "1.1.0", upgrade_compatibility: {
    compatible_from_versions: ["1.0.0"],
  } };
  assert.deepEqual(parsePluginManifest(compatible), compatible);
  const migratable = { ...manifest(), version: "2.0.0", upgrade_compatibility: {
    compatible_from_versions: ["1.1.0"], migratable_from_versions: ["1.0.0"],
  } };
  assert.deepEqual(parsePluginManifest(migratable), migratable);
  const sameVersionCompatible = { ...manifest(), upgrade_compatibility: {
    compatible_from_versions: ["1.0.0"],
  } };
  assert.deepEqual(parsePluginManifest(sameVersionCompatible), sameVersionCompatible);
  for (const upgrade_compatibility of [
    { compatible_from_versions: ["2.0.0"] },
    { compatible_from_versions: ["1.0"] },
    { compatible_from_versions: ["01.0.0"] },
    { compatible_from_versions: ["1.0.0", "1.0.0"] },
    { compatible_from_versions: ["1.0.0"], migratable_from_versions: ["1.0.0"] },
    { migratable_from_versions: [] },
  ]) {
    assert.throws(() => parsePluginManifest({ ...manifest(), version: "1.1.0", upgrade_compatibility }), PluginManifestError);
  }
  assert.throws(() => parsePluginManifest({ ...manifest(), upgrade_compatibility: {
    migratable_from_versions: ["1.0.0"],
  } }), PluginManifestError);
  assert.throws(() => parsePluginManifest({ ...manifest(), version: "01.0.0" }), PluginManifestError);
});

test("wire Manifest rejects missing shapes, invalid permissions and incompatible Artifact declarations", () => {
  for (const input of [null, [], { ...manifest(), publisher: null },
    { ...manifest(), capabilities: { provides: [false], consumes: [] } },
    { ...manifest(), artifacts: { produces: [{ artifact_type_id: "example.note", schema_version: 0 }], consumes: [] } },
    { ...manifest(), ui: { contributions: [null] } }]) {
    assert.throws(() => parsePluginManifest(input), PluginManifestError);
  }
  assert.throws(() => parsePluginManifest({ ...manifest(), permissions: [
    { permission: "artifact:write", reason: "write", required: "yes" },
  ] }), (error: unknown) => error instanceof PluginManifestError && error.code === "plugin_permission_invalid");
  assert.throws(() => parsePluginManifest({ ...manifest(), entrypoints: [
    { deployment: "local", entrypoint: "./a.mjs" }, { deployment: "local", entrypoint: "./b.mjs" },
  ] }), (error: unknown) => error instanceof PluginManifestError && error.code === "plugin_entrypoint_missing");
});

test("real Plugin CLI validates in a clean directory without executing entrypoint or modifying input", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-cli-"));
  try {
    const manifestPath = join(directory, "manifest.json");
    const bytes = JSON.stringify(manifest());
    writeFileSync(manifestPath, bytes);
    writeFileSync(join(directory, "entry.mjs"), 'import { writeFileSync } from "node:fs"; writeFileSync("executed", "bad");');
    const cli = fileURLToPath(new URL("../tooling/plugin-cli/bin/molis-work-plugin.mjs", import.meta.url));
    const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: "utf8" });
    const valid = invoke("validate", manifestPath);
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(JSON.parse(valid.stdout), { valid: true, plugin_id: "io.molis.work.example.notes", version: "1.0.0" });
    assert.equal(readFileSync(manifestPath, "utf8"), bytes);
    assert.equal(existsSync(join(directory, "executed")), false);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest(), host_api_version: 2 }));
    const incompatible = invoke("validate", manifestPath);
    assert.equal(incompatible.status, 1);
    assert.equal(JSON.parse(incompatible.stderr).code, "plugin_manifest_invalid");
    assert.equal(incompatible.stdout, "");
    writeFileSync(manifestPath, "{invalid");
    assert.equal(invoke("validate", manifestPath).status, 1);
    assert.equal(invoke("install", manifestPath).status, 2, "unsupported commands cannot report a fake installation");
    assert.equal(existsSync(join(directory, "executed")), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
