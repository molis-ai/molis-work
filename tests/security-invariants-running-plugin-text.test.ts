import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { runningPluginText, type RunningRelease } from "@molis-ai/molis-work-app-local-host";
import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";

// S-31/S-page-entry-actions identity: a word may only be read from a release whose installation record still names this very
// running Manifest (state, plugin, generation, version, signature and digest). The test uses the Host's public reader, not a
// private import, so the refusal itself is exercised.
const manifest = { plugin_id: "io.molis.work.test", version: "1.0.0", publisher: { signature: "sig" } } as PluginManifest;
const source = { activation: { install_id: "install-1", installation_generation: 2 }, manifest };
const release: RunningRelease = { plugin_id: "io.molis.work.test", signature: "sig", install_id: "install-1" };
const record = () => ({ state: "running", plugin_id: "io.molis.work.test", installation_generation: 2, version: "1.0.0",
  publisher_signature: "sig", manifest_digest: pluginManifestDigest(manifest) });
const platform = (overrides: { source?: typeof source | null; record?: ReturnType<typeof record> } = {}) => ({
  supervisor: { activeInstance: (id: string) => id === manifest.plugin_id && overrides.source !== null ? { source: () => overrides.source ?? source } : undefined },
  runtime: { get: () => overrides.record ?? record() },
} as never);

test("identity 1: a matching running release returns its Manifest and reader", () => {
  const found = runningPluginText(platform(), release);
  assert.equal(found?.manifest, manifest);
  assert.equal(found?.reader, null, "a fake activation has no registered text reader");
});

test("identity 2: no platform, no source, and each durable identity mismatch refuse", () => {
  assert.equal(runningPluginText(null, release), null);
  assert.equal(runningPluginText(platform({ source: null }), release), null);
  assert.equal(runningPluginText(platform(), { ...release, signature: "other" }), null, "release signature");
  assert.equal(runningPluginText(platform(), { ...release, install_id: "other" }), null, "release install id");
  const wrong = (field: string) => ({ ...record(), [field]: field === "installation_generation" ? 3 : `other-${field}` });
  for (const field of ["state", "plugin_id", "installation_generation", "version", "publisher_signature", "manifest_digest"]) {
    assert.equal(runningPluginText(platform({ record: wrong(field) }), release), null, field);
  }
  const otherManifest = { ...manifest, plugin_id: "io.molis.work.other" } as PluginManifest;
  assert.equal(runningPluginText(platform({ source: { activation: source.activation, manifest: otherManifest } }), release), null, "manifest plugin id");
});
