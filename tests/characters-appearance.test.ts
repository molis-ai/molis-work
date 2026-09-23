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

test("Characters button sits in the identity card, ahead of settings and the account", () => {
  const primitives = {
    L: (value: string) => value,
    escapeHtml: (value: unknown) => String(value),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
  };
  const account = `<footer class="personal-sidebar-footer"><button data-plugin-id="settings"></button><button class="personal-account"></button></footer>`;
  const html = renderPluginRail(primitives, ["goals", "characters", "pages", "plugin-builder"], account);
  const items = html.slice(html.indexOf("plugin-rail-items"), html.indexOf("personal-sidebar-footer"));
  const card = html.slice(html.indexOf("personal-sidebar-footer"));
  assert.match(items, /data-plugin-id="plugin-builder"[\s\S]*data-icon="wand"[\s\S]*class="plugin-rail-rule"[\s\S]*data-plugin-id="home"[\s\S]*data-plugin-id="goals"/);
  assert.match(items, /data-plugin-id="pages"/);
  assert.doesNotMatch(items.slice(items.indexOf("plugin-rail-rule")), /data-plugin-id="plugin-builder"/);
  assert.doesNotMatch(items, /data-plugin-id="characters"|data-plugin-id="market"/);
  assert.match(card, /data-plugin-id="market"[\s\S]*data-plugin-id="characters"[\s\S]*data-plugin-id="settings"[\s\S]*class="personal-account"/);
  assert.match(card, /data-work-surface-open="characters"/);

  const without = renderPluginRail(primitives, ["goals"], account);
  const plainCard = without.slice(without.indexOf("personal-sidebar-footer"));
  assert.doesNotMatch(without, /plugin-rail-rule/);
  assert.doesNotMatch(plainCard, /data-plugin-id="characters"/);
  assert.match(plainCard, /data-plugin-id="market"[\s\S]*data-plugin-id="settings"[\s\S]*class="personal-account"/);
});
