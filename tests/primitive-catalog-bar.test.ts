import assert from "node:assert/strict";
import test from "node:test";
import { builtinPluginDirectory, pluginMarketCards, railEntries, renderMolisWorkBarSpecimen, renderMolisWorkPrimitiveCatalog } from "@molis-ai/molis-work-app-workbench";
import { installHostUiText, shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";

// The platform's words, as the Host installs them when it starts: pages say stable keys (`t`) as well as `L`.
installHostUiText();

// W5-06 余项第一片（PG-060，RAC-80～84）：/__ui/catalog 的底栏样张（/__ui/catalog/bar）用同一个构建期插件目录画插件格，
// 并像新项目那样分亮格与灰格。亮格是样例项目默认启用的插件（骨干插件加个人插件），灰格是目录里其余插件；
// 格子数随目录增减，不再写插件名单。developer 插件（Text Stats）不进目录，也就不进样张。
// PG-077 / BL-177: the platform Artifact and Sessions tiles are always available to open and have no Plugin membership toggle.

// The backbone is what the Manifests declare (`rail: "core"`, W5-02 PG-074), the plugins a new project starts with, before any
// personal plugin is added.
const BACKBONE = railEntries(builtinPluginDirectory().map(entry => entry.id)).filter(entry => entry.rail === "core").map(entry => entry.id);

const tiles = (html: string) => [...html.matchAll(/data-plugin-tile="([^"]+)"/g)].map(match => match[1]!);
const toggles = (html: string) => [...html.matchAll(/data-plugin-toggle="([^"]+)"[^>]*data-state="(added|available)"/g)]
  .map(match => ({ id: match[1]!, state: match[2]! as "added" | "available" }));

test("RAC-80/81: the bar specimen draws the plugin directory with the sample project's plugins bright and the rest grey", () => {
  const html = renderMolisWorkBarSpecimen();
  const states = toggles(html);
  const bright = states.filter(toggle => toggle.state === "added").map(toggle => toggle.id);
  const grey = states.filter(toggle => toggle.state === "available").map(toggle => toggle.id);
  const enabled = new Set(shownProjectPlugins([...BACKBONE]));
  const directory = pluginMarketCards().map(card => card.id);

  assert.ok(BACKBONE.length > 0, "the Manifests declare a backbone");
  for (const id of BACKBONE) assert.ok(bright.includes(id), `${id} is the backbone and stays bright`);
  for (const id of bright) assert.ok(enabled.has(id), `${id} is bright because the sample project has it enabled`);
  // The plugin studio is a personal plugin, so the sample project has it enabled — but the rail draws it as the switcher's
  // own 创作台 button (renderPickerExtend), not as a tile: the mechanism a real new project uses, not a hand-written name.
  assert.ok(!tiles(html).includes("plugin-builder"), "the plugin studio is not a rail tile");
  assert.match(html, /class="[^"]*plugin-picker-extend-btn[^"]*"[^>]*data-plugin-id="plugin-builder"/, "the enabled studio is the picker's 创作台 button");
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

test("RAC-82: the developer plugin stays out of the bar specimen, as it stays out of the plugin directory", () => {
  const html = renderMolisWorkBarSpecimen();
  assert.equal(pluginMarketCards().some(card => card.id === "text-stats"), false, "Text Stats is not in the directory");
  assert.doesNotMatch(html, /data-plugin-tile="text-stats"/, "and not in the specimen's tiles");
  assert.doesNotMatch(html, /data-plugin-toggle="text-stats"/, "nor its add control");
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
