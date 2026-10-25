import assert from "node:assert/strict";
import test from "node:test";
import { pluginMarketCards, renderMolisWorkBarSpecimen } from "@molis-ai/molis-work-app-workbench";
import { shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";

// W5-06 余项第一片（PG-060，RAC-80～84）：/__ui/catalog 的底栏样张（/__ui/catalog/bar）用同一个构建期插件目录画插件格，
// 并像新项目那样分亮格与灰格。亮格是样例项目默认启用的插件（现行 Dock 默认插件加个人插件），灰格是目录里其余插件；
// 格子数随目录增减，不再写插件名单。developer 插件（Text Stats）不进目录，也就不进样张。

// The Dock's default pins, the same list as DOCK_DEFAULT_PINS in apps/workbench/src/plugin-catalog.ts (the package entry
// does not export it). These are the plugins a new project starts with, before any personal plugin is added.
const DOCK_DEFAULT_PINS = ["goals", "inbox", "feed"];

const tiles = (html: string) => [...html.matchAll(/data-plugin-tile="([^"]+)"/g)].map(match => match[1]!);
const toggles = (html: string) => [...html.matchAll(/data-plugin-toggle="([^"]+)"[^>]*data-state="(added|available)"/g)]
  .map(match => ({ id: match[1]!, state: match[2]! as "added" | "available" }));

test("RAC-80/81: the bar specimen draws the plugin directory with the sample project's plugins bright and the rest grey", () => {
  const html = renderMolisWorkBarSpecimen();
  const states = toggles(html);
  const bright = states.filter(toggle => toggle.state === "added").map(toggle => toggle.id);
  const grey = states.filter(toggle => toggle.state === "available").map(toggle => toggle.id);
  const enabled = new Set(shownProjectPlugins([...DOCK_DEFAULT_PINS]));
  const directory = pluginMarketCards().map(card => card.id);

  assert.doesNotMatch(html, /data-plugin-(?:tile|toggle)="sessions"/, "SC-4 removed Sessions from the directory and the sample must keep it absent");
  for (const pin of DOCK_DEFAULT_PINS) assert.ok(bright.includes(pin), `${pin} is a Dock default pin and stays bright`);
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
  for (const id of tiles(html)) assert.ok(bright.includes(id) || grey.includes(id), `${id} is drawn as bright or grey`);
});

test("RAC-82: the developer plugin stays out of the bar specimen, as it stays out of the plugin directory", () => {
  const html = renderMolisWorkBarSpecimen();
  assert.equal(pluginMarketCards().some(card => card.id === "text-stats"), false, "Text Stats is not in the directory");
  assert.doesNotMatch(html, /data-plugin-tile="text-stats"/, "and not in the specimen's tiles");
  assert.doesNotMatch(html, /data-plugin-toggle="text-stats"/, "nor its add control");
});
