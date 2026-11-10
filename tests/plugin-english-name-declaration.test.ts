import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { escapeHtml, inspectPluginLocales, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  BUILTIN_PLUGIN_CATALOG, islandEntries, pluginDirectoryFor, pluginMarketCards, pluginTabTitles, railEntries,
  renderPickerExtend, renderPluginDirectoryData, renderPluginMarket, renderPluginRail, sanitizePluginDirectory, type PluginDirectoryEntry,
} from "@molis-ai/molis-work-app-workbench";
import { builtinMarketDirectory, installHostUiText, runningPluginDirectory, runWithLocale } from "@molis-ai/molis-work-app-local-host";

installHostUiText();
const primitives = { readText: t.text, escapeHtml, icon: (name: string) => `<svg data-icon="${name}"></svg>` };
const LEDGER = "io.molis.work.ledger", STAGE = "io.molis.work.stage";
const view = (pluginId: string, id: string, slot: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ view_id: id, slot, title, contribution_id: `${pluginId}.${id}`, icon: "list", ...extra });
const manifestOf = (id: string, name: string, views: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}, locales = true) => ({
  schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name, kind: "app",
  publisher: { publisher_id: "example", signature: "example-signature" },
  entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ...extra, ui: { contributions: views.map(item => item.contribution_id), views, ...(locales ? { locales: { default: "zh", available: ["zh", "en"] } } : {}) },
});

test("FSS-36 RAC-1720 only fixed owner-bound display references replace the old locale-specific fields", () => {
  const withName = (name_text: unknown, locales = true) => manifestOf(LEDGER, "账本", [view(LEDGER, "nav", "navigator", "记账")], { name_text }, locales);
  assert.equal(parsePluginManifest(withName({ key: "ledger.directory.name" })).name, "账本");
  assert.equal(parsePluginManifest(withName({ literal: "😀".repeat(80) }, false)).name, "账本");
  for (const [word, locales] of [
    [{ key: "other.directory.name" }, true], [{ key: "ledger.directory.name" }, false],
    [{ key: "ledger.directory.name", args: [{ name: "count", kind: "number", number: 1 }] }, true],
    [{ key: "ledger.directory.name", fallback: "Some different source" }, true],
    [{ literal: " " }, false], [{ literal: " Ledger" }, false], [{ literal: "Line\nbreak" }, false],
    [{ literal: "😀".repeat(81) }, false], ["Not a reference", true],
  ] as const) assert.throws(() => parsePluginManifest(withName(word, locales)), /name_text/u);
  assert.doesNotThrow(() => parsePluginManifest(withName({ key: "common.control.open" }, false)));
  assert.throws(() => parsePluginManifest(manifestOf(LEDGER, "账本", [], { name_en: "Ledger" })), /name_en/u);
  for (const slot of ["navigator", "side", "stage"]) assert.throws(() =>
    parsePluginManifest(manifestOf(LEDGER, "账本", [view(LEDGER, "nav", slot, "记账", { title_en: "Ledger" })])), /title_en/u);
  assert.throws(() => parsePluginManifest(manifestOf(LEDGER, "账本", [], { summary_text: { literal: "Summary" } })), /summary/u);
});

test("FSS-36 a directory's own locale files reject argument-bearing or multiline names before use", () => {
  const declared = parsePluginManifest(manifestOf(LEDGER, "账本", [view(LEDGER, "nav", "navigator", "记账", { title_text: { key: "ledger.directory.title" } })],
    { name_text: { key: "ledger.directory.name" } }));
  const packs = (message: unknown) => (file: string) => {
    const locale = file === "locales/zh.json" ? "zh" : "en";
    return JSON.stringify({ format_version: 1, owner: LEDGER, locale, messages: {
      "ledger.directory.name": locale === "en" ? message : "账本", "ledger.directory.title": locale === "en" ? "Ledger" : "记账",
    } });
  };
  assert.deepEqual(inspectPluginLocales(declared, packs("Ledger Book")), []);
  for (const invalid of ["Ledger {count}", "Ledger\nBook", { plural_arg: "count", forms: { one: "One {count}", other: "{count}" } }]) {
    assert.ok(inspectPluginLocales(declared, packs(invalid)).some(problem => problem.blocking && problem.key === "ledger.directory.name"), JSON.stringify(invalid));
  }
});

