import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime, UNSIGNED_TRUST, assertConsentsDeclared, assertPluginTrust, assertTrustFitsExecution,
  consentGranter, consentSubject, declarationsNeedingConsent, hostBuildConsents } from "@molis-ai/molis-work-plugin-runtime";
import { MemoryPluginConsentLedger, PLUGIN_TRUST_SCHEMA_SQL, SqlitePluginConsentLedger, readProjectReachSubject } from "@molis-ai/molis-work-plugin-runtime";

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
  // RAC-381-T1: the production install boundary still rejects a caller that omits its Host-supplied evidence.
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  // A Manifest cannot name its own level: the install reads only the argument.
  const claimed = definition(Object.assign(manifest(), { trust: { level: "host" }, publisher_trust: "host", bundled: true }));
  assert.throws(() => runtime.install({ definition: claimed, deployment: "local", grants: [] } as never), code("plugin.state_invalid"), "no evidence, no install");
  assert.equal(runtime.install({ definition: claimed, deployment: "local", grants: [], trust: UNSIGNED_TRUST }).install.publisher_trust, "unsigned");
  assert.equal(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }).install({ definition: definition(manifest()), deployment: "local", trust: HOST_BUILD_TRUST }).install.publisher_trust, "host");
});

test("RAC-380 the level of an installed plugin does not change by installing it again under another one", () => {
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS });
  runtime.install({ definition: definition(manifest()), deployment: "local", grants: [], trust: UNSIGNED_TRUST });
  assert.throws(() => runtime.install({ definition: definition(manifest()), deployment: "local", trust: HOST_BUILD_TRUST }), code("plugin.definition_conflict"));
  assert.equal(runtime.list()[0]?.publisher_trust, "unsigned");
});

test("RAC-383 host evidence is only for code the Host runs, never for a sandboxed definition", () => {
  assertTrustFitsExecution(HOST_BUILD_TRUST, "host", false);
  assertTrustFitsExecution(UNSIGNED_TRUST, "sandbox", false);
  assertTrustFitsExecution({ level: "pinned", publisher_key_id: KEY_ID }, "sandbox", false);
  assert.throws(() => assertTrustFitsExecution(HOST_BUILD_TRUST, "sandbox", false), code("plugin.grant_denied"));
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

for (const storage of ["memory", "sqlite"] as const) test(`RAC-2645 RAC-2648 RAC-2649 ${storage} project approvals preserve independent history, copy arrays and replace atomically`, () => {
  const db = new DatabaseSync(":memory:"); db.exec(PLUGIN_TRUST_SCHEMA_SQL);
  const ledger = storage === "memory" ? new MemoryPluginConsentLedger() : new SqlitePluginConsentLedger(db);
  try {
    const ids = ["goals.plugin.progress", "goals.plugin.state"];
    const entry = { plugin_id: "io.molis.work.example.reach", publisher_signature: KEY_ID, manifest_digest: "v1", project_id: "A", install_id: "home-1", approved_capability_ids: ids, at: "one" };
    const first = ledger.grantProjectReach(entry);
    assert.deepEqual(readProjectReachSubject(first.subject), { project_id: "A", install_id: "home-1" });
    assert.equal(first.granted_by, "user"); assert.equal(first.kind, "project_reach");
    ids.push("outside.new");
    assert.deepEqual(ledger.consent(first.consent_id)!.approved_capability_ids, ["goals.plugin.progress", "goals.plugin.state"]);
    for (const returned of [first, ledger.consents(entry.plugin_id)[0]!, ledger.consent(first.consent_id)!]) {
      (returned.approved_capability_ids as string[]).push("outside.mutated");
      assert.deepEqual(ledger.consent(first.consent_id)!.approved_capability_ids, ["goals.plugin.progress", "goals.plugin.state"]);
    }
    const before = ledger.consents(entry.plugin_id);
    for (const bad of [undefined, null, ["b", "a"], ["a", "a"], [""]]) {
      assert.throws(() => ledger.grantProjectReach({ ...entry, approved_capability_ids: bad } as never), code("plugin.state_invalid"));
      assert.deepEqual(ledger.consents(entry.plugin_id), before, "invalid approval never withdraws a valid prior agreement");
    }
    const again = ledger.grantProjectReach({ ...entry, approved_capability_ids: ["goals.plugin.progress", "goals.plugin.state"] });
    assert.equal(again.consent_id, first.consent_id);
    if (storage === "sqlite") {
      db.exec("CREATE TRIGGER refuse_next_agreement BEFORE INSERT ON plugin_consents BEGIN SELECT RAISE(ABORT, 'injected write failure'); END");
      assert.throws(() => ledger.grantProjectReach({ ...entry, manifest_digest: "v2", at: "two" }), /injected write failure/u);
      assert.deepEqual(ledger.consents(entry.plugin_id), before, "failure after withdrawing the old row rolls the entire transaction back");
      db.exec("DROP TRIGGER refuse_next_agreement");
    }
    const next = ledger.grantProjectReach({ ...entry, manifest_digest: "v2", at: "two" });
    assert.notEqual(next.consent_id, first.consent_id);
    assert.equal(ledger.consent(first.consent_id)!.manifest_digest, "v1");
    assert.equal(ledger.consent(first.consent_id)!.revoked_at, "two");
    const b = ledger.grantProjectReach({ ...entry, project_id: "B" });
    const second = ledger.grantProjectReach({ ...entry, install_id: "home-2" });
    assert.equal(ledger.revokeProjectReach({ project_id: "A" }, "three"), 2);
    assert.equal(ledger.consent(b.consent_id)!.revoked_at, null);
    assert.equal(ledger.consent(second.consent_id)!.revoked_at, "three");
    assert.equal(ledger.revokeProjectReach({ project_id: "A" }, "four"), 0);
    assert.equal(ledger.revokeProjectReach({ install_id: "home-1" }, "five"), 1);
    const revoked = ledger.revoke(b.consent_id, "six")!;
    (revoked.approved_capability_ids as string[]).push("mutated.after.revoke");
    assert.equal(ledger.consent(b.consent_id)!.revoked_at, "five");
    assert.deepEqual(ledger.consent(b.consent_id)!.approved_capability_ids, ids);
    const ordinary = ledger.record({ plugin_id: entry.plugin_id, publisher_signature: KEY_ID, manifest_digest: "plain", granted_by: "host_build", at: "six", grants: [{ kind: "always_on", subject: "always_on" }] });
    assert.equal(ordinary[0]!.approved_capability_ids, null);
    assert.throws(() => ledger.record({ ...entry, granted_by: "host_build", grants: [{ kind: "project_reach", subject: first.subject }] } as never), code("plugin.state_invalid"));
  } finally { db.close(); }
});
