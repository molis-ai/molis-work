import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, homeStores, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// BL-375 (98-1): several plugins may declare and record one process item type. Each version carries the producer the platform
// recorded, and a consumer takes every version it may read, or narrows to one producer or type. A 成果 type keeps one owner (S-82).
// Everything goes through the real project platform: the supervisor's installs, the declaration owners, the version stores that
// ask the project's own installations before they write (S-81), and the services a plugin is started with.

const RESEARCH = "io.molis.work.example.research", WRITING = "io.molis.work.example.writing", READER = "io.molis.work.example.reader";
const EXCERPT = "example.research-excerpt", NOTE = "example.research-note";
const ACTOR = "tester";

interface Shape { records?: string[]; reads?: string[]; pins?: string[]; read?: boolean }

/** An installed app plugin of its own publisher: the process item types it records and reads, and the 成果 types it pins. */
function plugin(id: string, shape: Shape, started: Map<string, PluginHostServices>): PluginDefinition {
  const previews = (shape.pins ?? []).map(type => defineArtifactPreviewAction(`${type}.preview`, 1, "笔记", []));
  const types = (list: string[] = []) => list.map(artifact_type_id => ({ artifact_type_id, schema_version: 1 }));
  return { manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: id, kind: "app",
    publisher: { publisher_id: id, signature: `sig-${id}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:write", required: true, reason: "记下材料" }, { permission: "artifact:read", required: shape.read !== false, reason: "读材料" }],
    capabilities: { provides: [], consumes: [] }, ui: { contributions: [], views: [] }, actions: previews,
    artifacts: { produces: (shape.pins ?? []).map(type => ({ artifact_type_id: type, schema_version: 1, title: type, preview: { capability_id: `${type}.preview`, version: 1 } })), consumes: [] },
    process_items: { produces: types(shape.records), consumes: types(shape.reads) } },
  async start(context) {
    started.set(id, context.services!);
    return { kind: "app", views: [], actions: previews.map(preview => ({ ...preview, async handle() { return { media_type: "text/plain", text: "" }; } })) };
  } } as PluginDefinition;
}
/** The entry a project's start list gives: the definition, and the release row that keeps its Manifest on disk. */
const entry = (definition: PluginDefinition) => ({ definition, trust: UNSIGNED_TRUST, releaseArtifact: { capture: () => "export {}", restore: () => definition } });

/** A project of a fresh Home with the real platform; the version stores ask its own supervisor's installs before they write. */
function project(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-shared-process-types-")));
  const file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), versions = openProjectVersionStores(store);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: ACTOR, db: store.db, journal: store, ...versions, ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } });
  t.after(async () => {
    try { await platform.closeCoordination(); for (const instance of platform.runtime.list()) if (instance.state === "running") await platform.runtime.stop(instance.install_id); }
    finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  return { platform, versions, supervisor: platform.supervisor,
    install: (definition: PluginDefinition) => platform.runtime.install({ definition, deployment: "local", trust: UNSIGNED_TRUST, grants: ["artifact:read", "artifact:write"] }) };
}

const excerpt = (artifact_id: string, title: string) => ({ artifact_id, version: 1, artifact_type_id: EXCERPT, schema_version: 1,
  content: { kind: "inline" as const, payload: { quote: title } }, metadata: { title } });
const rows = (listed: ReturnType<NonNullable<PluginHostServices["artifacts"]>["listConsumable"]>) =>
  listed.map(row => [row.artifact_id, row.producer_plugin_id]).sort((a, b) => a[0]!.localeCompare(b[0]!));

for (const order of [[RESEARCH, WRITING], [WRITING, RESEARCH]] as const) {
  test(`BL375-01 BL375-02 BL375-03 BL375-04 BL375-05 two plugins record one process item type, installed ${order[0] === RESEARCH ? "research first" : "writing first"}; a reader takes all, one producer's, or nothing`, { timeout: 180_000 }, async t => {
    const p = project(t), started = new Map<string, PluginHostServices>();
    const definitions = new Map([
      [RESEARCH, plugin(RESEARCH, { records: [EXCERPT], reads: [EXCERPT], pins: [NOTE] }, started)],
      [WRITING, plugin(WRITING, { records: [EXCERPT] }, started)],
      [READER, plugin(READER, { reads: [EXCERPT] }, started)],
    ]);
    // BL375-01: whichever is installed first, the second one with the same process item type is not refused (S-82 is about 成果 only).
    const [first, second] = order;
    await p.supervisor.start([entry(definitions.get(first)!)]);
    await p.supervisor.start([entry(definitions.get(first)!), entry(definitions.get(second)!), entry(definitions.get(READER)!)]);
    assert.deepEqual([RESEARCH, WRITING, READER].map(id => p.supervisor.state(id)?.status), ["running", "running", "running"]);

    // Both record; the producer is the one the platform ran, whatever the input says.
    const forged = { project_id: "forged-project", actor_id: "forged", producer: { plugin_id: READER, plugin_version: "9", binding_signature: "forged" } };
    const research = started.get(RESEARCH)!.processItems!.record({ ...excerpt("research:1", "研究摘录"), ...forged } as Parameters<NonNullable<PluginHostServices["processItems"]>["record"]>[0]);
    const writing = started.get(WRITING)!.processItems!.record({ ...excerpt("writing:1", "写作摘录"), ...forged } as Parameters<NonNullable<PluginHostServices["processItems"]>["record"]>[0]);
    assert.deepEqual([research.artifact.producer_plugin_id, writing.artifact.producer_plugin_id], [RESEARCH, WRITING]);
    assert.deepEqual([research.artifact.producer_binding_signature, writing.artifact.producer_binding_signature], [`sig-${RESEARCH}`, `sig-${WRITING}`]);
    assert.deepEqual([research.artifact.project_id, research.artifact.owner_actor_id], [DEMO_PROJECT_ID, ACTOR]);
    // A version another user recorded under the research plugin is personal to that user.
    p.versions.processItems.commands.registerVersion({ ...excerpt("research:other-person", "别人的摘录"), project_id: DEMO_PROJECT_ID, actor_id: "someone-else",
      producer: { plugin_id: RESEARCH, plugin_version: "1.0.0", binding_signature: `sig-${RESEARCH}` } });

    const reader = started.get(READER)!.artifacts!;
    // BL375-02: no filter is everything the reader may read, from both producers, each named by the platform.
    assert.deepEqual(rows(reader.listConsumable()), [["research:1", RESEARCH], ["writing:1", WRITING]]);
    assert.deepEqual(reader.listConsumable().map(row => row.title).sort(), ["写作摘录", "研究摘录"]);
    // BL375-03: one producer's only, or one type.
    assert.deepEqual(rows(reader.listConsumable({ producer_plugin_id: RESEARCH })), [["research:1", RESEARCH]]);
    assert.deepEqual(rows(reader.listConsumable({ producer_plugin_id: WRITING })), [["writing:1", WRITING]]);
    assert.deepEqual(rows(reader.listConsumable({ artifact_type_id: EXCERPT, producer_plugin_id: WRITING })), [["writing:1", WRITING]]);
    assert.deepEqual(rows(reader.listConsumable({ artifact_type_id: EXCERPT })), [["research:1", RESEARCH], ["writing:1", WRITING]]);
    // The research plugin reads the writing plugin's excerpt by type, as any consumer of the type does.
    assert.deepEqual(rows(started.get(RESEARCH)!.artifacts!.listConsumable({ producer_plugin_id: WRITING })), [["writing:1", WRITING]]);
    assert.equal(reader.read({ artifact_id: "writing:1", version: 1 })?.producer_plugin_id, WRITING);

    // BL375-04: no match is an empty list, not an error.
    assert.deepEqual(reader.listConsumable({ producer_plugin_id: READER }), [], "a producer that recorded nothing");
    assert.deepEqual(reader.listConsumable({ producer_plugin_id: "io.molis.work.example.never-installed" }), [], "a producer never installed");
    assert.deepEqual(reader.listConsumable({ artifact_type_id: NOTE }), [], "a type the reader does not declare");
    // BL375-05: a filter never widens what the reader may read: another user's personal version, and an undeclared type, stay out.
    assert.equal(reader.listConsumable({ producer_plugin_id: RESEARCH }).some(row => row.artifact_id === "research:other-person"), false);
    assert.deepEqual(started.get(WRITING)!.artifacts!.listConsumable({ producer_plugin_id: RESEARCH }), [], "the writing plugin does not declare that it reads excerpts");
    assert.throws(() => reader.listConsumable({ producer_plugin_id: "" }), { code: "actions.input_invalid" });
  });
}