test("RAC-1721 RAC-1722 RAC-1723 RAC-1724 navigation uses the view's own title, and only a stage-only entry uses the Manifest name", () => {
  const ledger = parsePluginManifest(manifestOf(LEDGER, "原账本", [
    view(LEDGER, "nav", "navigator", "导航原名"), view(LEDGER, "isle", "island", "小岛原名", { title_text: { literal: "Original island brand" } }),
  ], { name_text: { literal: "Publisher’s ledger name" } }, false));
  const stage = parsePluginManifest(manifestOf(STAGE, "原舞台名", [
    view(STAGE, "stage", "stage", "舞台视图", { title_text: { literal: "View title" } }),
  ], { name_text: { literal: "Stage publisher title" } }, false));
  const unknown = parsePluginManifest(manifestOf("io.molis.work.fixture.images", "未运行", [
    view("io.molis.work.fixture.images", "nav", "navigator", "原视图", { title_text: { key: "images.directory.view-directory" } }),
  ]));
  const records = [ledger, stage, unknown];
  runWithLocale("en", () => {
    const directory = pluginDirectoryFor(runningPluginDirectory({
      enabledPluginIds: () => records.map(item => item.plugin_id), state: () => ({ status: "running" }),
      manifest: id => records.find(item => item.plugin_id === id),
    }));
    assert.equal(directory.find(entry => entry.id === LEDGER)?.name, "Publisher’s ledger name");
    assert.equal(railEntries([], directory).find(entry => entry.id === LEDGER)?.label, "导航原名");
    assert.equal(islandEntries([], directory).find(entry => entry.id === LEDGER)?.label, "Original island brand");
    assert.equal(railEntries([], directory).find(entry => entry.id === STAGE)?.label, "Stage publisher title");
    assert.equal(railEntries([], directory).find(entry => entry.id === unknown.plugin_id)?.label, "原视图", "a registration of the same prefix cannot supply this instance's words");
    assert.ok(!JSON.stringify(directory).includes("title_text"));
  });
  const raw: PluginDirectoryEntry = JSON.parse(JSON.stringify({ id: "raw", plugin_id: "io.example.raw", name: "  A\u0007B  ", chosen: false, ui: { views: [
    { view_id: "nav", slot: "navigator", title: "😀".repeat(100) }, { view_id: "isle", slot: "island", title: "\u0007" }, { view_id: "other", slot: "navigator", title: 5 },
  ] } }));
  const [clean] = sanitizePluginDirectory([raw]);
  assert.equal(clean?.name, "A B");
  assert.equal([...clean!.ui.views[0]!.title].length, 80);
  assert.equal(clean?.ui.views.length, 1);
});

const en = { artifacts: "Artifacts", "plugin-builder": "Plugin Studio", images: "Images", lingguang: "Lingguang", todo: "Todo", alchemist: "Alchemist", workflows: "Workflows" };
const zh = { artifacts: "成果", "plugin-builder": "插件创作工作台", images: "图片", lingguang: "灵光", todo: "待办", alchemist: "炼金术士", workflows: "工作流程" };

test("FSS-36 RAC-1725 RAC-1728 the built-in names, market summaries and tab names follow their exact registration", () => {
  for (const [locale, names] of [["zh", zh], ["en", en]] as const) runWithLocale(locale, () => {
    const directory = builtinMarketDirectory(), titles = pluginTabTitles(directory), enabled = directory.map(item => item.id);
    const rail = renderPluginRail(primitives, enabled, directory), market = renderPluginMarket(primitives, { developerMode: true }, directory);
    const extend = renderPickerExtend(primitives, ["plugin-builder"]);
    for (const [id, name] of Object.entries(names)) {
      assert.equal(titles[id], name);
      assert.match(id === "plugin-builder" ? extend : rail, new RegExp(`<span(?: [^>]*)?>${name}</span>`, "u"), id);
      if (pluginMarketCards({ developerMode: true }, directory).some(card => card.id === id)) assert.ok(market.includes(`<h2>${name}</h2>`), id);
    }
    assert.equal(pluginMarketCards({}, directory).find(entry => entry.id === "todo")?.copy, locale === "en"
      ? "Write down what needs doing, what is for today, and who you are waiting for." : "记下要做的事，分清今天、在等谁。");
    assert.equal(t.text("workbench.frame-container.result"), locale === "en" ? "Result" : "成果");
  });
});

test("RAC-1726 RAC-1729 RAC-2733 no name table lives in the Workbench and all shipped Manifests keep their versions", () => {
  for (const file of ["plugin-catalog.ts", "immersive-shell.ts"]) {
    const source = readFileSync(new URL(`../apps/workbench/src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /PLUGIN_ENGLISH_NAMES|"Plugin Studio"|Lingguang/u);
  }
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    const roundTrip = parsePluginManifest(JSON.parse(JSON.stringify(entry.manifest)));
    assert.equal(roundTrip.version, entry.manifest.version, entry.project_plugin_id);
    if (entry.project_plugin_id in en) assert.ok(roundTrip.name_text, entry.project_plugin_id);
  }
});

test("RAC-1727 RAC-2732-2 publisher names are escaped in the rail and absent from the placement-only JSON", () => runWithLocale("en", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const manifest = parsePluginManifest(manifestOf(LEDGER, "原名", [view(LEDGER, "nav", "navigator", "导航", { title_text: { literal: evil } })], {}, false));
  const projected = { ...projectDirectoryWords(manifest), id: LEDGER, plugin_id: LEDGER, chosen: false };
  const rendered = renderPluginRail(primitives, [], pluginDirectoryFor([projected]));
  assert.doesNotMatch(rendered, /<img src=x/u);
  assert.match(rendered, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/u);
  const data = renderPluginDirectoryData([projected]);
  assert.match(data, /"id":"io\.molis\.work\.ledger"/u);
  assert.doesNotMatch(data, /原名|img src|onerror/u);
}));
