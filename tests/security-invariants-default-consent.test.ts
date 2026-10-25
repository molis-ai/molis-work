import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInputGroupDeclaration, PluginInputPortDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { MemoryPluginConsentLedger, consentSubject, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, bindDeclaredDefaults, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-X3 (ac-trust T4, PG-005): a default wiring or default input group binds only on a standing agreement in the Home's consent ledger.
// The agreement is the declaring plugin's own publisher agreeing to this port reading that source, for the publisher the source runs
// under now; a revoked one takes the bound default off and leaves what the person chose alone.

const FILES = "io.molis.work.files";
const PROBE = "io.molis.work.example.wordcount";
const SIGNATURE = "probe-wordcount";
const filesSignature = createFilesPlugin().manifest.publisher.signature;

function probe(inputs: PluginInputPortDeclaration[], groups?: PluginInputGroupDeclaration[]): PluginDefinition {
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: PROBE, version: "1.0.0", name: "字数", kind: "app",
    publisher: { publisher_id: "molis", signature: SIGNATURE }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:read", required: true, reason: "读绑来的快照" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] }, ui: { contributions: [] },
    ports: { inputs, outputs: [], ...(groups ? { input_groups: groups } : {}) } };
  return { manifest, async start() { return { kind: "app", views: [] }; } };
}
const snapshotPort = (port: string, default_source?: PluginInputPortDeclaration["default_source"]): PluginInputPortDeclaration =>
  ({ port, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, optional: true, ...(default_source ? { default_source } : {}) });
const GROUP: PluginInputGroupDeclaration[] = [{ group_id: "one", title: "一份", ports: ["text"], default: true }];

/** The ledger a person revokes rows of: the rows are never rewritten, so the revocation is laid over them. */
class RevokableLedger extends MemoryPluginConsentLedger {
  readonly revoked = new Set<string>();
  override consents(pluginId: string): PluginConsentRecord[] {
    return super.consents(pluginId).map(row => this.revoked.has(row.consent_id) ? { ...row, revoked_at: "2026-10-25T00:00:00.000Z" } : row);
  }
  revokeAll(pluginId: string): void { for (const row of this.consents(pluginId)) this.revoked.add(row.consent_id); }
}

type Platform = ReturnType<typeof createPluginPlatform>;
function project(run: (platform: Platform, ledger: RevokableLedger) => Promise<void>, ledger = new RevokableLedger(), withLedger = true) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "default-consent-"));
    const file = join(directory, "board.db");
    seedDemoBoard(file);
    const store = new LocalProjectDatabase(file);
    const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db,
      artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      ui: new UiHost(), home: null, ...(withLedger ? { consents: ledger as PluginConsentLedger } : {}), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
    try { await run(platform, ledger); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}
const port = (platform: Platform, name: string) => platform.wiring.view().plugins.find(plugin => plugin.plugin_id === PROBE)?.ports.find(item => item.port === name);
const agree = (ledger: PluginConsentLedger, grants: Array<{ kind: "default_wiring" | "default_group"; subject: string }>) =>
  ledger.record({ plugin_id: PROBE, publisher_signature: SIGNATURE, manifest_digest: "digest", granted_by: "user", grants, at: "2026-10-25T00:00:00.000Z" });
const wiringOf = (port: string, signature = filesSignature) => ({ kind: "default_wiring" as const, subject: consentSubject.defaultWiring(port, { plugin_id: FILES, port: "before" }, signature) });

test("RAC-388 S-X3 a default of an unsigned plugin binds only once its publisher has agreed to it", project(async (platform, ledger) => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([snapshotPort("text", { plugin_id: FILES, port: "before" })], GROUP) }]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.source, undefined, "no agreement, no default");
  assert.equal(platform.wiring.selectedGroup(PROBE), undefined, "nor its default group");
  agree(ledger, [wiringOf("text"), { kind: "default_group", subject: "one" }]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.deepEqual([port(platform, "text")?.source, port(platform, "text")?.origin], [{ source_plugin_id: FILES, source_port: "before" }, "default"]);
  assert.equal(platform.wiring.selectedGroup(PROBE), "one");
}));

test("RAC-388 S-X3 the Host agrees for the plugins it ships, and only to read from the plugins it ships", project(async (platform, ledger) => {
  const reader = probe([snapshotPort("text", { plugin_id: FILES, port: "before" })], GROUP);
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: reader, trust: { level: "host" } }]);
  assert.deepEqual(ledger.consents(PROBE).map(row => [row.kind, row.subject, row.granted_by]), [
    ["default_wiring", consentSubject.defaultWiring("text", { plugin_id: FILES, port: "before" }, filesSignature), "host_build"],
    ["default_group", "one", "host_build"],
  ]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.origin, "default");
}));

test("RAC-388 S-X3 a Host-built plugin is not agreed to read a default from a source the Host does not ship", project(async (platform, ledger) => {
  await platform.start([{ definition: createFilesPlugin() }, { definition: probe([snapshotPort("text", { plugin_id: FILES, port: "before" })]), trust: { level: "host" } }]);
  assert.deepEqual(ledger.consents(PROBE), [], "the source runs as unsigned: there is nothing the Host's build can agree to");
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.source, undefined);
}));

test("RAC-388 S-X3 a platform with no ledger binds no default, not even a Host-built plugin's", project(async platform => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([snapshotPort("text", { plugin_id: FILES, port: "before" })], GROUP), trust: { level: "host" } }]);
  assert.equal(platform.consents, null);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.source, undefined);
  assert.equal(platform.wiring.selectedGroup(PROBE), undefined);
}, new RevokableLedger(), false));

test("RAC-389 S-X3 an agreement names the publisher the source ran under: another publisher's source with the same plugin_id is not read", project(async (platform, ledger) => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([snapshotPort("text", { plugin_id: FILES, port: "before" })]) }]);
  agree(ledger, [wiringOf("text", "someone-elses-files")]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.source, undefined, "the agreement was given for another publisher of the source");
  agree(ledger, [wiringOf("text")]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.origin, "default");
}));

test("RAC-390 S-X3 revoking an agreement takes off that default only: the person's own source stays, and the default is not bound again", project(async (platform, ledger) => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([
    snapshotPort("text", { plugin_id: FILES, port: "before" }), snapshotPort("chosen", { plugin_id: FILES, port: "before" })]) }]);
  platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: "tester", target_plugin_id: PROBE, target_port: "chosen", source_plugin_id: FILES, source_port: "after", origin: "user" });
  agree(ledger, [wiringOf("text"), wiringOf("chosen")]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.origin, "default");
  assert.deepEqual([port(platform, "chosen")?.source, port(platform, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"]);
  ledger.revokeAll(PROBE);
  for (let round = 0; round < 2; round += 1) {
    bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
    assert.equal(port(platform, "text")?.source, undefined, `round ${round}: the revoked default is off and stays off`);
    assert.deepEqual([port(platform, "chosen")?.source, port(platform, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"], "what the person chose is not touched");
  }
}));
