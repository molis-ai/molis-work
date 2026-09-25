import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { nativePluginReleaseArtifact } from "../apps/local-host/src/native-plugin-release-artifact.js";
import { createPluginPlatform } from "../apps/local-host/src/plugin-platform.js";
import { LocalProjectDatabase } from "../apps/local-host/src/project-database.js";
import { DEMO_BOARD_ID, seedDemoBoard } from "../apps/local-host/src/demo-seed.js";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDefinition, PluginPrivateStorage, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createBuilderPlugin } from "../plugins/native/plugin-builder/src/plugin.js";
import { compatibleReleaseVersions, createGeneratedPlugin, migratableReleaseVersions } from "../plugins/native/plugin-builder/src/generated.js";
import { BUILDER_PLUGIN_ID } from "../plugins/native/plugin-builder/src/manifest.js";
import type { BuilderWorkflow } from "../plugins/native/plugin-builder/src/workflow.js";
import type { Design, RecordRow, Release, UiNode } from "../plugins/native/plugin-builder/src/model.js";

const inventory: Design = {
  id: "inventory", title: "库存工具", description: "按单价与数量统计库存", journey: ["记录库存", "查看价值"], acceptance: ["数量乘单价等于库存价值"],
  fields: [{ id: "name", label: "商品", type: "text", required: true }, { id: "quantity", label: "数量", type: "number", required: true }, { id: "price", label: "单价", type: "number", required: true }],
  calculations: [{ id: "value", label: "价值", expression: { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } } }],
  layout: "table", allowImport: true, allowExport: true,
};
const parts: UiNode[] = ["heading", "form", "collection", "actions", "summary"].map(kind => ({ id: kind, kind: kind as UiNode["kind"], label: kind }));
function project(path: string) {
  const store = new LocalProjectDatabase(path);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const privateOwner = new SqlitePluginPrivateStorage(store.db), storages = new Map<string, PluginPrivateStorage>();
  const platform = createPluginPlatform({ actions: pluginActions(store, DEMO_BOARD_ID), board_id: DEMO_BOARD_ID, actor_id: "runtime-test", db: store.db, artifacts, ui: new UiHost(),
    privateStorageFor(context, manifest) { const storage = privateOwner.forPlugin(context, manifest); storages.set(manifest.plugin_id, storage); return storage; },
    capabilities: { async invoke<Input, Output>(_definition: { capability_id: string }, _input: Input): Promise<Output> { throw new Error("This runtime test must not invoke a model or project capability"); } },
  });
  let ready: BuilderWorkflow | undefined;
  let generated: (release: Release, target?: boolean) => PluginDefinition;
  const builder = createBuilderPlugin({ async ready() {}, async models() { return []; },
    async installedVersions() { return Object.fromEntries(platform.runtime.list().filter(install => install.plugin_id.startsWith("io.molis.work.generated.") && install.state !== "uninstalled").map(install => [install.plugin_id, install.version])); },
    async upgradePublished(release) { const result = await platform.upgrade(release.pluginId, generated(release, true)); if (result?.status !== "running") throw new Error(result?.message ?? "upgrade failed"); },
  }, workflow => { ready = workflow; });
  const workflow = () => { assert.ok(ready, "builder must really start before accessing its store"); return ready; };
  const request = async (pluginId: string, method: string, suffix: string, body?: unknown): Promise<PluginRouteResponse | null> => platform.router().dispatch({ method, pathname: `/api/plugins/${pluginId}${suffix}`, body, actor_id: "runtime-test" });
  generated = (release: Release, target = false) => {
    const versions = workflow().store.versions(release.buildId);
    const installed = target ? undefined : platform.runtime.list().find(item => item.plugin_id === release.pluginId && item.state !== "uninstalled");
    const installedVersion = installed?.version.match(/^(\d+)\.0\.0$/)?.[1];
    const initial = installedVersion ? versions.find(item => item.version === Number(installedVersion)) : release;
    assert.ok(initial, "installed plugin must resolve the exact persisted release");
    return createGeneratedPlugin(initial, () => initial, undefined, compatibleReleaseVersions(versions, initial.version), migratableReleaseVersions(versions, initial.version));
  };
  const close = async () => {
    for (const install of platform.runtime.list()) if (install.state === "running") await platform.runtime.stop(install.install_id);
    await platform.events.drain(); await platform.wiring.drain(); store.close();
  };
  return { store, platform, storages, builder, workflow, generated, request, close };
}
function publish(workflow: BuilderWorkflow, title: string): Release {
  let doc = workflow.store.create(title);
  doc = workflow.store.update(doc.id, doc.revision, draft => {
    draft.title = title; draft.design = { ...structuredClone(inventory), title }; draft.nodes = structuredClone(parts);
    draft.behavior = { calculations: structuredClone(inventory.calculations), allowImport: true, allowExport: true }; draft.phase = "ready";
  });
  return workflow.store.release(doc.id, doc.revision);
}
function payload<T>(response: PluginRouteResponse | null): T { assert.equal(response?.status, 200, JSON.stringify(response)); return response!.body as T; }

