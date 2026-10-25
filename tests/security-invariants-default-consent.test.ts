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
type Restart = (entries: Parameters<Platform["start"]>[0]) => Promise<Platform>;
function project(run: (platform: Platform, ledger: RevokableLedger, restart: Restart) => Promise<void>, ledger = new RevokableLedger(), withLedger = true) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "default-consent-"));
    const file = join(directory, "board.db");
    seedDemoBoard(file);
    let store = new LocalProjectDatabase(file);
    const create = () => createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db,
      artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      ui: new UiHost(), home: null, ...(withLedger ? { consents: ledger as PluginConsentLedger } : {}), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
    let platform = create();
    const close = async () => {
      await platform.closeCoordination();
      for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
    };
    const restart: Restart = async entries => {
      await close();
      store.close();
      store = new LocalProjectDatabase(file);
      platform = create();
      await platform.start(entries);
      return platform;
    };
    try { await run(platform, ledger, restart); }
    finally { try { await close(); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); } }
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

test("RAC-389-T4-SWITCH S-78 a bound default is removed after its source changes publisher signature and stays removed on reevaluation and restart; the person's source stays", project(async (platform, ledger, restart) => {
  const source = { definition: createFilesPlugin(), trust: { level: "host" as const } };
  const reader = { definition: probe([
    snapshotPort("text", { plugin_id: FILES, port: "before" }), snapshotPort("chosen", { plugin_id: FILES, port: "before" })]) };
  await platform.start([source, reader]);
  platform.runtime.install({ definition: reader.definition, deployment: "local", trust: { level: "unsigned" },
    grants: ["artifact:read"], consents: [wiringOf("text"), wiringOf("chosen")] });
  const consents = ledger.consents(PROBE);
  platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: "tester", target_plugin_id: PROBE, target_port: "chosen", source_plugin_id: FILES, source_port: "after", origin: "user" });
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.deepEqual([port(platform, "text")?.source, port(platform, "text")?.origin], [{ source_plugin_id: FILES, source_port: "before" }, "default"]);

  const replacement: PluginDefinition = { ...createFilesPlugin(), manifest: { ...source.definition.manifest,
    publisher: { ...source.definition.manifest.publisher, signature: "another-files-publisher" } } };
  // Same display labels, id, version and port declarations; only the signature in the consent subject changes.
  assert.deepEqual({ ...replacement.manifest, publisher: { ...replacement.manifest.publisher, signature: filesSignature } }, source.definition.manifest);
  let current = await restart([{ ...source, definition: replacement }, reader]);
  assert.equal(current.supervisor.state(FILES)?.status, "running");
  assert.equal(current.supervisor.manifest(FILES)?.publisher.signature, "another-files-publisher");
  assert.equal(port(current, "text")?.origin, "default", "the previously bound default was loaded from the project database before reconciliation");
  for (let round = 0; round < 2; round += 1) {
    bindDeclaredDefaults(current, DEMO_PROJECT_ID, "tester");
    assert.equal(port(current, "text")?.source, undefined, `round ${round}: the old agreement never reads the new publisher`);
    assert.deepEqual([port(current, "chosen")?.source, port(current, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"]);
  }
  current = await restart([{ ...source, definition: replacement }, reader]);
  assert.equal(port(current, "text")?.source, undefined, "removing the default was persisted, not hidden in a view");
  bindDeclaredDefaults(current, DEMO_PROJECT_ID, "tester");
  assert.equal(port(current, "text")?.source, undefined);
  assert.deepEqual([port(current, "chosen")?.source, port(current, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"]);
  assert.deepEqual(ledger.consents(PROBE), consents, "source replacement neither grants a new agreement nor rewrites the old one");
}));

test("RAC-389-T4-RETURN S-78 a bound default is removed while its source is absent from the start list and restored when the same source returns under the standing agreement; the person's source stays", project(async (platform, ledger, restart) => {
  const source = { definition: createFilesPlugin(), trust: { level: "host" as const } };
  const reader = { definition: probe([
    snapshotPort("text", { plugin_id: FILES, port: "before" }), snapshotPort("chosen", { plugin_id: FILES, port: "before" })]) };
  await platform.start([source, reader]);
  platform.runtime.install({ definition: reader.definition, deployment: "local", trust: { level: "unsigned" },
    grants: ["artifact:read"], consents: [wiringOf("text"), wiringOf("chosen")] });
  const consents = ledger.consents(PROBE);
  platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: "tester", target_plugin_id: PROBE, target_port: "chosen", source_plugin_id: FILES, source_port: "after", origin: "user" });
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.equal(port(platform, "text")?.origin, "default");

  let current = await restart([reader]);
  assert.equal(current.supervisor.manifest(FILES), undefined, "the source is absent from the actual new supervisor, not just marked in a fixture");
  assert.ok(current.runtime.list().some(record => record.plugin_id === FILES), "its old installation record alone cannot keep a default alive");
  assert.equal(port(current, "text")?.origin, "default", "the previous binding survived the platform restart");
  for (let round = 0; round < 2; round += 1) {
    bindDeclaredDefaults(current, DEMO_PROJECT_ID, "tester");
    assert.equal(port(current, "text")?.source, undefined, `round ${round}: no default while the source is absent`);
    assert.deepEqual([port(current, "chosen")?.source, port(current, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"]);
  }
  current = await restart([source, reader]);
  assert.equal(current.supervisor.state(FILES)?.status, "running");
  assert.equal(current.supervisor.manifest(FILES)?.publisher.signature, filesSignature);
  assert.equal(port(current, "text")?.source, undefined, "the removal was persisted; restoring the default still requires evaluation");
  for (let round = 0; round < 2; round += 1) {
    bindDeclaredDefaults(current, DEMO_PROJECT_ID, "tester");
    assert.deepEqual([port(current, "text")?.source, port(current, "text")?.origin], [{ source_plugin_id: FILES, source_port: "before" }, "default"]);
    assert.deepEqual([port(current, "chosen")?.source, port(current, "chosen")?.origin], [{ source_plugin_id: FILES, source_port: "after" }, "user"]);
  }
  assert.deepEqual(ledger.consents(PROBE), consents, "the original agreement survived absence and return without a new grant");
}));
