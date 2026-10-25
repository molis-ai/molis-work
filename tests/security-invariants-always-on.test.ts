import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { HOST_BUILD_TRUST, MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PLUGIN_TRUST_SCHEMA_SQL, PluginRuntime, SqlitePluginConsentLedger, UNSIGNED_TRUST,
  consentSubject } from "@molis-ai/molis-work-plugin-runtime";

// S-34 (ac-trust): a 常开插件 (`always_on: true`) is in effect when the plugin's installation has an active consent for it, whatever
// the install came from. Declaring it never refuses an install: a plugin installed without the consent is installed with that one
// declaration not in effect. The Host agrees for a plugin of its own build (`host_build`); a person agrees for any other. A consent
// is a row that is revoked by `revoked_at`, never rewritten or deleted, and the Host's later start does not undo a revocation.
// What the consent makes true elsewhere (the always-on list, refusing removal) is checked where that list is built.

const PLUGIN_ID = "io.molis.work.example.always-on";
const ALWAYS_ON = { kind: "always_on", subject: consentSubject.alwaysOn() } as const;

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

const runtimeWith = (consents = new MemoryPluginConsentLedger()) => ({ consents, runtime: new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, consents }) });
const declaredInvalid = (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid";

test("RAC-384 S-34 an unsigned plugin that declares always_on is installed, and without a consent the declaration is not in effect", () => {
  const { consents, runtime } = runtimeWith();
  const installed = runtime.install({ trust: UNSIGNED_TRUST, definition: definition(manifest("1.0.0", { always_on: true })), deployment: "local", grants: [] });
  assert.equal(installed.install.plugin_id, PLUGIN_ID);
  assert.equal(installed.install.publisher_trust, "unsigned");
  assert.deepEqual(consents.consents(PLUGIN_ID), [], "nothing agreed, so nothing in effect");
  // The studio's output is sandboxed and unsigned: the same.
  const sandboxed = runtimeWith();
  sandboxed.runtime.install({ trust: UNSIGNED_TRUST, definition: definition(manifest("1.0.0", { always_on: true }), "sandbox"), deployment: "local", grants: [] });
  assert.deepEqual(sandboxed.consents.consents(PLUGIN_ID), []);
});

test("RAC-384 S-34 a person's consent to always_on is one row for the Manifest agreed to; a consent to something the Manifest does not declare is refused", () => {
  const { consents, runtime } = runtimeWith();
  const value = manifest("1.0.0", { always_on: true });
  const installed = runtime.install({ trust: UNSIGNED_TRUST, definition: definition(value), deployment: "local", grants: [], consents: [ALWAYS_ON] });
  const [row] = consents.consents(PLUGIN_ID);
  assert.equal(consents.consents(PLUGIN_ID).length, 1);
  assert.deepEqual({ kind: row!.kind, subject: row!.subject, granted_by: row!.granted_by, revoked_at: row!.revoked_at, digest: row!.manifest_digest, signature: row!.publisher_signature },
    { kind: "always_on", subject: "always_on", granted_by: "user", revoked_at: null, digest: installed.install.manifest_digest, signature: "always-on-fixture" });

  const other = runtimeWith();
  assert.throws(() => other.runtime.install({ trust: UNSIGNED_TRUST, definition: definition(manifest("1.0.0")), deployment: "local", grants: [], consents: [ALWAYS_ON] }), declaredInvalid,
    "the Manifest does not declare always_on");
  assert.throws(() => other.runtime.install({ trust: UNSIGNED_TRUST, definition: definition(value), deployment: "local", grants: [], consents: [{ kind: "default_group", subject: "made-up" }] }), declaredInvalid);
  assert.equal(other.runtime.list().length, 0, "a refused consent installs nothing");
  assert.deepEqual(other.consents.consents(PLUGIN_ID), []);
});

test("RAC-385 S-34 the Host agrees for a plugin of its own build, once, and its next start does not undo a revocation", () => {
  const db = new DatabaseSync(":memory:"); db.exec(PLUGIN_TRUST_SCHEMA_SQL);
  const consents = new SqlitePluginConsentLedger(db);
  const { runtime } = runtimeWith(consents);
  const shipped = definition(manifest("1.0.0", { always_on: true }));
  const start = () => runtime.install({ trust: HOST_BUILD_TRUST, definition: shipped, deployment: "local", consents: [ALWAYS_ON] });

  assert.equal(start().install.publisher_trust, "host");
  const [first] = consents.consents(PLUGIN_ID);
  assert.deepEqual({ kind: first!.kind, granted_by: first!.granted_by, revoked_at: first!.revoked_at }, { kind: "always_on", granted_by: "host_build", revoked_at: null });
  start();
  assert.equal(consents.consents(PLUGIN_ID).length, 1, "starting again writes no second row");

  db.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE consent_id = ?").run("2026-10-24T00:00:00Z", first!.consent_id);
  start();
  assert.deepEqual(consents.consents(PLUGIN_ID).map(row => row.revoked_at), ["2026-10-24T00:00:00Z"], "the Host agreeing again must not bring a revoked consent back");

  // A person agreeing after the revocation is a new row, and the revoked one stays as it was.
  runtimeWith(consents).runtime.install({ trust: UNSIGNED_TRUST, definition: definition(manifest("1.0.0", { always_on: true })), deployment: "local", grants: [], consents: [ALWAYS_ON] });
  assert.deepEqual(consents.consents(PLUGIN_ID).map(row => [row.granted_by, row.revoked_at === null]), [["host_build", false], ["user", true]]);
  assert.throws(() => db.prepare("INSERT INTO plugin_consents (consent_id, plugin_id, publisher_signature, kind, subject, manifest_digest, granted_at, granted_by, revoked_at) VALUES ('dup', ?, ?, 'always_on', 'always_on', 'd', 'now', 'user', NULL)")
    .run(PLUGIN_ID, "always-on-fixture"), /UNIQUE/u, "two active consents to the same declaration cannot both be in the ledger");
  db.close();
});

test("RAC-384 S-34 an upgrade that newly declares always_on is installed, and asks for the consent it has not got", async () => {
  const { consents, runtime } = runtimeWith();
  const { install } = runtime.install({ trust: UNSIGNED_TRUST, definition: definition(manifest("1.0.0")), deployment: "local", grants: [] });
  const target = manifest("1.1.0", { always_on: true, upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } });
  await runtime.upgrade({ install_id: install.install_id, definition: definition(target) });
  assert.equal(runtime.list()[0]?.version, "1.1.0");
  assert.deepEqual(consents.consents(PLUGIN_ID), [], "an upgrade is not a consent");
});

test("S-34 the SDK reads always_on only as a v2 boolean", () => {
  assert.equal(parsePluginManifest(manifest("1.0.0", { always_on: true })).always_on, true);
  assert.throws(() => parsePluginManifest({ ...manifest("1.0.0"), always_on: "yes" }), (error: unknown) => error instanceof ActionError && error.code === "plugin.manifest_invalid");
  const v1 = { ...manifest("1.0.0"), schema_version: 1, host_api_version: 1, kind: "native", always_on: true };
  assert.throws(() => parsePluginManifest(v1), (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("always_on"));
});