test("builder and generated definitions run on PluginPlatform with routed CRUD/CSV, isolated persisted data, release updates and revoked old contexts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-builder-runtime-")), path = join(directory, "project.db");
  seedDemoBoard(path);
  let host = project(path), open = true;
  try {
    const initialReport = await host.platform.start([{ definition: host.builder }]);
    assert.deepEqual(initialReport.running, [BUILDER_PLUGIN_ID]); assert.deepEqual(initialReport.failed, []);
    const first = publish(host.workflow(), "第一份库存"), other = publish(host.workflow(), "第二份库存");
    const firstDefinition = host.generated(first), otherDefinition = host.generated(other);
    const report = await host.platform.start([{ definition: host.builder }, { definition: firstDefinition }, { definition: otherDefinition }]);
    assert.deepEqual(report.failed, []); assert.deepEqual(report.blocked, []);
    assert.deepEqual([...report.running].sort(), [BUILDER_PLUGIN_ID, first.pluginId, other.pluginId].sort());
    for (const [id, definition] of [[first.pluginId, firstDefinition], [other.pluginId, otherDefinition]] as Array<[string, PluginDefinition]>) {
      const contribution = host.platform.supervisor.contribution(id); assert.equal(contribution?.kind, "app");
      if (contribution?.kind !== "app") assert.fail("generated definition must produce an app contribution");
      assert.deepEqual(contribution.routes!.map(route => route.route_id).sort(), definition.manifest.routes!.map(route => route.route_id).sort());
      assert.deepEqual(contribution.views!.map(view => view.descriptor.contribution_id), definition.manifest.ui.contributions);
    }
    const saved = payload<{ record: RecordRow }>(await host.request(first.pluginId, "POST", "/records", {
      action: "save", releaseVersion: 1, values: { name: "马克杯", quantity: 3, price: 12 },
    })).record;
    assert.equal(saved.values.value, 36);
    assert.deepEqual(payload<{ rows: RecordRow[] }>(await host.request(other.pluginId, "GET", "/records")).rows, []);
    const exported = payload<{ csv: string }>(await host.request(first.pluginId, "POST", "/records", { action: "export", releaseVersion: 1, ids: [saved.id] })).csv;
    assert.match(exported, /name,quantity,price,value\r\n马克杯,3,12,36/);
    const imported = payload<{ rows: RecordRow[] }>(await host.request(other.pluginId, "POST", "/records", { action: "import", releaseVersion: 1, csv: exported })).rows;
    assert.equal(imported.length, 1); assert.notEqual(imported[0].id, saved.id); assert.equal(imported[0].values.value, 36);
    assert.equal(await host.request(first.pluginId, "POST", "/undeclared", { action: "save" }), null);
    assert.equal(await host.request(first.pluginId, "DELETE", "/records"), null);
    // An edit publishes versioned data; the installed interpreter remains version 1.0.0.
    let draft = host.workflow().store.get(first.buildId)!;
    draft = host.workflow().store.update(draft.id, draft.revision, doc => {
      doc.design!.title = "新版库存"; doc.design!.fields.push({ id: "note", label: "备注", type: "text", required: false });
      doc.design!.calculations = [{ id: "value", label: "价值", expression: { op: "divide", left: { op: "field", id: "price" }, right: { op: "subtract", left: { op: "field", id: "quantity" }, right: { op: "literal", value: 3 } } } }];
      doc.behavior!.calculations = structuredClone(doc.design!.calculations);
    });
    const second = await host.workflow().publish(draft.id, draft.revision, false);
    assert.equal(second.version, 2);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "1.0.0", "publishing only adds a candidate");
    assert.equal(payload<{ release: Release }>(await host.request(first.pluginId, "GET", "/state")).release.version, 1, "published version does not change the running plugin");
    assert.deepEqual(host.generated(second, true).manifest.upgrade_compatibility?.migratable_from_versions, ["1.0.0"]);
    await assert.rejects(host.workflow().upgrade(draft.id, host.workflow().require(draft.id).revision, second.version), /升级失败，仍保留 v1.*除数不能为 0/);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "1.0.0");
    assert.equal(host.platform.supervisor.state(first.pluginId)?.status, "running", "failed data preflight keeps the old generated plugin usable");
    assert.deepEqual(payload<{ rows: RecordRow[] }>(await host.request(first.pluginId, "GET", "/records")).rows, [saved]);
    await host.close(); open = false;
    host = project(path); open = true;
    assert.deepEqual((await host.platform.start([{ definition: host.builder }])).failed, []);
    const oldAfterRestart = await host.platform.start([{ definition: host.builder }, { definition: host.generated(first) }, { definition: host.generated(other) }]);
    assert.deepEqual(oldAfterRestart.failed, []); assert.deepEqual(oldAfterRestart.blocked, []);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "1.0.0", "restart resolves the exact installed release from Builder history");
    assert.equal(payload<{ release: Release }>(await host.request(first.pluginId, "GET", "/state")).release.version, 1);
    draft = host.workflow().require(draft.id);
    draft = host.workflow().store.update(draft.id, draft.revision, doc => {
      doc.design!.title = "可读取旧数据的库存";
      doc.design!.calculations = [{ id: "value", label: "价值", expression: { op: "if", condition: { op: "equal", left: { op: "field", id: "quantity" }, right: { op: "literal", value: 3 } }, then: { op: "literal", value: 36 }, else: { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } } } }];
      doc.behavior!.calculations = structuredClone(doc.design!.calculations);
    });
    const third = await host.workflow().publish(draft.id, draft.revision, true);
    assert.equal(third.version, 3);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "1.0.0", "a later compatible publication also remains a candidate until clicked");
    const upgraded = await host.workflow().upgrade(draft.id, host.workflow().require(draft.id).revision, third.version);
    assert.equal(upgraded.version, 3);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "3.0.0");
    assert.equal(payload<{ release: Release }>(await host.request(first.pluginId, "GET", "/state")).release.design.title, "可读取旧数据的库存");
    const stale = await host.request(first.pluginId, "POST", "/records", { action: "save", releaseVersion: 1, id: saved.id, revision: 1, values: { name: "stale overwrite", quantity: 99, price: 99 } });
    assert.equal(stale?.status, 400); assert.match(String((stale?.body as { error: string }).error), /新版本/);
    assert.equal(payload<{ rows: RecordRow[] }>(await host.request(first.pluginId, "GET", "/records")).rows[0].values.name, "马克杯");
    const changed = payload<{ record: RecordRow }>(await host.request(first.pluginId, "POST", "/records", { action: "save", releaseVersion: 3, id: saved.id, revision: 1, values: { name: "马克杯", quantity: 5, price: 12, note: "补货" } })).record;
    assert.equal(changed.values.value, 60); assert.equal(changed.revision, 2);
    assert.equal(host.platform.runtime.list().find(install => install.plugin_id === first.pluginId)!.version, "3.0.0");
    assert.deepEqual(host.generated(third, true).manifest.upgrade_compatibility?.compatible_from_versions, ["2.0.0"]);
    assert.deepEqual(host.generated(third, true).manifest.upgrade_compatibility?.migratable_from_versions, ["1.0.0"]);
    const oldPrivate = host.storages.get(first.pluginId)!;
    const firstInstallId = host.platform.supervisor.state(first.pluginId)!.install_id!;
    await host.platform.runtime.stop(firstInstallId);
    assert.throws(() => oldPrivate.set("after-stop", "must not persist"), /grant|权限|停止|失效/i);
    assert.throws(() => oldPrivate.compareAndSet!("after-stop", null, "must not persist"));
    await host.close(); open = false;
    host = project(path); open = true;
    assert.deepEqual((await host.platform.start([{ definition: host.builder }])).failed, []);
    const restarted = await host.platform.start([{ definition: host.builder }, { definition: host.generated(first) }, { definition: host.generated(other) }]);
    assert.deepEqual(restarted.failed, []); assert.deepEqual(restarted.blocked, []);
    assert.equal(host.platform.supervisor.state(first.pluginId)!.install_id, firstInstallId);
    assert.equal(payload<{ release: Release }>(await host.request(first.pluginId, "GET", "/state")).release.version, 3);
    const recovered = payload<{ rows: RecordRow[]; summary: { count: number; totals: Record<string, number> } }>(await host.request(first.pluginId, "GET", "/records"));
    assert.deepEqual(recovered.rows, [changed]); assert.equal(recovered.summary.totals.value, 60);
    const otherRows = payload<{ rows: RecordRow[] }>(await host.request(other.pluginId, "GET", "/records")).rows;
    assert.deepEqual(otherRows, imported); assert.equal(otherRows[0].values.value, 36);
    payload(await host.request(first.pluginId, "POST", "/records", { action: "remove", releaseVersion: 3, id: changed.id, revision: changed.revision }));
    assert.deepEqual(payload<{ rows: RecordRow[] }>(await host.request(first.pluginId, "GET", "/records")).rows, []);
    assert.equal(payload<{ rows: RecordRow[] }>(await host.request(other.pluginId, "GET", "/records")).rows.length, 1);
  } finally { if (open) await host.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("builder private storage grant is required at actual Runtime activation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "plugin-builder-no-grant-")), path = join(directory, "project.db"); seedDemoBoard(path);
  const host = project(path);
  try {
    const report = await host.platform.start([{ definition: host.builder, grants: [] }]);
    assert.deepEqual(report.running, []);
    assert.equal(report.failed.length + report.blocked.length, 1);
    assert.match([...report.failed, ...report.blocked][0].message!, /storage:private/);
  } finally { await host.close(); rmSync(directory, { recursive: true, force: true }); }
});


