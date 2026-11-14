import assert from "node:assert/strict";
import test from "node:test";
import {
  creatableKinds, homeStarts, islandEntries, pluginTabGlyphs, pluginTabTitles, railEntries, settingsEntries, type PluginDirectory,
} from "@molis-ai/molis-work-app-workbench";
import { UiViewRegistry } from "@molis-ai/molis-work-ui-host";

const sharedId = "io.molis.example.shared";
const directory: PluginDirectory = [
  { id: "selected", plugin_id: sharedId, name: "项目插件", chosen: true, ui: { views: [
    { view_id: "open", slot: "navigator", title: "项目入口", order: 20, group: "advance", rail: "core", pinned_default: true,
      creates: { station: "one", title: "新文稿" }, start: { title: "从文稿开始", hint: "开始一项工作" } },
    { view_id: "side", slot: "side", title: "项目侧栏", order: 20 },
    { view_id: "settings", slot: "settings", title: "项目设置" },
  ] } },
  { id: "stalled-package", plugin_id: sharedId, name: "旧安装", chosen: false, personal: true, home: true, ui: { views: [
    { view_id: "open", slot: "navigator", title: "旧安装入口", order: 20, group: "advance", rail: "extend" },
    { view_id: "side", slot: "side", title: "旧安装侧栏", order: 20 },
    { view_id: "settings", slot: "settings", title: "旧安装设置" },
  ] } },
  { id: "disabled", plugin_id: sharedId, name: "停用插件", chosen: true, ui: { views: [
    { view_id: "open", slot: "navigator", title: "停用入口", order: 1 },
    { view_id: "side", slot: "side", title: "停用侧栏", order: 1 },
    { view_id: "settings", slot: "settings", title: "停用设置" },
  ] } },
  { id: "stage-only", plugin_id: "io.molis.example.stage", name: "原包名称", chosen: false, ui: { views: [
    { view_id: "later", slot: "stage", title: "次要舞台", order: 20 },
    { view_id: "first", slot: "stage", title: "首个舞台", icon: "file", order: 10 },
  ] } },
  { id: "island", plugin_id: "io.molis.example.island", name: "岛屿插件", chosen: true, ui: { views: [
    { view_id: "open", slot: "island", title: "岛屿入口", order: 1, group: "personal",
      creates: { station: "two", title: "新笔记" }, start: { title: "从笔记开始", hint: "记录一段内容" } },
    { view_id: "stage", slot: "stage", title: "岛屿舞台", order: 1 },
  ] } },
];
const enabled = ["selected", "island"];

test("BRC-03 · one registry preserves the source of tied view ids and the old read shape", () => {
  const registry = new UiViewRegistry(directory.map(manifest => ({ manifest, enabled: !manifest.chosen || enabled.includes(manifest.id) })));
  const placements = registry.placements("side");
  assert.deepEqual(placements.map(({ manifest, view }) => [manifest.id, view.title]), [
    ["selected", "项目侧栏"], ["stalled-package", "旧安装侧栏"],
  ]);
  assert.equal(placements[0]!.manifest, directory[0]);
  assert.equal(placements[1]!.manifest, directory[1]);
  assert.deepEqual(registry.slot("side"), placements.map(({ view }) => view));
  assert.equal(registry.view(sharedId, "side")?.title, "项目侧栏");
  assert.ok(registry.views().every(view => !Object.hasOwn(view, "manifest")));
  placements[0]!.view.title = "读到的副本";
  assert.equal(registry.view(sharedId, "side")?.title, "项目侧栏");
});

test("BRC-03 · navigation keeps shell owners, titles and enabled views", () => {
  const rail = railEntries(enabled, directory);
  assert.deepEqual(rail.map(({ id, label, group, rail, pinned_default, chosen }) =>
    [id, label, group, rail, pinned_default, chosen]), [
    ["selected", "项目入口", "advance", "core", true, true],
    ["stalled-package", "旧安装入口", "personal", null, false, false],
    ["artifacts", "成果", "make", null, false, false],
    ["stage-only", "原包名称", null, null, false, false],
  ]);
  assert.equal(rail.at(-1)!.glyph, "file");
  assert.deepEqual(islandEntries(enabled, directory).map(({ id, label, group }) => [id, label, group]), [["island", "岛屿入口", null]]);
  assert.deepEqual(settingsEntries(enabled, directory).map(view => view.title), ["项目设置", "旧安装设置"]);
  assert.deepEqual(creatableKinds(enabled, directory).map(({ id, title }) => [id, title]), [["selected", "新文稿"], ["island", "新笔记"]]);
  assert.deepEqual(homeStarts(enabled, directory).map(({ id, title }) => [id, title]), [["selected", "从文稿开始"], ["island", "从笔记开始"]]);
  const titles = pluginTabTitles(directory);
  assert.equal(titles.selected, "项目入口");
  assert.equal(titles["stalled-package"], "旧安装入口");
  assert.equal(titles["stage-only"], "原包名称");
  assert.equal(titles.island, "岛屿入口");
});

test("BRC-03 · chooser glyphs use one registry across navigation and islands", t => {
  const registryInstances = new Set<UiViewRegistry>();
  const { placements, slot } = UiViewRegistry.prototype;
  t.mock.method(UiViewRegistry.prototype, "placements", function (this: UiViewRegistry, name: Parameters<typeof placements>[0]) {
    registryInstances.add(this);
    return placements.call(this, name);
  });
  t.mock.method(UiViewRegistry.prototype, "slot", function (this: UiViewRegistry, name: Parameters<typeof slot>[0]) {
    registryInstances.add(this);
    return slot.call(this, name);
  });
  const glyphs = pluginTabGlyphs();
  assert.equal(glyphs.home, "home");
  assert.equal(glyphs.goals, "target");
  assert.equal(glyphs.artifacts, "package");
  assert.equal(registryInstances.size, 1);
});
