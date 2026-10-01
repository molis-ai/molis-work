import assert from "node:assert/strict";
import test from "node:test";
import { MW_PLUGINS, renderPaletteTokens, renderPluginTintBindings } from "../packages/design-system/src/palette.ts";
import { railEntries, pluginTabGlyphs, pluginMarketCards } from "../apps/workbench/src/plugin-catalog.ts";
import { listPluginSettingsNavItems } from "../apps/workbench/src/plugin-settings-catalog.ts";
import { renderPluginRail } from "../apps/workbench/src/immersive-shell.ts";

// Soft Workbench (DESIGN.md → Plugin identity): plugins carry no identity colour on screen. Characters keeps
// purple as registered catalog data, while its tint resolves to the neutral secondary ink in both themes.
test("Characters keeps its registered hue as data and a neutral tint on screen", () => {
  const light = renderPaletteTokens("light");
  const dark = renderPaletteTokens("dark");
  assert.equal(MW_PLUGINS.find((plugin) => plugin.id === "characters")?.hue, "purple");
  assert.match(light, /--plugin-characters: var\(--ink-soft\);/);
  assert.match(light, /--hue-purple: #7f5eb0;/);
  assert.match(dark, /--plugin-characters: var\(--ink-soft\);/);
  assert.match(dark, /--hue-purple: #c0a0ea;/);
});

test("Characters navigation and work surface receive its registered theme tint", () => {
  const bindings = renderPluginTintBindings();
  assert.match(bindings, /\.plugin-rail \[data-plugin-id="characters"\][^{}]*\{ --plugin-tint: var\(--plugin-characters\); \}/);
  assert.match(bindings, /\[data-work-surface="characters"\][^{}]*\{ --plugin-tint: var\(--plugin-characters\); \}/);
});

// Characters is how AI is asked to work, so its page is Settings › 角色, not a navigation entry (specs/archive/page-interaction-flow).
test("Characters manifest places its page in settings with the user glyph, not in navigation", () => {
  assert.deepEqual(railEntries(["characters"]), []);
  assert.equal(pluginTabGlyphs().characters, undefined);
  const page = listPluginSettingsNavItems(["characters"]).find((item) => item.section_id === "characters");
  assert.deepEqual({ label: page?.label, icon: page?.icon, order: page?.order }, { label: "角色", icon: "user", order: 35 });
  // Settings › 角色 is the one place for it: the market neither lists it nor lets a project add or remove it.
  assert.equal(pluginMarketCards().find((item) => item.id === "characters"), undefined);
});

test("Characters is not among the plugins; the market and the studio live in the Dock menu", () => {
  const primitives = {
    L: (value: string) => value,
    escapeHtml: (value: unknown) => String(value),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
  };
  const account = `<footer class="personal-sidebar-footer"><button class="personal-account"></button><details data-global-menu><summary></summary><div><!-- account-global-items --><button data-plugin-id="settings"></button></div></details></footer>`;
  const island = `<div class="assistant-island" data-assistant-island><button data-plugin-id="lingguang"></button></div>`;
  const html = renderPluginRail(primitives, ["goals", "characters", "experiments", "pages", "plugin-builder", "inbox"], account, island);
  const items = html.slice(html.indexOf("plugin-rail-items"), html.indexOf("personal-sidebar-footer"));
  // Backbone first, then this project's plugins in groups, and the toggle that opens them all.
  // Groups read as purposes (plugin-e2e-review §3.1): 推进 holds the backbone, 写与做 the things one makes, 研究 the experiments.
  assert.match(items, /data-rail-zone="core"[^>]*data-plugin-id="home"[\s\S]*>推进<[\s\S]*data-plugin-id="goals"[\s\S]*data-plugin-id="inbox"[\s\S]*写与做[\s\S]*data-rail-zone="tool"[^>]*data-plugin-id="pages"[\s\S]*研究[\s\S]*data-plugin-id="experiments"[\s\S]*data-rail-tools-toggle/);
  // Every entry carries one line saying what the person gets there.
  assert.match(items, /data-plugin-id="pages"[^>]*>[\s\S]*?<span>Pages<\/span><small class="plugin-rail-hint">[^<]+<\/small>/);
  // 角色 is a settings page (Settings › 角色), not a plugin to switch to.
  assert.doesNotMatch(items, /data-plugin-id="(market|plugin-builder|characters)"|data-work-surface-open="characters"|__SYSTEM_CAPABILITIES__/);
  // The ways to extend the workbench sit in the Dock menu; capabilities moved to the project button with the person.
  const footer = html.slice(html.indexOf("personal-sidebar-footer"));
  assert.match(footer, /data-global-menu[\s\S]*data-plugin-id="market"[\s\S]*data-plugin-id="plugin-builder"[\s\S]*data-icon="wand"/);
  assert.doesNotMatch(footer, /__SYSTEM_CAPABILITIES__/);
  assert.match(html, /data-assistant-island[\s\S]*data-plugin-id="lingguang"[\s\S]*plugin-rail-items/);
  assert.doesNotMatch(html, /plugin-rail-rule|navigation-labels-toggle/);

  const without = renderPluginRail(primitives, ["goals"], account);
  assert.doesNotMatch(without, /data-plugin-id="characters"|>创作<|>更多</);
  assert.match(without, /data-plugin-id="goals"[\s\S]*data-global-menu[\s\S]*data-plugin-id="market"/);
});
