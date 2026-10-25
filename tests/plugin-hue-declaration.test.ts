// A plugin's tab-strip colour is its Manifest's, and the design system keeps no list of plugins (W5-02 PR-D, PG-075). The two hand-written
// tables, `MW_PLUGINS` (id, label, hue) and `PLUGIN_ICON` (id to glyph), are gone: the glyph is the view's `icon` the Manifests already
// declare, the colour a view's `hue`, one of the design system's colour names. Every plugin is drawn the same way, whoever wrote it.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { UI_VIEW_HUES, type UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import * as designSystem from "@molis-ai/molis-work-design-system";
import {
  BUILTIN_PLUGIN_CATALOG, builtinPluginDirectory, clientPluginDirectory, pluginTabGlyphs, renderMolisWorkPrimitiveCatalog,
  renderPluginDirectoryData, sanitizePluginDirectory,
} from "@molis-ai/molis-work-app-workbench";
import {
  renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

/** The colour each built-in plugin's group had on the tab strip when the design system held the table; the Manifests now say the same. */
const COLOURS: Readonly<Record<string, string>> = {
  alchemist: "purple", artifacts: "pink", coding: "cyan", cognia: "blue", dataset: "green", diff: "cyan", feed: "brown", files: "yellow",
  form: "orange", git: "orange", goals: "blue", images: "pink", inbox: "mint", jelly: "mint", lingguang: "yellow", pages: "cyan",
  "plugin-builder": "indigo", ppt: "red", schedule: "yellow", shelf: "slate", "text-stats": "brown", todo: "green", workflows: "orange",
};
const SPARE_HUES = ["blue", "green", "orange", "purple", "cyan", "pink", "yellow", "mint", "red", "indigo"];

/** The first hue a plugin's views declare: the plugin's colour. */
const hueOf = (views: readonly UiViewDeclaration[] | undefined) => views?.find(view => view.hue !== undefined)?.hue;

test("RAC-701 the Manifest's hue names are the design system's colour names, one list", () => {
  assert.deepEqual([...UI_VIEW_HUES], designSystem.MW_HUES.map(hue => hue.id));
});

test("RAC-702 each built-in plugin declares the colour it had on the tab strip before the table was deleted", () => {
  const declared = Object.fromEntries(BUILTIN_PLUGIN_CATALOG.flatMap(entry => {
    const hue = hueOf(entry.manifest.ui?.views);
    return hue ? [[entry.project_plugin_id, hue]] : [];
  }));
  assert.deepEqual(declared, COLOURS);
});

test("RAC-703 the directory keeps a design-system hue and drops anything else; the page's data carries the first one declared", () => {
  const view = (hue: unknown, id = "main"): UiViewDeclaration => ({ view_id: id, slot: "navigator", title: "Ext", hue: hue as UiViewDeclaration["hue"] });
  const entry = (...views: UiViewDeclaration[]) => ({ id: "ext", plugin_id: "ext.plugin", name: "Ext", chosen: false, ui: { views } });
  assert.deepEqual(clientPluginDirectory(sanitizePluginDirectory([entry(view("pink"))])), [{ id: "ext", accepts_objects: false, hue: "pink" }]);
  for (const hostile of ["magenta", "#ff0000", "url(javascript:alert(1))", "pink; color: red", 3, null]) {
    assert.deepEqual(clientPluginDirectory(sanitizePluginDirectory([entry(view(hostile))])), [{ id: "ext", accepts_objects: false, hue: null }], String(hostile));
  }
  assert.deepEqual(clientPluginDirectory(sanitizePluginDirectory([entry({ ...view(undefined, "a"), hue: undefined }, view("slate", "b"), view("red", "c"))])).map(item => item.hue), ["slate"],
    "a plugin has one colour: the first of its views that declares one");
  assert.match(renderPluginDirectoryData(sanitizePluginDirectory([entry(view("mint"))])), /"hue":"mint"/);
});

test("RAC-704 the design system keeps no table of plugins and defines no custom property per plugin", () => {
  assert.equal("MW_PLUGINS" in designSystem, false);
  assert.equal("PLUGIN_ICON" in designSystem, false);
  const tokens = designSystem.renderPaletteTokens("light") + designSystem.renderPaletteTokens("dark");
  assert.doesNotMatch(tokens, /--plugin-/);
  for (const sheet of [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkSettingsStylesheet(), renderMolisWorkArrivalStylesheet()]) {
    assert.doesNotMatch(sheet, /--plugin-(?!tint\b|color\b|rail-)[a-z]/, "no stylesheet defines or reads a per-plugin colour");
  }
});

test("RAC-705 the tint rule names no plugin, and no row of a directory or a tab is written for one", () => {
  const sheet = renderMolisWorkWorkbenchStylesheet();
  const rule = /body\.immersive-workbench :is\([^{}]*\) \{ --plugin-tint: var\(--ink-soft\); \}/u.exec(sheet)?.[0];
  assert.ok(rule, "the workbench sheet carries the one neutral tint rule");
  for (const selector of [".plugin-rail [data-plugin-id]", ".assistant-island [data-plugin-id]", "[data-plugin-section]", "[data-directory-panel]",
    "[data-market-plugin]", "[data-market-focus]", "[data-work-surface]", ".tab-item[data-plugin]"]) assert.ok(rule.includes(selector), selector);
  for (const { project_plugin_id: id } of BUILTIN_PLUGIN_CATALOG) {
    assert.doesNotMatch(rule, new RegExp(`="${id}"`, "u"), `${id} has no selector of its own`);
    assert.doesNotMatch(sheet, new RegExp(`\\.mw-dir-row\\[data-settings-section="${id}"\\]`, "u"), `${id} has no settings row of its own`);
  }
  assert.match(sheet, /\.mw-catalog \[data-plugin-id\] \{ --plugin-tint: var\(--ink-soft\); \}/);
});

test("RAC-706 the tab strip takes a plugin's colour from the page's directory, the workbench's own surfaces from the Host, the rest from a spare list", () => {
  const { outputFiles } = buildSync({ entryPoints: [fileURLToPath(new URL("../apps/workbench/src/scripts/client/plugin-tab-groups.ts", import.meta.url))],
    bundle: true, write: false, format: "iife", globalName: "TabGroups", platform: "browser", target: "es2022" });
  const factory = vm.runInNewContext(`${outputFiles[0]!.text};TabGroups.PLUGIN_TAB_GROUPS_FACTORY`, {}) as string;
  const element = () => ({ className: "", setAttribute() {}, append() {}, style: { setProperty() {} } });
  const window = { addEventListener() {} };
  const document = { createElement: element, body: element(), addEventListener() {} };
  const groups = (hues?: Record<string, string>) => vm.runInNewContext(`(${factory})`, { window, document })({
    getState: () => ({}), ops: {}, apply() {}, persist() {}, L: (text: string) => text, rows: [], embedded: true, notify() {}, editable: () => false, appendTab() {}, hues,
  }) as { hueOf(plugin: string): string };
  const given = groups({ pages: "cyan", ext: "pink" });
  assert.equal(given.hueOf("pages"), "cyan");
  assert.equal(given.hueOf("ext"), "pink", "a plugin the platform has never heard of keeps the colour it declared");
  assert.deepEqual(["home", "characters", "workspace", "settings"].map(given.hueOf), ["gray", "purple", "slate", "steel"], "the workbench's own surfaces");
  const bare = groups();
  for (const { project_plugin_id: id } of BUILTIN_PLUGIN_CATALOG.filter(entry => entry.project_plugin_id in COLOURS)) {
    assert.ok(SPARE_HUES.includes(bare.hueOf(id)), `${id} with no directory is a spare colour, not a built-in's own`);
    assert.equal(bare.hueOf(id), bare.hueOf(id), `${id}'s spare colour is stable`);
  }
  const script = renderMolisWorkWorkbenchClientScript();
  assert.match(script, /script\[data-plugin-directory\]/);
  assert.match(script, /entry\.hue/);
  assert.doesNotMatch(script, /PLUGIN_COLOR|var\(--plugin-(?!tint|color|rail)/);
});

test("RAC-707 the icon inventory on the board is the Manifests' glyphs", () => {
  const board = renderMolisWorkPrimitiveCatalog();
  const glyphs = Object.entries(pluginTabGlyphs());
  assert.ok(glyphs.length > 20);
  for (const [, glyph] of glyphs) assert.ok(board.includes(`<code>${glyph}</code>`), `${glyph} is listed`);
  for (const entry of builtinPluginDirectory().filter(item => pluginTabGlyphs()[item.id])) assert.ok(board.includes(`<strong>${entry.name}</strong>`), entry.name);
});

test("RAC-708 a plugin installed at run time is drawn like a built-in: its hue reaches the page's data the same way", () => {
  const installed = sanitizePluginDirectory(builtinPluginDirectory().map(entry => ({ ...entry, chosen: false })));
  const hues = Object.fromEntries(clientPluginDirectory(installed).flatMap(entry => entry.hue ? [[entry.id, entry.hue]] : []));
  assert.deepEqual(hues, COLOURS);
});