test("Builder 1.1.0 without a release archive reopens legacy drafts and releases without upgrading", async () => {
  const directory = mkdtempSync(join(tmpdir(), "builder-legacy-start-")), path = join(directory, "project.db");
  seedDemoBoard(path);
  let host = project(path);
  try {
    const legacy = { ...host.builder, manifest: { ...host.builder.manifest, version: "1.1.0", upgrade_compatibility: undefined } };
    assert.deepEqual((await host.platform.start([{ definition: legacy }])).failed, []);
    const release = publish(host.workflow(), "旧版库存");
    const draft = host.workflow().store.create("旧版未发布草稿");
    const storage = host.storages.get(BUILDER_PLUGIN_ID)!;
    const raw = JSON.parse(storage.get("plugin-builder:state:v1")!);
    storage.set("plugin-builder:state:v1", JSON.stringify({ ...raw, activeVersions: { [release.buildId]: release.version } }));
    const preserved = storage.get("plugin-builder:state:v1");
    const before = host.platform.runtime.list().find(record => record.plugin_id === BUILDER_PLUGIN_ID)!;
    await host.close();
    host = project(path);
    const report = await host.platform.start([{
      definition: host.builder,
      releaseArtifact: nativePluginReleaseArtifact<typeof createBuilderPlugin>(
        "@molis-ai/molis-work-plugin-builder", "createBuilderPlugin", factory => factory({ async ready() {}, async models() { return []; } }, () => {})),
    }]);
    assert.deepEqual(report.failed, []);
    assert.ok(report.running.includes(BUILDER_PLUGIN_ID));
    assert.deepEqual(host.workflow().store.get(draft.id), draft);
    assert.deepEqual(host.workflow().store.versions(release.buildId), [release]);
    assert.equal(host.storages.get(BUILDER_PLUGIN_ID)!.get("plugin-builder:state:v1"), preserved, "opening does not rewrite legacy private data");
    const after = host.platform.runtime.get(before.install_id);
    assert.equal(after.version, "1.1.0");
    assert.equal(after.manifest_digest, before.manifest_digest);
    assert.deepEqual(after.grants, before.grants);
    const saved = host.workflow().store.update(draft.id, draft.revision, doc => { doc.title = "继续旧草稿"; });
    assert.equal(host.workflow().store.get(draft.id)!.title, "继续旧草稿");
    assert.equal(saved.revision, draft.revision + 1);
    assert.deepEqual(host.workflow().store.versions(release.buildId), [release]);
    assert.equal(host.platform.upgradeCandidates().find(candidate => candidate.plugin_id === BUILDER_PLUGIN_ID)?.installed_version, "1.1.0");
    assert.equal(host.store.db.prepare("SELECT count(*) AS count FROM plugin_runtime_release_artifacts WHERE plugin_id = ?").get(BUILDER_PLUGIN_ID).count, 1);
  } finally { await host.close(); rmSync(directory, { recursive: true, force: true }); }
});
