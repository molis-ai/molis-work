import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInputGroupDeclaration, PluginInputPortDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, bindDeclaredDefaults, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import { pluginActions } from "./fixtures/plugin-actions.js";

/**
 * W4-03 (BL-087, D-04 A): an input port's default source is declared in its own plugin's Manifest (`default_source`, and a
 * default input group), and the Host binds what the running plugins declare. There is no list of names in the Host: a plugin the
 * old table never named gets its default the same way as Coding's family, and only where nothing was chosen. A default applies
 * on a standing agreement in the consent ledger (the Host agrees for the plugins it ships): a plugin nobody agreed for is read as
 * if it declared none (tests/security-invariants-default-consent.test.ts holds the agreement rules).
 */

const FILES = "io.molis.work.files";
const PROBE = "io.molis.work.example.wordcount";

function probe(inputs: PluginInputPortDeclaration[], groups?: PluginInputGroupDeclaration[], pluginId = PROBE): PluginDefinition {
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "字数", kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-wordcount" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:read", required: true, reason: "读绑来的快照" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] }, ui: { contributions: [] },
    ports: { inputs, outputs: [], ...(groups ? { input_groups: groups } : {}) } };
  return { manifest, async start() { return { kind: "app", views: [] }; } };
}
const snapshotPort = (port: string, default_source?: PluginInputPortDeclaration["default_source"]): PluginInputPortDeclaration =>
  ({ port, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, optional: true, ...(default_source ? { default_source } : {}) });

function project(run: (platform: ReturnType<typeof createPluginPlatform>) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "plugin-default-bindings-"));
    const file = join(directory, "board.db");
    seedDemoBoard(file);
    const store = new LocalProjectDatabase(file);
    const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db,
      artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      ui: new UiHost(), home: null, consents: new MemoryPluginConsentLedger(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
    try { await run(platform); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}

const port = (platform: ReturnType<typeof createPluginPlatform>, pluginId: string, name: string) =>
  platform.wiring.view().plugins.find(plugin => plugin.plugin_id === pluginId)?.ports.find(item => item.port === name);
const defaults = (platform: ReturnType<typeof createPluginPlatform>) => platform.wiring.view().plugins.flatMap(plugin => plugin.ports
  .filter(item => item.origin === "default" && item.source).map(item => `${plugin.plugin_id.slice("io.molis.work.".length)}.${item.port} ← ${item.source!.source_plugin_id.slice("io.molis.work.".length)}.${item.source!.source_port}`)).sort();

test("W4-03-01 Coding's family is wired from its own Manifests, and Diff's snapshots group is its declared default", project(async platform => {
  // As the Host's start list gives them (`project-plugins.ts`): every one ships with the Host.
  await platform.start([{ definition: createCodingPlugin(), trust: { level: "host" } }, { definition: createShelfPlugin(), trust: { level: "host" } }, { definition: createFilesPlugin(), trust: { level: "host" } },
    { definition: createGitPlugin(), trust: { level: "host" } }, { definition: createTextStatsPlugin(), trust: { level: "host" } }, { definition: createDiffPlugin(), trust: { level: "host" } }]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  // The rows of the table this replaced (apps/local-host/src/workspace-plugin-bindings.ts before W4-03), less Coding's six inputs:
  // what the person brings into a round is now picked from project knowledge (specs/project-knowledge PMAT-18), not wired.
  assert.deepEqual(defaults(platform), [
    "diff.after ← files.after", "diff.before ← files.before", "diff.changeset ← coding.changeset", "diff.git-changeset ← git.changeset",
    "shelf.coding-changeset ← coding.changeset", "shelf.coding-report ← coding.report", "text-stats.text ← files.before",
  ]);
  assert.equal(platform.wiring.selectedGroup("io.molis.work.diff"), "snapshots");
}));

test("W4-03-01 a plugin that ships with the Host but was never in the table gets the default its own Manifest declares, and its default group, with nothing added to the Host", project(async platform => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([snapshotPort("text", { plugin_id: FILES, port: "before" }), snapshotPort("other")],
    [{ group_id: "one", title: "一份", ports: ["text"], default: true }, { group_id: "two", title: "两份", ports: ["text", "other"] }]), trust: { level: "host" } }]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.deepEqual(port(platform, PROBE, "text")?.source, { source_plugin_id: FILES, source_port: "before" });
  assert.equal(port(platform, PROBE, "text")?.origin, "default");
  assert.equal(port(platform, PROBE, "other")?.source, undefined, "a port that declares no default reads nothing");
  assert.equal(platform.wiring.selectedGroup(PROBE), "one");
}));

