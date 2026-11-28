import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG, HOST_FRAMED_SURFACES, builtinPluginDirectory, pluginMarketCards, railEntries, renderMolisWorkBarSpecimen, renderMolisWorkPrimitiveCatalog, renderPluginFrameSurface, renderStagePage } from "@molis-ai/molis-work-app-workbench";
import { expandDesign } from "@molis-ai/molis-work-plugin-studio";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { uiHelpDeclarationProblems } from "@molis-ai/molis-work-plugin-sdk/ui";

// The platform's words, as the Host installs them when it starts: pages say stable keys (`t`) as well as `L`.
installHostUiText();

// W5-06 余项第一片（PG-060，RAC-80～84）：/__ui/catalog 的底栏样张（/__ui/catalog/bar）用同一个构建期插件目录画插件格，
// 并像新项目那样分亮格与灰格。亮格是样例项目默认启用的插件（骨干插件加个人插件），灰格是目录里其余插件；
// 格子数随目录增减，不再写插件名单。
// PG-077 / BL-177: the platform Artifact and Sessions tiles are always available to open and have no Plugin membership toggle.

// The backbone is what the Manifests declare (`rail: "core"`, W5-02 PG-074), the plugins a new project starts with, before any
// personal plugin is added.
const BACKBONE = railEntries(builtinPluginDirectory().map(entry => entry.id)).filter(entry => entry.rail === "core").map(entry => entry.id);

// Work Brief joins them in batch 109-1 (`databases.partition`).
const PARTITION_LIBRARY_PLUGINS = ["pages", "ppt", "form", "dataset", "lingguang", "workflows", "todo", "issues", "cognia", "images", "jelly", "work-brief"];

const tiles = (html: string) => [...html.matchAll(/data-plugin-tile="([^"]+)"/g)].map(match => match[1]!);
const toggles = (html: string) => [...html.matchAll(/data-plugin-toggle="([^"]+)"[^>]*data-state="(added|available)"/g)]
  .map(match => ({ id: match[1]!, state: match[2]! as "added" | "available" }));

test("RAC-80/81: the bar specimen draws the plugin directory with the sample project's plugins bright and the rest grey", () => {
  const html = renderMolisWorkBarSpecimen();
  const states = toggles(html);
  const bright = states.filter(toggle => toggle.state === "added").map(toggle => toggle.id);
  const grey = states.filter(toggle => toggle.state === "available").map(toggle => toggle.id);
  // Batches 107, 108 and 109-1: the partition-library plugins are not personal; the sample project has them added, as the personal space does.
  const enabled = new Set([...BACKBONE, ...PARTITION_LIBRARY_PLUGINS]);
  const directory = pluginMarketCards().map(card => card.id);

  assert.ok(BACKBONE.length > 0, "the Manifests declare a backbone");
  for (const id of BACKBONE) assert.ok(bright.includes(id), `${id} is the backbone and stays bright`);
  for (const id of bright) assert.ok(enabled.has(id), `${id} is bright because the sample project has it enabled`);
  // The plugin studio is the platform's framed surface (47-1 C), in every project: the rail never draws it as a tile, and the
  // switcher's head carries it as its own 创作台 button (renderPickerExtend), read from its declaration.
  assert.ok(!tiles(html).includes("plugin-builder"), "the plugin studio is not a rail tile");
  assert.match(html, /class="[^"]*plugin-picker-extend-btn[^"]*"[^>]*data-plugin-id="plugin-builder"/, "the studio is the picker's 创作台 button");
  for (const id of enabled) if (directory.includes(id) && id !== "plugin-builder") assert.ok(bright.includes(id), `${id} is an enabled directory plugin and is drawn bright`);
  assert.deepEqual(grey.slice().sort(), directory.filter(id => !enabled.has(id)).sort(),
    "the grey cells are exactly the directory's plugins the sample project has not added");
  assert.ok(bright.length > 0 && grey.length > 0, "both states are visible");
  assert.match(html, /class="plugin-rail-tile is-available[^"]*" data-plugin-tile="/, "a grey tile carries the not-added class");
  for (const surface of ["artifacts", "sessions"] as const) {
    assert.deepEqual(tiles(html).filter(id => id === surface), [surface], `the platform ${surface} surface is present once`);
    assert.equal(directory.includes(surface), false, `the platform ${surface} surface is not in the Plugin market`);
    assert.doesNotMatch(html, new RegExp(`data-plugin-toggle="${surface}"`), `the platform ${surface} surface cannot be added or removed as a Plugin`);
    assert.match(html, new RegExp(`class="plugin-rail-tile" data-plugin-tile="${surface}"`), `the platform ${surface} surface is available to open, not a grey unavailable Plugin`);
    assert.match(html, new RegExp(`data-plugin-id="${surface}"[^>]*data-work-surface-open="${surface}"`), `the ${surface} tile opens the existing platform work surface`);
  }
  for (const id of tiles(html).filter(id => id !== "artifacts" && id !== "sessions")) assert.ok(bright.includes(id) || grey.includes(id), `${id} is drawn as bright or grey`);
});

