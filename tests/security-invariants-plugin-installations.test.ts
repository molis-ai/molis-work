import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { PluginDefinition, PluginInstallationClient, PluginInstallationView, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";

function fixture(t: TestContext, projectId = DEMO_PROJECT_ID) {
  const directory = mkdtempSync(join(tmpdir(), "plugin-installations-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), platforms: ReturnType<typeof createPluginPlatform>[] = [];
  t.after(async () => {
    for (const platform of platforms) {
      await platform.closeCoordination();
      for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
    }
    store.close(); rmSync(directory, { recursive: true, force: true });
  });
  const start = async (name: string, declare = true) => {
    const actions = pluginActions(store, projectId);
    const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
    const platform = createPluginPlatform({ db: store.db, project_id: projectId, actor_id: "tester", actions, home: null,
      artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
      privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
    platforms.push(platform);
    const id = "io.molis.work.example." + name;
    const read: ActionDefinition = { capability_id: name + ".installations", version: 1, operation: "query", action: { title: "Installations", description: "Read public installation metadata", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "array" } } };
    let context: PluginStartContext, borrowed: PluginInstallationClient | undefined;
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: declare ? [{ permission: "plugins:read", required: false, reason: "Read installations in this project" }] : [],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read] },
      async start(value) { context = value; return { kind: "app", actions: [{ ...read, handle: () => (borrowed ?? value.services!.installations!).list() }] }; },
    };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    const installation = () => platform.runtime.list().find(record => record.plugin_id === id)!;
    return { id, platform, definition, installation, get client() { return context!.services!.installations; }, borrow: (client: PluginInstallationClient) => { borrowed = client; },
      read: () => actions.client.invoke({ actor_id: "tester", project_id: projectId, audience: "user", permissions: [] }, read, {}) as Promise<PluginInstallationView[]> };
  };
  return { start };
}

test("SYS-15-I1: shared Runtime installation metadata is current, public and limited to its project", async t => {
  const f = fixture(t), a = await f.start("installation-reader"), b = await f.start("installation-target");
  const other = fixture(t, "another-project"), elsewhere = await other.start("elsewhere");
  const views = await a.read();
  assert.deepEqual(views.map(item => item.name).sort(), ["installation-reader", "installation-target"]);
  assert.deepEqual(Object.keys(views[0]!).sort(), ["install_id", "installation_generation", "name", "plugin_id", "publisher_id", "state", "version"]);
  assert.equal(a.client!.get(elsewhere.installation().install_id), null);
  const before = a.client!.get(b.installation().install_id)!;
  await b.platform.runtime.stop(b.installation().install_id);
  assert.equal(a.client!.get(before.install_id)?.state, "disabled");
  await b.platform.runtime.uninstall(before.install_id, { retain_private_data: true });
  assert.equal(a.client!.get(before.install_id)?.state, "uninstalled");
  assert.ok(!a.client!.list().some(record => record.install_id === before.install_id));
  b.platform.runtime.install({ definition: b.definition, deployment: "local", trust: { level: "host" } });
  await b.platform.runtime.start(b.installation().install_id);
  const after = a.client!.get(b.installation().install_id)!;
  assert.equal(after.name, "installation-target"); assert.notEqual(after.installation_generation, before.installation_generation);
  assert.equal(after.state, "running");
});

test("SYS-15-I2: undeclared, revoked, foreign and stopped installation readers are refused", async t => {
  const f = fixture(t), a = await f.start("installation-reader"), b = await f.start("other-reader"), absent = await f.start("no-reader", false);
  assert.equal(absent.client, undefined);
  b.borrow(a.client!); await assert.rejects(b.read(), { code: "actions.forbidden" });
  const other = fixture(t, "another-project"), elsewhere = await other.start("installation-reader");
  elsewhere.borrow(a.client!); await assert.rejects(elsewhere.read(), { code: "actions.forbidden" });
  const captured = a.client!;
  await a.platform.runtime.stop(a.installation().install_id);
  assert.equal(captured.list(), undefined, "BL-411: a stopped activation's reader is refused and, outside every call, throws nothing");
  a.platform.runtime.grant(a.installation().install_id, []);
  await a.platform.runtime.start(a.installation().install_id);
  assert.throws(() => a.client!.list(), { code: "plugin.grant_denied" });
});