test("W4-03-02 a default is not bound over the person's choice, nor when its source is not running, has no such port, or offers another type", project(async platform => {
  await platform.start([{ definition: createFilesPlugin(), trust: { level: "host" } }, { definition: probe([
    snapshotPort("chosen", { plugin_id: FILES, port: "before" }),
    snapshotPort("absent", { plugin_id: "io.molis.work.git", port: "changeset" }),
    snapshotPort("unknown", { plugin_id: FILES, port: "nothing-here" }),
    snapshotPort("mistyped", { plugin_id: FILES, port: "selection" }),
  ], [{ group_id: "one", title: "一份", ports: ["chosen"], default: true }, { group_id: "two", title: "两份", ports: ["chosen", "absent"] }]), trust: { level: "host" } }]);
  platform.wiring.bind({ project_id: DEMO_PROJECT_ID, actor_id: "tester", target_plugin_id: PROBE, target_port: "chosen", source_plugin_id: FILES, source_port: "after", origin: "user" });
  platform.wiring.selectInputGroup(PROBE, "two");
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  assert.deepEqual(port(platform, PROBE, "chosen")?.source, { source_plugin_id: FILES, source_port: "after" }, "the person's source stays");
  assert.equal(port(platform, PROBE, "chosen")?.origin, "user");
  for (const name of ["absent", "unknown", "mistyped"]) assert.equal(port(platform, PROBE, name)?.source, undefined, `${name} reads nothing`);
  assert.equal(platform.wiring.selectedGroup(PROBE), "two", "the person's group stays");
}));

test("W4-03-04 a plugin nobody agreed for gets no default (not Coding's changesets, not its default group, not under a built-in's id), and no built-in reads it by default", project(async platform => {
  const installed = "io.molis.work.example.collector";
  const changesetPort = (port: string, plugin_id: string, source: string): PluginInputPortDeclaration =>
    ({ port, artifact_type_id: "coding.changeset.v1", schema_version: 1, optional: true, default_source: { plugin_id, port: source } });
  const collector = probe([changesetPort("changes", "io.molis.work.coding", "changeset"), snapshotPort("text", { plugin_id: FILES, port: "before" })],
    [{ group_id: "all", title: "全部", ports: ["changes", "text"], default: true }], installed);
  collector.manifest.artifacts.consumes.push({ artifact_type_id: "coding.changeset.v1", schema_version: 1 });
  collector.manifest.ports!.outputs.push({ port: "summary", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION });
  // One of the Host's own plugins that names the installed plugin's output as its default source.
  const reader = probe([snapshotPort("text", { plugin_id: installed, port: "summary" })]);
  // The same Manifest under a built-in's own id, given by something other than the Host's start list (a developed or generated
  // plugin can name any plugin_id): still not the Host's.
  const impostor = probe([snapshotPort("text", { plugin_id: FILES, port: "before" })], [{ group_id: "one", title: "一份", ports: ["text"], default: true }], "io.molis.work.text-stats");
  await platform.start([{ definition: createCodingPlugin(), trust: { level: "host" } }, { definition: createShelfPlugin(), trust: { level: "host" } }, { definition: createFilesPlugin(), trust: { level: "host" } },
    { definition: createDiffPlugin(), trust: { level: "host" } }, { definition: collector }, { definition: impostor }, { definition: reader, trust: { level: "host" } }]);
  bindDeclaredDefaults(platform, DEMO_PROJECT_ID, "tester");
  for (const [pluginId, name] of [[installed, "changes"], [installed, "text"], ["io.molis.work.text-stats", "text"], [PROBE, "text"]] as const) {
    assert.equal(port(platform, pluginId, name)?.source, undefined, `${pluginId}.${name} reads nothing nobody chose to give it`);
  }
  assert.equal(platform.wiring.selectedGroup(installed), undefined, "its default group is not selected either");
  assert.equal(platform.wiring.selectedGroup("io.molis.work.text-stats"), undefined);
  // The Host's own plugins are still wired to each other as before.
  assert.deepEqual(port(platform, "io.molis.work.diff", "changeset")?.source, { source_plugin_id: "io.molis.work.coding", source_port: "changeset" });
}));
