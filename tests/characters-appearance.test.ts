import assert from "node:assert/strict";
import test from "node:test";
import { renderPaletteTokens, renderPluginTintBindings } from "../packages/design-system/src/palette.ts";
import { railEntries, pluginTabGlyphs } from "../apps/workbench/src/plugin-catalog.ts";
import { renderPluginRail } from "../apps/workbench/src/immersive-shell.ts";

test("Characters uses the purple text color in both light and dark themes", () => {
  const light = renderPaletteTokens("light");
  const dark = renderPaletteTokens("dark");
  assert.match(light, /--plugin-characters: var\(--hue-purple\);/);
  assert.match(light, /--hue-purple: #7f5eb0;/);
  assert.match(dark, /--plugin-characters: var\(--hue-purple\);/);
  assert.match(dark, /--hue-purple: #c0a0ea;/);
});

test("Characters navigation and work surface receive its registered theme tint", () => {
  const bindings = renderPluginTintBindings();
  assert.match(bindings, /\.plugin-rail \[data-plugin-id="characters"\][^{}]*\{ --plugin-tint: var\(--plugin-characters\); \}/);
  assert.match(bindings, /\[data-work-surface="characters"\][^{}]*\{ --plugin-tint: var\(--plugin-characters\); \}/);
});

test("Characters manifest supplies the user glyph to navigation and tabs", () => {
  assert.deepEqual(railEntries(["characters"]), [
    { id: "characters", surface: "characters", label: "Characters", glyph: "user" },
  ]);
  assert.equal(pluginTabGlyphs().characters, "user");
});

test("Characters sits with the other tools; building and adding tools close the list, you close the rail", () => {
  const primitives = {
    L: (value: string) => value,
    escapeHtml: (value: unknown) => String(value),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
  };
  const account = `<footer class="personal-sidebar-footer"><button data-plugin-id="settings"></button><button class="personal-account"></button></footer>`;
  const island = `<div class="assistant-island" data-assistant-island><button data-plugin-id="lingguang"></button></div>`;
  const html = renderPluginRail(primitives, ["goals", "characters", "pages", "plugin-builder", "inbox"], account, island);
  const items = html.slice(html.indexOf("plugin-rail-items"), html.indexOf("data-assistant-island"));
  assert.match(items, /data-plugin-id="home"[\s\S]*data-plugin-id="goals"[\s\S]*data-plugin-id="inbox"[\s\S]*创作[\s\S]*data-plugin-id="pages"[\s\S]*更多[\s\S]*data-plugin-id="characters"[\s\S]*拓展[\s\S]*data-plugin-id="plugin-builder"[\s\S]*data-icon="wand"[\s\S]*data-plugin-id="market"[\s\S]*href="__SYSTEM_CAPABILITIES__"/);
  assert.match(items, /data-work-surface-open="characters"/);
  assert.match(html, /plugin-rail-items[\s\S]*data-assistant-island[\s\S]*data-plugin-id="lingguang"[\s\S]*class="personal-sidebar-footer"[\s\S]*data-plugin-id="settings"[\s\S]*class="personal-account"/);
  assert.doesNotMatch(html, /plugin-rail-rule|navigation-labels-toggle/);

  const without = renderPluginRail(primitives, ["goals"], account);
  assert.doesNotMatch(without, /data-plugin-id="characters"|>创作<|>更多</);
  assert.match(without, /data-plugin-id="goals"[\s\S]*拓展[\s\S]*data-plugin-id="market"/);
});
