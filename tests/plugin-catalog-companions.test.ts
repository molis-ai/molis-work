import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("需要必填输入的插件会把它的来源一起带上", () => {
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("files"), ["workspace"]);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("git"), ["workspace"]);
});

test("传递依赖要一次带齐：Projects 只展开一层", () => {
  const companions = BUILTIN_PLUGIN_REGISTRY.companions("text-stats");
  assert.deepEqual([...companions].sort(), ["files", "workspace"]);
});

test("输入全是可选的插件不拉人：单独开着也是能解释的状态", () => {
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("diff"), []);
  assert.deepEqual(BUILTIN_PLUGIN_REGISTRY.companions("coding"), []);
});

test("Feed 仍然带上 Inbox：手写的伴随关系没有被推导覆盖掉", () => {
  assert.equal(BUILTIN_PLUGIN_REGISTRY.companions("feed").includes("inbox"), true);
});

test("新插件都能被项目启用，否则面板永远挂不上去", () => {
  for (const id of ["workspace", "files", "git", "diff", "text-stats", "coding"]) {
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
