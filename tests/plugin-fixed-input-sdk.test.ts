import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CODING_CHANGESET_TYPE, DIFF_CHANGESET_TYPE, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginDefinition, PluginInputsClient, PluginManifest, PluginOutputsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createDiffPlugin, DIFF_PLUGIN_ID, diffActions, type DiffView } from "@molis-ai/molis-work-plugin-diff";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

const PROBE = "io.molis.work.fixed-input-probe", PROCESS_ONLY = "io.molis.work.process-input-probe";
const SOURCE = "io.molis.work.fixed-input-source";
const ACTOR = "tester";
const snapshot = (text: string) => ({ workspace: { workspace_id: "ws", name: "Project" }, path: ["a.ts"], text });
const type = { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1 };

function portPlugin(pluginId: string, outputs: boolean, library = true): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature: `${pluginId}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: outputs ? "artifact:write" : "artifact:read", required: outputs, reason: "Exchange exact inputs" }],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: !outputs && library ? [type] : [] },
    process_items: { produces: outputs ? [type] : [], consumes: outputs ? [] : [type] },
    ui: { contributions: [], views: [] },
    ports: { inputs: outputs ? [] : ["before", "after"].map(port => ({ port, ...type })), outputs: outputs ? [{ port: "after", ...type }] : [] },
  };
}

function openProject(databasePath: string) {
  const store = new LocalProjectDatabase(databasePath);
  const options = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(options), processItems = new ProcessItemsModule(options);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({ actions, db: store.db, project_id: DEMO_PROJECT_ID, actor_id: ACTOR,
    artifacts, processItems, ui: new UiHost(), home: null,
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  return { store, artifacts, processItems, platform, actions };
}

async function closeProject(project: ReturnType<typeof openProject>) {
  await project.platform.closeCoordination();
  for (const record of project.platform.runtime.list()) {
    if (record.state === "running") await project.platform.runtime.stop(record.install_id, { preserve_enabled: true });
  }
  project.store.close();
}

async function startPlugins(project: ReturnType<typeof openProject>) {
  const clients = new Map<string, PluginInputsClient>();
  let outputs!: PluginOutputsClient;
  const probe = (id: string, library: boolean): PluginDefinition => ({ manifest: portPlugin(id, false, library),
    async start(context) { assert.ok(context.services?.inputs); clients.set(id, context.services.inputs);
      return { kind: "app", views: [], onUpstreamReady: () => {} }; } });
  const source: PluginDefinition = { manifest: portPlugin(SOURCE, true), async start(context) {
    assert.ok(context.services?.outputs); outputs = context.services.outputs; return { kind: "app", views: [] }; } };
  const diff = createDiffPlugin();
  const report = await project.platform.start([
    { definition: source }, { definition: probe(PROBE, true), grants: ["artifact:read"] },
    { definition: probe(PROCESS_ONLY, false), grants: ["artifact:read"] },
    { definition: { ...diff, async start(context) { assert.ok(context.services?.inputs); clients.set(DIFF_PLUGIN_ID, context.services.inputs);
      return await diff.start(context); } }, trust: { level: "host" } },
  ]);
  assert.deepEqual(report.failed, []); assert.deepEqual(report.blocked, []);
  return { clients, get outputs() { return outputs; } };
}

function pinSnapshot(project: ReturnType<typeof openProject>, artifactId: string, version: number, text: string) {
  const artifact = project.artifacts.commands.registerVersion({ ...pinnedArtifact(artifactId, { kind: "file", id: artifactId }, String(version)),
    project_id: DEMO_PROJECT_ID, actor_id: ACTOR, artifact_id: artifactId, version, ...type,
    producer: { plugin_id: "io.molis.work.files", plugin_version: "1.0.0", binding_signature: "official-files-binding" },
    content: { kind: "inline", payload: snapshot(text) } }).artifact;
  return { artifact_id: artifact.artifact_id, version: artifact.version };
}

async function readDiff(project: ReturnType<typeof openProject>) {
  const result = await project.actions.client.invoke({ actor_id: ACTOR, project_id: DEMO_PROJECT_ID, audience: "user", permissions: ["artifact:read"] },
    { ...diffActions.state, provider_id: DIFF_PLUGIN_ID }, {}) as { view: DiffView };
  return result.view;
}

function bind(project: ReturnType<typeof openProject>, pluginId: string, port: string, reference: ArtifactReference) {
  project.platform.wiring.bindArtifact({ target_plugin_id: pluginId, target_port: port, actor_id: ACTOR,
    artifact_id: reference.artifact_id, version: reference.version });
}

function assertRead(clients: Map<string, PluginInputsClient>, reference: ArtifactReference, text: string) {
  for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) {
    const inputs = clients.get(pluginId)!;
    assert.deepEqual(inputs.status(), { status: "ready", ports: ["before", "after"] });
    assert.deepEqual(inputs.reference("after"), { artifact_id: reference.artifact_id, version: reference.version });
    const record = inputs.read("after");
    assert.equal(record?.artifact_id, reference.artifact_id); assert.equal(record?.version, reference.version);
    assert.deepEqual(record?.payload, snapshot(text));
  }
}

function assertRows(view: DiffView, after: string) {
  assert.equal(view.phase, "ready"); assert.equal(view.group, "snapshots");
  assert.deepEqual(view.rows.map(row => ({ kind: row.kind, text: row.text, ending: row.ending })), [
    { kind: "delete", text: "original", ending: "\n" }, { kind: "insert", text: after, ending: "\n" },
  ]);
}

test("W2-18-FIXED-INPUT-01, W2-18-FIXED-INPUT-02: real library bindings reach SDK and Diff, stay exact, recover and reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-fixed-input-sdk-")), databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  let project: ReturnType<typeof openProject> | undefined = openProject(databasePath);
  try {
    let started = await startPlugins(project);
    const before = pinSnapshot(project, "before", 1, "original\n");
    const first = pinSnapshot(project, "after", 1, "fixed\n"), second = pinSnapshot(project, "after", 2, "newer\n");
    const graph = project.platform.wiring;
    graph.selectInputGroup(DIFF_PLUGIN_ID, "snapshots");
    const ordinary = started.outputs.publish({ port: "after", content: { kind: "inline", payload: snapshot("ordinary\n") } }).artifact;
    for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) {
      bind(project, pluginId, "before", before);
      graph.bind({ project_id: DEMO_PROJECT_ID, actor_id: ACTOR, target_plugin_id: pluginId, target_port: "after",
        source_plugin_id: SOURCE, source_port: "after", origin: "user" });
    }
    assertRead(started.clients, ordinary, "ordinary\n"); assertRows(await readDiff(project), "ordinary");
    assert.throws(() => bind(project!, PROBE, "after", ordinary), { code: "plugin.port_artifact_invalid" }, "a process item cannot be a library binding");
    assert.throws(() => bind(project!, PROCESS_ONLY, "after", first), { code: "plugin.port_artifact_invalid" }, "port type alone does not declare library consumption");
    assert.equal(graph.view().plugins.find(plugin => plugin.plugin_id === PROCESS_ONLY)!.ports.find(port => port.port === "after")!.artifact, undefined);

    for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) bind(project, pluginId, "after", first);
    assertRead(started.clients, first, "fixed\n"); assertRows(await readDiff(project), "fixed");
    assert.equal((await readDiff(project)).after?.content_version, 1, "the latest version already exists but is not selected");
    for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) bind(project, pluginId, "after", second);
    assertRead(started.clients, second, "newer\n"); assertRows(await readDiff(project), "newer");

    project.artifacts.commands.archiveVersion({ project_id: DEMO_PROJECT_ID, actor_id: ACTOR, ...second });
    for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) {
      const inputs = started.clients.get(pluginId)!;
      assert.equal(inputs.status().status, "missing"); assert.equal(inputs.reference("after"), null); assert.equal(inputs.read("after"), null);
      assert.equal(graph.view().plugins.find(plugin => plugin.plugin_id === pluginId)!.ports.find(port => port.port === "after")!.state, "unavailable");
    }
    assert.equal((await readDiff(project)).phase, "waiting"); assert.deepEqual((await readDiff(project)).rows, []);
    for (const pluginId of [PROBE, DIFF_PLUGIN_ID]) bind(project, pluginId, "after", first);
    pinSnapshot(project, "after", 3, "latest\n");
    assertRead(started.clients, first, "fixed\n"); assertRows(await readDiff(project), "fixed");

    const installId = project.platform.supervisor.state(PROBE)!.install_id!;
    const oldProbe = started.clients.get(PROBE)!;
    await project.platform.runtime.stop(installId);
    project.platform.runtime.grant(installId, []);
    assert.equal((await project.platform.supervisor.restart(PROBE)).status, "running");
    const denied = started.clients.get(PROBE)!;
    assert.notEqual(denied, oldProbe, "the denied client belongs to a fresh activation without a read grant");
    assert.throws(() => denied.status(), { code: "plugin.grant_denied" });
    assert.throws(() => denied.reference("after"), { code: "plugin.grant_denied" });
    assert.throws(() => denied.read("after"), { code: "plugin.grant_denied" });
    // BL-411: the stopped activation's client is refused too and, outside every call, throws nothing: each read gives undefined.
    assert.equal(oldProbe.status(), undefined);
    assert.equal(oldProbe.reference("after"), undefined);
    assert.equal(oldProbe.read("after"), undefined);
    await project.platform.runtime.stop(installId);
    project.platform.runtime.grant(installId, ["artifact:read"]);
    assert.equal((await project.platform.supervisor.restart(PROBE)).status, "running");
    assertRead(started.clients, first, "fixed\n");

    const oldClients = started.clients;
    await closeProject(project); project = undefined;
    project = openProject(databasePath); started = await startPlugins(project);
    assertRead(started.clients, first, "fixed\n"); assertRows(await readDiff(project), "fixed");
    // BL-411: the closed project's clients are refused and, outside every call, throw nothing: no reference, not even null.
    for (const inputs of oldClients.values()) assert.equal(inputs.reference("after"), undefined);
    assert.equal(project.platform.wiring.view().plugins.find(plugin => plugin.plugin_id === DIFF_PLUGIN_ID)!.ports.find(port => port.port === "after")!.artifact?.version, 1);
    project.artifacts.commands.markUnavailable({ project_id: DEMO_PROJECT_ID, actor_id: ACTOR, ...first, reason: "fixture content lost" });
    const diff = started.clients.get(DIFF_PLUGIN_ID)!;
    assert.equal(diff.status().status, "missing"); assert.equal(diff.reference("after"), null); assert.equal(diff.read("after"), null);
    assert.deepEqual((await readDiff(project)).rows, [], "losing version 1 does not select available version 3");
  } finally {
    if (project) await closeProject(project);
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const selected of [
  { group: "change-set", port: "changeset", artifactType: CODING_CHANGESET_TYPE,
    payload: { scope: "run-frozen", run_id: "run", applied: true, coverage: "text-reviews", files: [
      { path: "a.ts", kind: "modified", diff: "", added_lines: 1, removed_lines: 1,
        review: { review_id: "review", before_text: "original\n", after_text: "saved\n", decision: "approved", execution: "applied" } },
    ] } },
  { group: "git-change-set", port: "git-changeset", artifactType: DIFF_CHANGESET_TYPE,
    payload: { workspace: { workspace_id: "ws", name: "Project" }, path: ["a.ts"], before_exists: true, after_exists: true,
      before: "original\n", after: "saved\n", source: { kind: "comparison", comparison_id: "fixed" } } },
]) {
  test(`W2-18-FIXED-INPUT-01: Diff reads a library ${selected.group} through the bound SDK input`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "plugin-fixed-changeset-")), databasePath = join(directory, "project.db");
    seedDemoBoard(databasePath);
    const project = openProject(databasePath);
    try {
      const { clients } = await startPlugins(project);
      const reference = { artifact_id: "saved-change", version: 1 };
      project.artifacts.commands.registerVersion({ ...pinnedArtifact("Saved change"), project_id: DEMO_PROJECT_ID, actor_id: ACTOR,
        ...reference, artifact_type_id: selected.artifactType, schema_version: 1,
        producer: { plugin_id: "io.molis.work.saved-change", plugin_version: "1.0.0", binding_signature: "saved-change-binding" },
        content: { kind: "inline", payload: selected.payload } });
      project.platform.wiring.selectInputGroup(DIFF_PLUGIN_ID, selected.group);
      bind(project, DIFF_PLUGIN_ID, selected.port, reference);
      const inputs = clients.get(DIFF_PLUGIN_ID)!;
      assert.deepEqual(inputs.status(), { status: "ready", ports: [selected.port] });
      assert.deepEqual(inputs.reference(selected.port), reference);
      assert.deepEqual(inputs.read(selected.port)?.payload, selected.payload);
      const view = await readDiff(project);
      assert.equal(view.phase, "ready"); assert.equal(view.group, selected.group); assert.equal(view.partial, false);
      assert.deepEqual(view.rows.map(row => ({ kind: row.kind, text: row.text, ending: row.ending })), [
        { kind: "delete", text: "original", ending: "\n" }, { kind: "insert", text: "saved", ending: "\n" },
      ]);
    } finally {
      await closeProject(project); rmSync(directory, { recursive: true, force: true });
    }
  });
}
