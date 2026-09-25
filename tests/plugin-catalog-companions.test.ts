import assert from "node:assert/strict";
import test from "node:test";

import {
  availableProjectPluginIds,
  BUILTIN_PLUGIN_CATALOG,
  BUILTIN_PLUGIN_REGISTRY,
  PROJECT_SCOPED_PLUGIN_IDS,
  railEntries,
} from "@molis-ai/molis-work-app-workbench";

/**
 * Enabling a Plugin has to leave the user with something that can work.
 *
 * A Plugin whose required input nobody in the project can publish is a
 * navigation entry that will never fill, with nothing on screen to explain why.
 * These assertions are about that, not about a particular list.
 */

test("工作目录由项目系统服务提供，Files 和 Git 不安装旧 Workspace 插件", () => {
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("files"), []);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("git"), []);
  assert.equal(BUILTIN_PLUGIN_REGISTRY.has("workspace"), false);
});

test("传递依赖要一次带齐：Projects 只展开一层", () => {
  const companions = BUILTIN_PLUGIN_REGISTRY.companions("text-stats");
  assert.deepEqual([...companions].sort(), ["files"]);
});

test("输入全是可选的插件不拉人：单独开着也是能解释的状态", () => {
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("diff"), []);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("coding"), []);
});

test("Feed 仍然带上 Inbox：手写的伴随关系没有被推导覆盖掉", () => {
  assert.equal(BUILTIN_PLUGIN_REGISTRY.companions("feed").includes("inbox"), true);
});

test("新插件都能被项目启用，否则面板永远挂不上去", () => {
  for (const id of ["files", "git", "diff", "text-stats", "coding"]) {
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

test("没被启用的插件不会出现在导航条上", () => {
  const rail = railEntries(["goals"]).map((entry) => entry.id);
  assert.deepEqual(rail, ["goals"]);
});


test("embedded surfaces follow unknown plugin declarations, transitively and without changing navigation", () => {
  const base = BUILTIN_PLUGIN_CATALOG[0]!;
  const entry = (id: string, dependencies: string[] = []) => ({ project_plugin_id: id, manifest: {
    ...base.manifest, plugin_id: `io.molis.work.example.${id}`, ui: { contributions: [], embedded_plugins: dependencies },
  } });
  const catalog = [entry("parent", ["io.molis.work.example.child", "io.molis.work.example.missing"]), entry("child", ["io.molis.work.example.leaf"]),
    entry("leaf", ["io.molis.work.example.parent"]), entry("unrelated")];
  assert.deepEqual([...availableProjectPluginIds(["parent"], catalog)].sort(), ["child", "leaf", "parent"]);
  assert.deepEqual([...availableProjectPluginIds([], catalog)], []);
  assert.equal(availableProjectPluginIds(["coding"]).has("diff"), true);
  assert.equal(availableProjectPluginIds(["git"]).has("text-stats"), false);
  assert.equal(availableProjectPluginIds([]).has("diff"), false);
  assert.equal(railEntries(["coding"]).some(entry => entry.id === "diff"), false);
});
