import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// BL-394: the project half of a dual-instance plugin that the supervisor restores from its kept release (the installed version,
// when the build the Host lists cannot take it over) is still the project half: it offers only its own actions and runs, rather
// than being checked against the whole Manifest and recorded as crashed.

const PLUGIN_ID = "io.molis.work.example.dual-restored";
const action = (name: string): ActionDefinition<Record<string, never>, string> => ({
  capability_id: `dual-restored.${name}`, version: 1, operation: "query",
  action: { title: name, description: `${name} 那一半的动作`, kind: "query", scope: "project", audiences: ["user"], permissions: [],
    subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } },
});
const HOME_HALF = action("home"), PROJECT_HALF = action("project");

/** Both halves share one Manifest; the project half redeems only its own action. */
function build(version: string): PluginDefinition {
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version, name: "Dual restored fixture", kind: "app",
    publisher: { publisher_id: "example", signature: "dual-restored-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [HOME_HALF, PROJECT_HALF],
  };
  return { manifest, async start() { return { kind: "app", views: [], actions: [{ ...PROJECT_HALF, handle: () => version }] }; }, async stop() {} };
}

function hostProcess(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({
    actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  const offered = async () => (await actions.client.discover({ actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [] }))
    .map(row => row.capability_id).filter(id => id.startsWith("dual-restored.")).sort();
  return { store, platform, offered };
}

/** The project half's start-list entry, with the release adapter that hands back the kept build it was given. */
function projectHalf(definition: PluginDefinition, kept: Map<string, PluginDefinition>) {
  return { definition, dual_instance: true as const,
    releaseArtifact: { capture: () => { kept.set(definition.manifest.version, definition); return definition.manifest.version; },
      restore: (source: string) => kept.get(source) ?? definition } };
}

test("RAC-330 BL-394 a dual-instance project half restored from its kept release still offers only its half and runs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dual-restored-"));
  const kept = new Map<string, PluginDefinition>();
  try {
    const first = hostProcess(directory);
    try {
      assert.deepEqual((await first.platform.start([projectHalf(build("1.0.0"), kept)])).running, [PLUGIN_ID]);
      assert.deepEqual(await first.offered(), [PROJECT_HALF.capability_id]);
    } finally { await first.platform.closeCoordination(); first.store.close(); }

    // The next process lists 2.0.0, which declares no way to take 1.0.0 over, so the supervisor restores the kept 1.0.0 build.
    const next = hostProcess(directory);
    try {
      const report = await next.platform.start([projectHalf(build("2.0.0"), kept)]);
      assert.deepEqual(report.running, [PLUGIN_ID], `the restored half is not recorded as crashed: ${JSON.stringify(report)}`);
      assert.equal(next.platform.supervisor.manifest(PLUGIN_ID)?.version, "1.0.0");
      assert.deepEqual(await next.offered(), [PROJECT_HALF.capability_id], "it offers its own half, not the Home half's action");
    } finally { await next.platform.closeCoordination(); next.store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
