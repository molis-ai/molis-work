import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactPluginInputs, bindArtifactPluginInput, createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// 「交给插件作为输入」 (artifact-positioning, 2026-10-04): a 成果 version's detail lists the running plugins' input ports that take its
// type. Shelf had the one built-in input for a Coding report; since 44B it is a platform part with no ports and lists the project's
// results itself (「接收项目成果」), so a report's detail offers no Shelf input and giving it one is refused, changing nothing.
test("a Coding report's detail offers no Shelf input since Shelf lists the project's results itself, and giving it one is refused", async t => {
  const home = mkdtempSync(join(tmpdir(), "artifact-plugin-inputs-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "端口输入", actor_id: "web-user" });
  for (const plugin_id of ["coding"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "web-user" });
  catalog.close();
  const prefix = "/projects/" + project.project_id, token = "artifact-plugin-inputs-control-token-123456789";
  const store = new LocalProjectDatabase(project.database_path), app = openProjectVersionStores(store);
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, project.project_id); store.close(); rmSync(home, { recursive: true, force: true }); });
  const reference = { artifact_id: "coding-report:session:run", version: 1 };
  app.artifacts.commands.registerVersion({ ...pinnedArtifact("固定的执行报告"), project_id: project.project_id, actor_id: "web-user", ...reference,
    artifact_type_id: "coding.report.v1", schema_version: 1, producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.50.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload: { title: "固定的执行报告", run_id: "run", source: { session_id: "session" }, body_markdown: "## 报告" } } });
  // Shelf lists the report among the project's results it can take in.
  const results = await fetch(origin + prefix + "/api/platform/shelf/project-results");
  assert.equal(results.status, 200);
  assert.deepEqual((await results.json() as { results: Array<{ reference: unknown }> }).results.map(row => row.reference), [reference]);
  const detail = await (await fetch(origin + prefix + `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/1`, { headers: { "x-molis-work-fragment": "detail" } })).text();
  assert.doesNotMatch(detail, /data-artifact-port data-plugin-id="system\.shelf"/u, "no Shelf input row");
  const given = await fetch(origin + prefix + "/api/artifacts/plugin-inputs", { method: "POST", headers: { origin, "content-type": "application/json",
    "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token }, body: JSON.stringify({ reference, plugin_id: "system.shelf", port: "coding-report" }) });
  assert.equal(given.status, 400, await given.text());
});

// The positive path (44B handed this back): no built-in plugin has a library input any more, so a probe that really declares one — an
// input port taking a fixed Coding report, and the library consumption that lets it read one — stands in. The rows the detail page draws
// list its port; giving it the version makes the port read exactly that version, and putting back the former source leaves it as before.
test("a plugin with a declared library input is offered a report's version, reads exactly it once given, and is put back on request", async t => {
  const directory = mkdtempSync(join(tmpdir(), "artifact-plugin-inputs-probe-")), databasePath = join(directory, "project.db");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  const journal = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const artifacts = new ArtifactsModule(journal);
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_PROJECT_ID), db: store.db, project_id: DEMO_PROJECT_ID, actor_id: "web-user",
    artifacts, processItems: new ProcessItemsModule(journal), ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  t.after(async () => {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id, { preserve_enabled: true });
    store.close(); rmSync(directory, { recursive: true, force: true });
  });
  const report = { artifact_type_id: "coding.report.v1", schema_version: 1 }, PROBE = "com.example.report-input-probe";
  const manifest: PluginManifest = { schema_version: 1, host_api_version: 1, plugin_id: PROBE, version: "1.0.0", name: "报告输入", kind: "app",
    publisher: { publisher_id: "molis", signature: "probe-report-input" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "artifact:read", required: true, reason: "读取固定的执行报告" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [report] }, process_items: { produces: [], consumes: [report] }, ui: { contributions: [], views: [] },
    ports: { inputs: [{ port: "report", ...report, optional: true }], outputs: [] } };
  const started = await platform.start([{ definition: { manifest, async start() { return { kind: "app", views: [], onUpstreamReady: () => {} }; } }, grants: ["artifact:read"] }]);
  assert.deepEqual(started.failed, []); assert.deepEqual(started.blocked, []);
  const register = (version: number) => artifacts.commands.registerVersion({ ...pinnedArtifact("固定的执行报告"), project_id: DEMO_PROJECT_ID, actor_id: "web-user",
    artifact_id: "coding-report:session:run", version, ...report, producer: { plugin_id: "io.molis.work.coding", plugin_version: "1.50.0", binding_signature: "official-coding-binding" },
    content: { kind: "inline", payload: { title: "固定的执行报告", run_id: "run", source: { session_id: "session" }, body_markdown: `## 报告 ${version}` } } }).artifact;
  const first = register(1), second = register(2);
  const probeRows = (rows: ReturnType<typeof artifactPluginInputs>) => rows.filter(row => row.plugin_id === PROBE).map(row => [row.port, row.source]);
  assert.deepEqual(probeRows(artifactPluginInputs(platform, first)), [["report", "none"]], "the detail offers the probe's input, reading nothing yet");
  assert.deepEqual(probeRows(bindArtifactPluginInput(platform, first, { plugin_id: PROBE, port: "report", restore: false }, "web-user", DEMO_PROJECT_ID)), [["report", "this"]]);
  assert.deepEqual(platform.wiring.view().plugins.find(plugin => plugin.plugin_id === PROBE)!.ports.find(port => port.port === "report")!.artifact,
    { artifact_id: first.artifact_id, version: 1 }, "the port reads exactly this version");
  assert.deepEqual(probeRows(artifactPluginInputs(platform, second)), [["report", "another-version"]], "the newer version is not picked up by itself");
  assert.deepEqual(probeRows(bindArtifactPluginInput(platform, second, { plugin_id: PROBE, port: "report", restore: true }, "web-user", DEMO_PROJECT_ID)), [["report", "another-version"]],
    "a page out of date does not put back a port that reads another version");
  assert.deepEqual(probeRows(bindArtifactPluginInput(platform, first, { plugin_id: PROBE, port: "report", restore: true }, "web-user", DEMO_PROJECT_ID)), [["report", "none"]],
    "putting back leaves the port with its former source");
  assert.throws(() => bindArtifactPluginInput(platform, first, { plugin_id: PROBE, port: "missing", restore: false }, "web-user", DEMO_PROJECT_ID), { code: "actions.input_invalid" });
});
