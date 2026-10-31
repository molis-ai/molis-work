// BL-636 (T-126): the English name of a plugin is its Manifest's, not a table the workbench keeps by plugin id. `name_en` is the
// Manifest's English name, `title_en` a navigator or island view's English title; the English interface shows the one the entry's
// own source declares (a navigator or island view's title, else the Manifest's name), never the other, and the Chinese interface
// is unchanged. Built-in and installed plugins take the same road: Manifest -> Host directory -> sanitize -> view registry -> rail.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  BUILTIN_PLUGIN_CATALOG, EN, builtinPluginDirectory, islandEntries, pluginDirectoryFor, pluginMarketCards, pluginTabTitles, railEntries,
  renderPickerExtend, renderPluginDirectoryData, renderPluginMarket, renderPluginRail, sanitizePluginDirectory, type PluginDirectoryEntry,
} from "@molis-ai/molis-work-app-workbench";
import { runningPluginDirectory, type DirectorySource } from "@molis-ai/molis-work-app-local-host";

const primitives = (lang: "en" | "zh") => ({ L: (value: string) => value, escapeHtml, icon: (name: string) => `<svg data-icon="${name}"></svg>`, htmlLang: () => lang });

const base = (pluginId: string, name: string, extra: Record<string, unknown>, ui: Record<string, unknown>): Record<string, unknown> => ({
  schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name, kind: "app",
  publisher: { publisher_id: "example", signature: "example-signature" },
  entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  ...extra, ui,
});
const view = (pluginId: string, id: string, slot: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ view_id: id, slot, title, contribution_id: `${pluginId}.${id}`, icon: "list", ...extra });
const uiOf = (pluginId: string, views: Array<Record<string, unknown>>) => ({ contributions: views.map(item => item.contribution_id), views });

const LEDGER = "io.molis.work.ledger", HALF = "io.molis.work.half", STAGE = "io.molis.work.stage", PLAIN = "io.molis.work.plain";
/** Three English names that differ on purpose: a wrong source shows up as a wrong word. */
const ledger = () => base(LEDGER, "记账本", { name_en: "Ledger Book" }, uiOf(LEDGER, [
  view(LEDGER, "nav", "navigator", "记账", { title_en: "Ledger", order: 70 }),
  view(LEDGER, "isle", "island", "记账小岛", { title_en: "Ledger Isle", order: 71 })]));
/** The Manifest's English only: the navigator view has none, and must not borrow it. */
const half = () => base(HALF, "半本账", { name_en: "Half Book" }, uiOf(HALF, [
  view(HALF, "nav", "navigator", "半本", { order: 72 }), view(HALF, "isle", "island", "半岛", { title_en: "Half Isle", order: 73 })]));
/** A stage only: the name is the Manifest's, so `name_en` is the English; a view's `title_en` is not read here. */
const stageOnly = () => base(STAGE, "舞台本", { name_en: "Stage Book" }, uiOf(STAGE, [view(STAGE, "stage", "stage", "舞台")]));
const plain = () => base(PLAIN, "素本", {}, uiOf(PLAIN, [view(PLAIN, "nav", "navigator", "素", { order: 74 })]));

const parsed = (manifest: Record<string, unknown>): PluginManifest => parsePluginManifest(manifest);
const sourceOf = (manifests: PluginManifest[]): DirectorySource => ({
  enabledPluginIds: () => manifests.map(item => item.plugin_id),
  state: () => ({ status: "running" }),
  manifest: id => manifests.find(item => item.plugin_id === id),
});
const hostDirectory = (...manifests: Array<Record<string, unknown>>) => pluginDirectoryFor(runningPluginDirectory(sourceOf(manifests.map(parsed))));
const labelsOf = (entries: ReadonlyArray<{ id: string; label: string }>) => Object.fromEntries(entries.map(entry => [entry.id, entry.label]));
/** Every tile of a plugin, in the order written: a plugin with an island view and a navigator view has one of each. */
const tiles = (html: string, id: string): string[] => {
  const found: string[] = [];
  for (let at = html.indexOf(`data-plugin-tile="${id}"`); at >= 0; at = html.indexOf(`data-plugin-tile="${id}"`, at + 1)) {
    const from = html.lastIndexOf('<div class="plugin-rail-tile', at);
    found.push(html.slice(from, html.indexOf("</span></div>", from) + 13));
  }
  assert.ok(found.length > 0, `a tile for ${id}`);
  return found;
};
const tile = (html: string, id: string) => tiles(html, id).at(-1)!;
const nameOf = (html: string) => /<span>([^<]*)<\/span>/u.exec(html)?.[1];