test("VUX-55 VUX-56: the component board renders the 4 Batch 03 on-demand help specimens in zh and en", () => {
  for (const lang of ["zh-CN", "en"] as const) {
    const html = renderMolisWorkPrimitiveCatalog((key) => key, lang);
    assert.match(html, /id="on-demand-help"/, `${lang}: has on-demand help section`);
    assert.match(html, /href="#on-demand-help"/, `${lang}: indexed in catalog sidebar`);
    assert.match(html, /class="mw-facts"/, `${lang}: pre-action facts block`);
    assert.match(html, /mw-fact-row--ok/, `${lang}: ready fact row`);
    assert.match(html, /mw-fact-row--warn/, `${lang}: missing fact row`);
    assert.match(html, /mw-fact-row--out/, `${lang}: external-send fact row`);
    assert.match(html, /class="mw-help-content"/, `${lang}: help content block`);
    assert.match(html, /mw-help-section is-highlighted/, `${lang}: highlighted help section`);
    assert.match(html, /class="mw-help-tip"/, `${lang}: skippable first-visit tip`);
    assert.match(html, /aria-expanded="true"/, `${lang}: expanded button specimen`);
    assert.match(html, /aria-pressed="true"/, `${lang}: pressed button specimen`);
  }
});

test("VUX-55 VUX-58: every native built-in plugin manifest declares valid bilingual ui.help with all zh/en keys", () => {
  const wbZh = JSON.parse(readFileSync(new URL("../apps/workbench/resources/locales/zh.json", import.meta.url), "utf8")).messages as Record<string, unknown>;
  const wbEn = JSON.parse(readFileSync(new URL("../apps/workbench/resources/locales/en.json", import.meta.url), "utf8")).messages as Record<string, unknown>;
  // The platform's own framed surfaces (the studio, 47-1 C; Shelf, 44B) declare their help the same way.
  const declared = [...BUILTIN_PLUGIN_CATALOG, ...HOST_FRAMED_SURFACES];
  assert.ok(declared.length >= 22, `expected at least 22 built-in plugins and platform surfaces, got ${declared.length}`);
  const readKey = (ref: unknown): string[] => (ref && typeof ref === "object" && "key" in ref && typeof (ref as { key?: unknown }).key === "string") ? [(ref as { key: string }).key] : [];
  for (const entry of declared) {
    const help = entry.manifest.ui.help;
    assert.ok(help && help.topics.length > 0, `${entry.project_plugin_id}: manifest.ui.help must be declared`);
    assert.deepEqual(uiHelpDeclarationProblems(entry.manifest), [], `${entry.project_plugin_id}: ui.help must pass SDK validation`);
    const surfacePackage = ({ "plugin-builder": "horizontal/plugin-studio", shelf: "modules/shelf" } as Record<string, string>)[entry.project_plugin_id];
    const locales = HOST_FRAMED_SURFACES.includes(entry as typeof HOST_FRAMED_SURFACES[number]) ? `../${surfacePackage}/locales` : `../plugins/native/${entry.project_plugin_id}/locales`;
    const zhPath = new URL(`${locales}/zh.json`, import.meta.url);
    const enPath = new URL(`${locales}/en.json`, import.meta.url);
    const zh = JSON.parse(readFileSync(zhPath, "utf8")).messages as Record<string, unknown>;
    const en = JSON.parse(readFileSync(enPath, "utf8")).messages as Record<string, unknown>;
    for (const topic of help.topics) {
      const keys = [
        ...readKey(topic.title),
        ...readKey(topic.first_visit_tip),
        ...topic.sections.flatMap((section) => [
          ...readKey(section.heading),
          ...readKey(section.body),
          ...readKey(section.summary),
          ...(section.items ?? []).flatMap(readKey),
        ]),
      ];
      for (const key of keys) {
        const hasZh = key.startsWith("common.") ? Object.hasOwn(wbZh, key) : Object.hasOwn(zh, key);
        const hasEn = key.startsWith("common.") ? Object.hasOwn(wbEn, key) : Object.hasOwn(en, key);
        assert.ok(hasZh, `${entry.project_plugin_id}: missing zh key ${key}`);
        assert.ok(hasEn, `${entry.project_plugin_id}: missing en key ${key}`);
      }
    }
  }
});