test("BL375-05 a reader without the read grant is refused, with or without a filter", { timeout: 180_000 }, async t => {
  const p = project(t), started = new Map<string, PluginHostServices>();
  const NO_GRANT = "io.molis.work.example.no-grant";
  await p.supervisor.start([entry(plugin(RESEARCH, { records: [EXCERPT] }, started)), entry(plugin(NO_GRANT, { reads: [EXCERPT], read: false }, started))]);
  started.get(RESEARCH)!.processItems!.record(excerpt("research:1", "研究摘录"));
  const denied = started.get(NO_GRANT)!.artifacts!;
  for (const filter of [undefined, { producer_plugin_id: RESEARCH }]) assert.throws(() => denied.listConsumable(filter), { code: "plugin.grant_denied" });
});

test("BL375-06 S-82 a 成果 type still has one owner: whichever is installed second is refused, while the shared process item type is not the reason", { timeout: 180_000 }, async t => {
  for (const [first, second] of [[RESEARCH, WRITING], [WRITING, RESEARCH]] as const) {
    const p = project(t), started = new Map<string, PluginHostServices>();
    const both = (id: string) => plugin(id, { records: [EXCERPT], pins: [NOTE] }, started);
    await p.supervisor.start([entry(both(first))]);
    assert.throws(() => p.install(both(second)), { code: "plugin.definition_conflict", message: new RegExp(`成果类型 ${NOTE} 已由 ${first.replaceAll(".", "\\.")} 声明`) });
    assert.doesNotThrow(() => p.install(plugin(second, { records: [EXCERPT] }, started)), "the same plugin without the 成果 type installs");
  }
});
