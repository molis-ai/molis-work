import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_PLUGIN_CATALOG, railEntries,
} from "@molis-ai/molis-work-app-workbench";
import { availableProjectPluginIds, BUILTIN_PLUGIN_REGISTRY, PROJECT_SCOPED_PLUGIN_IDS, requiredCompanions } from "@molis-ai/molis-work-app-local-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { SNAPSHOT_READER, snapshotReaderManifest } from "./fixtures/snapshot-reader-plugin.js";
import { snapshotSourcePlugin } from "./fixtures/snapshot-source-plugin.js";

/**
 * Enabling a Plugin has to leave the user with something that can work.
 *
 * A Plugin whose required input nobody in the project can publish is a
 * navigation entry that will never fill, with nothing on screen to explain why.
 * These assertions are about that, not about a particular list.
 */

test("工作目录由项目系统服务提供，Git 不安装旧 Workspace 插件；Files 已退役，不再是可启用的插件", () => {
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("files"), false);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("git"), []);
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("workspace"), false);
});

/** A catalog entry for the fixtures: only what the companions are worked out from (the key and the Manifest). */
const entry = (project_plugin_id: string, manifest: PluginManifest) => ({ project_plugin_id, catalog_order: 0, manifest }) as PluginRegistration;

test("必选输入从 Manifest 推出伴随插件：有人发布这类过程项就带上它，可选输入与没人发布的类型不拉人", () => {
  const reader = entry(SNAPSHOT_READER.project_plugin_id, snapshotReaderManifest), source = entry("snapshot-source", snapshotSourcePlugin().manifest);
  // Its required snapshot defaults to the platform's materials, which every project has; no plugin in this catalog publishes one.
  assert.deepEqual(requiredCompanions(reader.project_plugin_id, [reader]), []);
  // A plugin that publishes the type comes along, because enabled alone the input could never be bound.
  assert.deepEqual(requiredCompanions(reader.project_plugin_id, [reader, source]), ["snapshot-source"]);
  const optional = entry("optional-reader", { ...snapshotReaderManifest, ports: { inputs: snapshotReaderManifest.ports!.inputs.map(port => ({ ...port, optional: true })), outputs: [] } });
  assert.deepEqual(requiredCompanions(optional.project_plugin_id, [optional, source]), [], "an optional input brings nobody");
  // No built-in plugin has a required input any longer, so none brings a companion of its own.
  for (const id of PROJECT_SCOPED_PLUGIN_IDS) assert.deepEqual(requiredCompanions(id), [], id);
});

test("输入全是可选的插件不拉人：单独开着也是能解释的状态", () => {
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("diff"), []);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("coding"), []);
});

test("Feed 仍然带上 Inbox：手写的伴随关系没有被推导覆盖掉", () => {
  assert.equal(BUILTIN_PLUGIN_REGISTRY.companions("feed").includes("inbox"), true);
});

test("新插件都能被项目启用，否则面板永远挂不上去", () => {
  for (const id of ["git", "diff", "coding"]) {
    assert.equal(BUILTIN_PLUGIN_REGISTRY.has(id), true, `${id} 应当可以被项目启用`);
    assert.equal(PROJECT_SCOPED_PLUGIN_IDS.includes(id), true);
  }
});

test("每个目录里的插件都在导航条上有自己的一格", () => {
  const enabled = PROJECT_SCOPED_PLUGIN_IDS;
  const rail = railEntries(enabled).map((entry) => entry.id);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    if (entry.personal === true) continue;
    const hasNavigator = (entry.manifest.ui.views ?? []).some((view) => view.slot === "navigator");
    if (!hasNavigator) continue;
    assert.equal(rail.includes(entry.project_plugin_id), true,
      `${entry.project_plugin_id} 声明了 navigator 视图却没出现在导航条上`);
  }
});

test("没被启用的插件不会出现在导航条上，平台成果入口始终可见", () => {
  const rail = railEntries(["goals"]).map((entry) => entry.id);
  assert.deepEqual(rail, ["goals", "artifacts", "sessions"]);
  assert.deepEqual(railEntries([]).map(entry => entry.id), ["artifacts", "sessions"]);
});


test("embedded surfaces follow unknown plugin declarations, transitively and without changing navigation", () => {
  const base = BUILTIN_PLUGIN_CATALOG[0]!;
  const entry = (id: string, dependencies: string[] = []) => ({ project_plugin_id: id, manifest: {
    ...base.manifest, plugin_id: `com.example.${id}`, ui: { contributions: [], embedded_plugins: dependencies },
  } });
  const catalog = [entry("parent", ["com.example.child", "com.example.missing"]), entry("child", ["com.example.leaf"]),
    entry("leaf", ["com.example.parent"]), entry("unrelated")];
  assert.deepEqual([...availableProjectPluginIds(["parent"], catalog)].sort(), ["child", "leaf", "parent"]);
  assert.deepEqual([...availableProjectPluginIds([], catalog)], []);
  assert.equal(availableProjectPluginIds(["coding"]).has("diff"), true);
  assert.equal(availableProjectPluginIds(["git"]).has("coding"), false);
  assert.equal(availableProjectPluginIds([]).has("diff"), false);
  assert.equal(railEntries(["coding"]).some(entry => entry.id === "diff"), false);
});