test("VUX-55 VUX-59 (B2): installed frames do not inherit plugin-builder help and third-party manifest.ui.help flows through renderStagePage", () => {
  const installedHtml = renderPluginFrameSurface(
    '<main class="as-preview-page"></main>',
    "app-1",
    "Generated App",
    true,
    false,
    "plugin-builder",
    undefined,
    undefined,
    undefined,
    false,
    { owner: "studio.demo", page: "/projects/p/plugins/studio.demo?frame=workbench" },
  );
  assert.doesNotMatch(installedHtml, /data-plugin-help|data-mw-help-declaration/u, "installed plugin frame must not inherit plugin-builder ui.help");
  // 47-1 C: the studio is the platform's framed surface, not a catalog plugin, and its own frame still carries the help its Manifest declares.
  const studioHtml = renderPluginFrameSurface('<main class="as-page"></main>', "plugin-builder", "Plugin Studio", true, false, "plugin-builder");
  assert.match(studioHtml, /<script type="application\/json" data-plugin-help>/u, "the studio frame carries its declared help");
  assert.ok(studioHtml.includes(JSON.stringify(HOST_FRAMED_SURFACES[0]!.manifest.ui.help).replaceAll("<", "\\u003c")), "the help is the studio Manifest's own");

  const thirdPartyManifest: PluginManifest = {
    ...BUILTIN_PLUGIN_CATALOG[0]!.manifest,
    plugin_id: "io.example.vendor.tracker",
    name: "Vendor Tracker",
    ui: {
      contributions: ["vendor.tracker.stage"],
      views: [{ view_id: "stage", slot: "stage", title: "Tracker", contribution_id: "vendor.tracker.stage" }],
      help: {
        default_topic: "page",
        topics: [{
          id: "page",
          title: { key: "tracker.help.title" },
          sections: [{ id: "what", heading: { key: "common.help.section-what" }, body: { key: "tracker.help.what" } }],
        }],
      },
    },
  };
  const rendered = renderStagePage(
    {
      descriptor: {
        contribution_id: "vendor.tracker.stage",
        kind: "primary-page",
        label: "Tracker",
        slots: [],
        surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }],
      },
      render: () => '<main data-work-surface="tracker" data-work-surface-label="Tracker"></main>',
    },
    {},
    "tracker",
    false,
    undefined,
    {
      manifest: thirdPartyManifest,
      client: { clientMounts: "surfaces", clientFactory: "() => {}" },
    },
  );
  assert.match(rendered.html, /<script type="application\/json" data-plugin-help>/u, "non-builtin manifest.ui.help flows through renderStagePage as a sibling help payload");
  assert.match(rendered.html, /tracker\.help\.title/u, "non-builtin help topic keys are preserved verbatim");
  assert.doesNotMatch(rendered.html, /data-plugin-document>[^<]*data-mw-help-declaration/u, "plugin owner document markup stays untouched");

  // P1-3 & P2-10 hygiene guards: platform frame child has zero plugin-private class hooks, and side-panel has no duplicate data-side-help-body.
  const childSource = readFileSync(new URL("../apps/workbench/src/browser/plugin-frame/child.ts", import.meta.url), "utf8");
  assert.doesNotMatch(childSource, /\.wb-head-actions|\.as-head-actions/u, "P1-3: child.ts relies on [data-help-slot], not plugin-private CSS classes");
  const sidePanelSource = readFileSync(new URL("../apps/workbench/src/side-panel.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sidePanelSource, /data-side-help-body/u, "P2-10: outer side-panel body does not duplicate data-side-help-body");

  // P2-9: Studio expandDesign forwards valid design.help to contract.help and gracefully drops invalid declarations.
  const base = { id: "p1", title: "Demo", description: "Desc", rationale: "Why", journey: ["Open"] };
  const sampleDesign = {
    title: "Demo",
    description: "Desc",
    operations: [{ id: "items.list", kind: "query", description: "List", input: {}, output: [{ id: "string", title: "string" }], effects: { storage: ["read"] }, examples: [{ input: {}, output: [] }] }],
    pages: [{ id: "home", title: "Home", parts: [{ id: "list", intent: "collection", purpose: "Show", props: { idField: "id", titleField: "title", emptyText: "Empty" }, read: "items.list" }] }],
    acceptance: [{ id: "empty", description: "Empty", steps: [{ action: "page", pageId: "home" }, { action: "expectWord", componentId: "list", word: "emptyText" }] }],
    // Every design answers `states` (SMP-11); these items have none.
    states: [],
  };
  const droppedValid: string[] = [];
  const validExpanded = expandDesign({
    ...sampleDesign,
    help: { default_topic: "page", topics: [{ id: "page", title: "Demo help", sections: [{ id: "what", heading: "What", body: "Lists saved items." }] }] },
  }, base, "io.molis.generated.demo", "rev-1", droppedValid);
  assert.equal(validExpanded.contract.help?.default_topic, "page");
  assert.equal(validExpanded.contract.help?.topics[0]?.title, "Demo help");

  const droppedInvalid: string[] = [];
  const invalidExpanded = expandDesign({
    ...sampleDesign,
    help: { default_topic: "missing", topics: [] },
  }, base, "io.molis.generated.demo", "rev-1", droppedInvalid);
  assert.equal(invalidExpanded.contract.help, undefined);
  assert.ok(droppedInvalid.some((note) => note.includes("按需帮助")));
});