test("RAC-1720 the SDK accepts a name_en and a title_en that are one line of English and refuses the rest, naming the field", () => {
  const withView = (extra: Record<string, unknown>, slot = "navigator") => base(LEDGER, "记账本", {}, uiOf(LEDGER, [view(LEDGER, "nav", slot, "记账", extra)]));
  assert.doesNotThrow(() => parsePluginManifest(ledger()));
  assert.doesNotThrow(() => parsePluginManifest(withView({ title_en: "x".repeat(80) })));
  assert.doesNotThrow(() => parsePluginManifest(withView({ title_en: "😀".repeat(80) })), "80 code points, not 80 UTF-16 units");
  for (const [label, manifest, field] of [
    ["empty", withView({ title_en: "" }), "title_en"],
    ["blank", withView({ title_en: "   " }), "title_en"],
    ["padded", withView({ title_en: " Ledger" }), "title_en"],
    ["81 code points", withView({ title_en: "x".repeat(81) }), "title_en"],
    ["Han", withView({ title_en: "Ledger 记账" }), "title_en"],
    ["control character", withView({ title_en: "Led\u0007ger" }), "title_en"],
    ["a line break", withView({ title_en: "Led\nger" }), "title_en"],
    ["not a string", withView({ title_en: 7 }), "title_en"],
    ["on a side view", withView({ title_en: "Ledger" }, "side"), "title_en"],
    ["on a stage view", withView({ title_en: "Ledger" }, "stage"), "title_en"],
    ["name_en empty", base(LEDGER, "记账本", { name_en: "" }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账")])), "name_en"],
    ["name_en with Han", base(LEDGER, "记账本", { name_en: "账本" }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账")])), "name_en"],
    ["name_en 81 code points", base(LEDGER, "记账本", { name_en: "😀".repeat(81) }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账")])), "name_en"],
    ["name_en padded", base(LEDGER, "记账本", { name_en: "Ledger " }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账")])), "name_en"],
    ["name_en not a string", base(LEDGER, "记账本", { name_en: ["Ledger"] }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账")])), "name_en"],
  ] as const) {
    assert.throws(() => parsePluginManifest(manifest), (error: unknown) => String((error as Error).message).includes(field), `${label} is refused and names ${field}`);
  }
  const v1 = { ...base(LEDGER, "记账本", { name_en: "Ledger Book", kind: "native" }, { contributions: [] }), schema_version: 1, host_api_version: 1 };
  assert.throws(() => parsePluginManifest(v1), /name_en/u, "a v1 Manifest cannot carry name_en");
});

test("RAC-1721 the directory carries the English through the sanitizer and the view registry, cut to one line of at most 80 code points", () => {
  const [entry] = runningPluginDirectory(sourceOf([parsed(ledger())]));
  assert.equal(entry?.name_en, "Ledger Book");
  assert.deepEqual(entry?.ui.views.map(item => item.title_en), ["Ledger", "Ledger Isle"]);
  const nav = railEntries([], pluginDirectoryFor([entry!])).find(item => item.id === LEDGER);
  assert.equal(nav?.label_en, "Ledger", "the placed view carries its own title_en");
  // What the Host sends is publisher text: control characters become spaces, the line is trimmed and cut, and nothing is kept that is not text.
  const raw: PluginDirectoryEntry = JSON.parse(JSON.stringify({ id: "raw", plugin_id: "io.molis.work.raw", name: "原", name_en: "  A\u0007B  ", chosen: false, ui: { views: [
    { view_id: "nav", slot: "navigator", title: "原", title_en: "😀".repeat(100) },
    { view_id: "isle", slot: "island", title: "岛", title_en: "\u0001\u0002" },
    { view_id: "other", slot: "navigator", title: "它", title_en: 5 }] } }));
  const [clean] = sanitizePluginDirectory([raw]);
  assert.equal(clean?.name_en, "A B");
  assert.equal([...(clean?.ui.views[0]?.title_en ?? "")].length, 80);
  assert.equal(clean?.ui.views[1]?.title_en, undefined, "a title that is only control characters is dropped");
  assert.equal(clean?.ui.views[2]?.title_en, undefined, "a title that is not text is dropped");
});

test("RAC-1722 an installed plugin's English comes from the source of the entry it names, in the rail and the Dock, and the Chinese stays", () => {
  const directory = hostDirectory(ledger(), half(), plain());
  const en = primitives("en"), zh = primitives("zh");
  const rail = renderPluginRail(en, [], directory), chinese = renderPluginRail(zh, [], directory);
  assert.deepEqual(tiles(rail, LEDGER).map(nameOf), ["Ledger Isle", "Ledger"], "each view's own title_en: the island's, then the navigator's, never the Manifest's name_en");
  assert.match(tile(rail, LEDGER), /常驻 Dock：Ledger/u, "the Dock's pin names the same English");
  assert.deepEqual(tiles(chinese, LEDGER).map(nameOf), ["记账小岛", "记账"]);
  assert.deepEqual(tiles(rail, HALF).map(nameOf), ["Half Isle", "半本"], "no title_en on the navigator view: the Manifest's name_en is not borrowed");
  assert.deepEqual(tiles(chinese, HALF).map(nameOf), ["半岛", "半本"]);
  assert.equal(nameOf(tile(rail, PLAIN)), "素", "nothing declared: the original name, no error");
  const entries = labelsOf(railEntries([], directory).map(item => ({ id: item.id, label: item.label_en ?? item.label })));
  assert.equal(entries[LEDGER], "Ledger");
  const islands = labelsOf(islandEntries([], directory).map(item => ({ id: item.id, label: item.label_en ?? item.label })));
  assert.equal(islands[LEDGER], "Ledger Isle", "the island view's own title_en");
  assert.equal(islands[HALF], "Half Isle");
});

test("RAC-1723 an installed plugin that has only a stage takes the Manifest's name_en, and its Chinese name when it has none", () => {
  const withEnglish = railEntries([], hostDirectory(stageOnly())).find(item => item.id === STAGE);
  assert.equal(withEnglish?.label, "舞台本");
  assert.equal(withEnglish?.label_en, "Stage Book");
  const withoutEnglish = railEntries([], hostDirectory(base(STAGE, "舞台本", {}, uiOf(STAGE, [view(STAGE, "stage", "stage", "舞台")])))).find(item => item.id === STAGE);
  assert.equal(withoutEnglish?.label_en, undefined);
});

test("RAC-1724 a plugin that declares no English is drawn with its own name in the English interface", () => {
  const html = renderPluginRail(primitives("en"), [], hostDirectory(plain()));
  assert.equal(nameOf(tile(html, PLAIN)), "素");
  assert.doesNotMatch(html, /undefined|null/u);
});

const NAMES_EN: Readonly<Record<string, string>> = {
  artifacts: "Artifacts", "plugin-builder": "Plugin Studio", images: "Images", lingguang: "Lingguang", todo: "Todo", alchemist: "Alchemist", workflows: "Workflows",
};
const NAMES_ZH: Readonly<Record<string, string>> = {
  artifacts: "成果", "plugin-builder": "插件创作工作台", images: "图片", lingguang: "灵光", todo: "待办", alchemist: "炼金术士", workflows: "工作流程",
};

test("RAC-1725 the seven built-in plugins named in Chinese have their English names in the rail, the market and the tab titles; the Chinese is unchanged; only the to-do changed since 2026-10-15", () => {
  const directory = builtinPluginDirectory(), ids = Object.keys(NAMES_EN);
  const rail = renderPluginRail(primitives("en"), directory.map(item => item.id), directory), chinese = renderPluginRail(primitives("zh"), directory.map(item => item.id), directory);
  const english = pluginTabTitles(true, directory), zh = pluginTabTitles(false, directory);
  const market = renderPluginMarket(primitives("en"), { developerMode: true }, directory);
  const extend = renderPickerExtend(primitives("en"), ["plugin-builder"]), extendZh = renderPickerExtend(primitives("zh"), ["plugin-builder"]);
  for (const id of ids) {
    if (id === "plugin-builder") {
      // The studio is a way to extend the workbench: it is a button at the head of the switcher, not a tile.
      assert.match(extend, new RegExp(`data-plugin-id="plugin-builder"[^>]*>[\\s\\S]*?<span[^>]*>${NAMES_EN[id]}</span>`, "u"), "the studio in English");
      assert.match(extendZh, new RegExp(NAMES_ZH[id], "u"), "the studio in Chinese");
    } else {
      assert.equal(nameOf(tile(rail, id)), NAMES_EN[id], `${id} in the rail`);
      assert.equal(nameOf(tile(chinese, id)), NAMES_ZH[id], `${id} in the Chinese rail`);
    }
    assert.equal(english[id], NAMES_EN[id], `${id} as a tab title`);
    assert.equal(zh[id], NAMES_ZH[id], `${id} as a Chinese tab title`);
    if (pluginMarketCards({ developerMode: true }).some(card => card.id === id)) assert.match(market, new RegExp(`<h2>${NAMES_EN[id]}</h2>`, "u"), `${id} in the market`);
  }
  assert.ok(pluginMarketCards({ developerMode: true }).some(card => card.id === "todo"), "the market lists the to-do");
});

test("RAC-1726 the workbench keeps no table of English plugin names by plugin id", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/workbench/src/${path}`, import.meta.url)), "utf8");
  for (const file of ["plugin-catalog.ts", "immersive-shell.ts"]) assert.equal(/PLUGIN_ENGLISH_NAMES|"Plugin Studio"|Lingguang/u.test(source(file)), false, `${file} keeps a table of English names`);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    if (!(entry.project_plugin_id in NAMES_EN)) continue;
    assert.equal(entry.manifest.name_en, NAMES_EN[entry.project_plugin_id], `${entry.project_plugin_id} declares its English name`);
  }
});

test("RAC-1727 a publisher's English is escaped where it is written and the inline title data cannot close its script", () => {
  const evil = `<img src=x onerror="alert(1)">`;
  const manifest = base(LEDGER, "记账本", { name_en: "Ledger Book" }, uiOf(LEDGER, [view(LEDGER, "nav", "navigator", "记账", { title_en: "Ledger" })]));
  const [entry] = runningPluginDirectory(sourceOf([parsed(manifest)]));
  const hostile = { ...entry!, name_en: evil, ui: { views: entry!.ui.views.map(item => ({ ...item, title_en: evil })) } };
  const html = renderPluginRail(primitives("en"), [], pluginDirectoryFor([hostile]));
  assert.doesNotMatch(html, /<img src=x/u);
  assert.match(tile(html, LEDGER), /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/u);
  const data = renderPluginDirectoryData(sanitizePluginDirectory([hostile]));
  assert.doesNotMatch(data, /<img/u, "the inline JSON writes < as \\u003c");
  const titles = JSON.stringify(pluginTabTitles(true, pluginDirectoryFor([hostile]))).replaceAll("<", "\\u003c");
  assert.doesNotMatch(titles, /</u);
});

test("RAC-1728 the name and the body are two places: 成果 is Artifacts as a name and still Results in the body; 待办 is Todo in both", () => {
  const declared = (id: string) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === id)?.manifest;
  assert.equal(declared("artifacts")?.name_en, "Artifacts");
  assert.equal(EN["成果"], "Results", "the Host's body word is not touched by the plugin's name");
  assert.equal(declared("todo")?.name_en, "Todo");
  assert.equal(EN["待办"], "Todo", "the to-do is one word in the name and in the body");
});

test("RAC-1729 the built-in Manifests still pass the platform's Manifest check, and no version moved", () => {
  for (const entry of BUILTIN_PLUGIN_CATALOG) assert.doesNotThrow(() => parsePluginManifest(JSON.parse(JSON.stringify(entry.manifest))), entry.project_plugin_id);
});
