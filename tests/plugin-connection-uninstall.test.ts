import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { MemoryPluginConsentLedger, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";

function probe(name = "uninstallconnections") {
  let failStop = false;
  const definition: PluginDefinition = { manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.example.${name}`, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: name }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "connections:use", required: false, reason: "连接账号" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    connections: { slots: [{ slot_id: "feed", service_id: "github", reason: "记录账号", binding: "per_record" }, { slot_id: "account", service_id: "github", reason: "安装账号" }] },
  }, start: async () => ({ kind: "app", views: [] }), stop: async () => { if (failStop) throw new Error("controlled stop failure"); } };
  return { definition, failStop: () => { failStop = true; } };
}

/** The real project platform, its persistent Runtime repository and the actual private KV owner. */
function project(home: string, file: string, projectId: string) {
  const store = new LocalProjectDatabase(file), privateStorage = new SqlitePluginPrivateStorage(store.db), actions = new ActionService();
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const platform = createPluginPlatform({ project_id: projectId, actor_id: "tester", db: store.db, journal: store, actions: { registry: actions, client: actions, project_id: projectId },
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    home: { directory: home, completeText: () => null, stores: homeStores(), consents: new MemoryPluginConsentLedger() },
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest), deleteInstallationData: id => privateStorage.deleteInstallationData(id) });
  return { platform, runtime: platform.runtime, async close() {
    try { await platform.closeCoordination(); for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id); }
    finally { store.close(); }
  } };
}

async function rig(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "project-connection-uninstall-")), file = join(home, "project.db");
  seedDemoBoard(file);
  let current = project(home, file, DEMO_PROJECT_ID);
  t.after(async () => { try { await current.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const first = probe(), second = probe("otherconnections");
  await current.platform.start([{ definition: first.definition }, { definition: second.definition }]);
  const record = current.runtime.list().find(row => row.plugin_id === first.definition.manifest.plugin_id)!;
  const other = current.runtime.list().find(row => row.plugin_id === second.definition.manifest.plugin_id)!;
  assert.equal(record.state, "running"); assert.equal(other.state, "running");
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Retained account", token: randomUUID() }));
  const scope = (install_id: string, project_id = DEMO_PROJECT_ID, record_key = "src-1") => pluginBindingScope({ install_id, project_id, record_key });
  const rows = [
    { name: "own source", scope: scope(record.install_id), plugin: record.plugin_id, slot: "feed" },
    { name: "another own source", scope: scope(record.install_id, DEMO_PROJECT_ID, "src-2"), plugin: record.plugin_id, slot: "feed" },
    { name: "project suffix", scope: scope(record.install_id, DEMO_PROJECT_ID + "0"), plugin: record.plugin_id, slot: "feed" },
    { name: "project prefix", scope: scope(record.install_id, "x" + DEMO_PROJECT_ID), plugin: record.plugin_id, slot: "feed" },
    { name: "another project", scope: scope(record.install_id, "another-project"), plugin: record.plugin_id, slot: "feed" },
    { name: "installation suffix", scope: scope(record.install_id + "0"), plugin: record.plugin_id, slot: "feed" },
    { name: "another installation", scope: scope(other.install_id), plugin: other.plugin_id, slot: "feed" },
    { name: "installation slot", scope: pluginBindingScope({ install_id: record.install_id }), plugin: record.plugin_id, slot: "account" },
    { name: "Home slot", scope: "home", plugin: record.plugin_id, slot: "account" },
  ];
  withConnectorConnections(home, store => { for (const row of rows) store.bind({ scopeId: row.scope, pluginId: row.plugin, slotId: row.slot, serviceId: "github", connectionId: connection.connection_id }); });
  const remaining = () => withConnectorConnections(home, store => rows.filter(row => store.binding(row.scope, row.plugin, row.slot) !== null).map(row => row.name));
  const accountUnchanged = () => assert.deepEqual(withConnectorConnections(home, store => store.get(connection.connection_id)), connection);
  return { home, first, record, other, all: rows.map(row => row.name), outside: rows.slice(2).map(row => row.name), remaining, accountUnchanged,
    get current() { return current; }, async reopen() { await current.close(); current = project(home, file, DEMO_PROJECT_ID); } };
}

for (const retain_private_data of [true, false]) test(`RAC-471-RT common Runtime uninstall removes only this project's record bindings with retain_private_data=${retain_private_data}`, async t => {
  const r = await rig(t), { runtime } = r.current;
  await runtime.uninstall(r.record.install_id, { retain_private_data });
  assert.equal(runtime.get(r.record.install_id).state, "uninstalled");
  assert.equal(runtime.get(r.record.install_id).retain_private_data, retain_private_data);
  assert.deepEqual(r.remaining(), r.outside); r.accountUnchanged();
  const again = runtime.install({ definition: r.first.definition, deployment: "local", trust: { level: "unsigned" } }).install;
  assert.equal(again.install_id, r.record.install_id);
  await runtime.start(again.install_id);
  assert.deepEqual(r.remaining(), r.outside, "a fresh activation does not inherit the old record's account");
  r.accountUnchanged();
});

test("RAC-471-STOP disable, refused uninstall and failed stop preserve bindings; retry after stop failure clears only its domain", async t => {
  const r = await rig(t), { platform, runtime } = r.current;
  platform.supervisor.revoke(r.record.plugin_id);
  await runtime.stop(r.record.install_id);
  assert.equal(runtime.get(r.record.install_id).state, "disabled");
  assert.deepEqual(r.remaining(), r.all); r.accountUnchanged();
  assert.equal((await platform.supervisor.enable(r.record.plugin_id)).status, "running");
  assert.deepEqual(r.remaining(), r.all);
  await assert.rejects(runtime.uninstall("missing-installation"), { code: "plugin.definition_missing" });
  assert.deepEqual(r.remaining(), r.all);
  r.first.failStop();
  await assert.rejects(runtime.uninstall(r.record.install_id), { code: "plugin.executor_failed" });
  assert.equal(runtime.get(r.record.install_id).state, "crashed");
  assert.deepEqual(r.remaining(), r.all); r.accountUnchanged();
  await runtime.uninstall(r.record.install_id, { retain_private_data: true });
  assert.deepEqual(r.remaining(), r.outside); r.accountUnchanged();
});

test("RAC-471-RETRY Connector write failure preserves bindings; a reopened Runtime retries without changing the recorded data choice", { timeout: 30_000 }, async t => {
  const r = await rig(t), writer = new DatabaseSync(homeSqlitePath(r.home, "connectors"));
  try {
    writer.exec("BEGIN IMMEDIATE");
    await assert.rejects(r.current.runtime.uninstall(r.record.install_id, { retain_private_data: true }), /database is locked/);
    const removed = r.current.runtime.get(r.record.install_id);
    assert.equal(removed.state, "uninstalled"); assert.equal(removed.retain_private_data, true);
    assert.deepEqual(r.remaining(), r.all); r.accountUnchanged();
    writer.exec("ROLLBACK");
    await r.reopen();
    assert.deepEqual(r.current.runtime.get(r.record.install_id), removed);
    const retried = await r.current.runtime.uninstall(r.record.install_id, { retain_private_data: false });
    assert.equal(retried.replayed, true);
    assert.deepEqual(r.current.runtime.get(r.record.install_id), removed, "a retry does not replace the person's original choice");
    assert.deepEqual(r.remaining(), r.outside); r.accountUnchanged();
  } finally { writer.close(); }
});
