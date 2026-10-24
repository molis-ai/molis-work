import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime, UNSIGNED_TRUST, assertConsentsDeclared, assertPluginTrust, assertTrustFitsExecution,
  consentGranter, consentSubject, declarationsNeedingConsent, hostBuildConsents } from "@molis-ai/molis-work-plugin-runtime";

// RAC-380: a trust level is the Host's evidence for an install. Nothing a plugin writes names its own, and the level is part of the record.
const KEY_ID = `ed25519:sha256:${"a".repeat(64)}`;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function manifest(extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.trust", version: "1.0.0", name: "Trust fixture", kind: "app",
    publisher: { publisher_id: "someone", signature: "trust-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    ...extra,
  };
}
const definition = (value: PluginManifest, execution?: "sandbox"): PluginDefinition =>
  ({ manifest: value, ...(execution ? { execution } : {}), async start() { return { kind: "app", views: [] }; }, async stop() {} }) as PluginDefinition;

test("RAC-380 the evidence is checked by shape: no level, an unknown level, extra fields or a pinned level without a verified key id are refused", () => {
  for (const bad of [undefined, null, "host", [], {}, { level: "root" }, { level: "host", publisher_key_id: KEY_ID }, { level: "unsigned", extra: 1 },
    { level: "pinned" }, { level: "pinned", publisher_key_id: "trust-me" }, { level: "pinned", publisher_key_id: KEY_ID, extra: 1 }]) {
    assert.throws(() => assertPluginTrust(bad), code("plugin.state_invalid"), JSON.stringify(bad));
  }
  for (const good of [HOST_BUILD_TRUST, UNSIGNED_TRUST, { level: "pinned", publisher_key_id: KEY_ID }]) assert.equal(assertPluginTrust(good), good);
  assert.ok(Object.isFrozen(HOST_BUILD_TRUST) && Object.isFrozen(UNSIGNED_TRUST), "the Host's own evidence cannot be edited in place");
});

test("RAC-380 an install is made with the Host's evidence, and a Manifest or a missing trust cannot stand for it", () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
  // A Manifest cannot name its own level: the install reads only the argument.
  const claimed = definition({ ...manifest(), trust: { level: "host" }, publisher_trust: "host", bundled: true } as unknown as PluginManifest);
  assert.throws(() => runtime.install({ definition: claimed, deployment: "local", grants: [] } as never), code("plugin.state_invalid"), "no evidence, no install");
  assert.equal(runtime.install({ definition: claimed, deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  assert.equal(new PluginRuntime().install({ definition: definition(manifest()), deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
});

test("RAC-380 the level of an installed plugin does not change by installing it again under another one", () => {
  const runtime = new PluginRuntime();
  runtime.install({ definition: definition(manifest()), deployment: "local", grants: [], trust: UNSIGNED_TRUST });
  assert.throws(() => runtime.install({ definition: definition(manifest()), deployment: "local", trust: HOST_BUILD_TRUST }), code("plugin.definition_conflict"));
  assert.equal(runtime.list()[0]?.publisher_trust, "unsigned");
});

test("RAC-383 host evidence is only for code the Host runs, never for a sandboxed definition", () => {
  assertTrustFitsExecution(HOST_BUILD_TRUST, "host");
  assertTrustFitsExecution(UNSIGNED_TRUST, "sandbox");
  assertTrustFitsExecution({ level: "pinned", publisher_key_id: KEY_ID }, "sandbox");
  assert.throws(() => assertTrustFitsExecution(HOST_BUILD_TRUST, "sandbox"), code("plugin.grant_denied"));
});

test("RAC-385 the Host agrees for its own build and a person for every other install", () => {
  assert.equal(consentGranter(HOST_BUILD_TRUST), "host_build");
  assert.equal(consentGranter(UNSIGNED_TRUST), "user");
  assert.equal(consentGranter({ level: "pinned", publisher_key_id: KEY_ID }), "user");
});

test("RAC-384 the declarations that ask for consent are written one way, and a changed declaration is another subject", () => {
  const value = manifest({
    always_on: true,
    ports: { inputs: [{ port: "docs", artifact_type_id: "doc", schema_version: 1, default_source: { plugin_id: "io.molis.work.pages", port: "doc" } }],
      input_groups: [{ group_id: "ask", title: "问一问", ports: ["docs"], default: true }, { group_id: "other", title: "别的", ports: ["docs"] }], outputs: [] },
  } as Partial<PluginManifest>);
  const signatureOf = (pluginId: string) => pluginId === "io.molis.work.pages" ? "pages-signature" : undefined;
  assert.deepEqual(declarationsNeedingConsent(value, signatureOf).map(({ kind, subject }) => [kind, subject]), [
    ["always_on", "always_on"],
    ["default_wiring", "docs<-io.molis.work.pages:doc@pages-signature"],
    ["default_group", "ask"],
  ]);
  assert.equal(consentSubject.defaultWiring("docs", { plugin_id: "io.molis.work.pages", port: "doc" }, "pages-signature"), "docs<-io.molis.work.pages:doc@pages-signature");
  assert.deepEqual(declarationsNeedingConsent(value, () => undefined).map(item => item.kind), ["always_on", "default_group"], "a wiring whose source cannot be named cannot be agreed to");
  assert.deepEqual(declarationsNeedingConsent(manifest(), signatureOf), []);
  assert.deepEqual(hostBuildConsents(value, signatureOf).map(item => item.subject), ["always_on", "docs<-io.molis.work.pages:doc@pages-signature", "ask"]);
});

test("RAC-384 a consent is accepted only for a declaration of this Manifest, exactly as written", () => {
  const value = manifest({ always_on: true });
  assertConsentsDeclared(value, [{ kind: "always_on", subject: "always_on" }]);
  for (const grant of [{ kind: "always_on", subject: "always_on!" }, { kind: "default_group", subject: "always_on" }, { kind: "default_wiring", subject: "docs<-x:y@z" },
    { kind: "local_directory", subject: "always_on" }]) {
    assert.throws(() => assertConsentsDeclared(value, [grant as never]), code("plugin.declaration_invalid"), JSON.stringify(grant));
  }
  assert.throws(() => assertConsentsDeclared(manifest(), [{ kind: "always_on", subject: "always_on" }]), code("plugin.declaration_invalid"));
});
