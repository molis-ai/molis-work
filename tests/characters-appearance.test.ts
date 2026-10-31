import assert from "node:assert/strict";
import test from "node:test";
import { renderPaletteTokens, renderPluginTintBindings } from "../packages/design-system/dist/palette.js";
import { railEntries, pluginTabGlyphs, pluginMarketCards } from "../apps/workbench/src/plugin-catalog.ts";
import { groupedGlobalSettingsSections } from "../apps/workbench/src/settings-sections.ts";
import { renderPluginRail } from "../apps/workbench/src/immersive-shell.ts";

// Soft Workbench (DESIGN.md → Plugin identity): plugins carry no identity colour on screen. Characters is a surface of the
// workbench, not a plugin: its purple is the tab strip's hue for it (the Host's own list, pinned by RAC-706 in
// tests/plugin-hue-declaration.test.ts), while its tint resolves to the neutral secondary ink in both themes like every plugin's.
test("Characters keeps its tab-strip hue as the Host's data and a neutral tint on screen", () => {
  const light = renderPaletteTokens("light");
  const dark = renderPaletteTokens("dark");
  assert.doesNotMatch(light + dark, /--plugin-characters/);
  assert.match(light, /--hue-purple: #7f5eb0;/);
  assert.match(dark, /--hue-purple: #c0a0ea;/);
});

test("Characters navigation and work surface receive the one neutral tint every plugin surface gets", () => {
  const bindings = renderPluginTintBindings();
  assert.match(bindings, /\.plugin-rail \[data-plugin-id\][^{}]*\{ --plugin-tint: var\(--ink-soft\); \}/);
  assert.match(bindings, /\[data-work-surface\][^{}]*\{ --plugin-tint: var\(--ink-soft\); \}/);
  assert.doesNotMatch(bindings, /"characters"/);
});

// Characters is how AI is asked to work, so its page is Settings › 角色, not a navigation entry (specs/archive/page-interaction-flow).
// RAC-73: since CHR-1 that page is the Host's own section (D3), between 助理 and 提示词, and a project cannot hide it.
/** Settings' sections in navigation order for the plugins a page shows (the Host's list, W5-02 B1): the grouped list the page draws, read as one list. */
const settingsSections = (shown?: readonly string[]) => groupedGlobalSettingsSections(shown).flatMap((group) => group.sections);

test("Characters' page is the Host's Settings › 角色 with the user glyph, not in navigation", () => {
  assert.deepEqual(railEntries(["characters"]), [{ id: "artifacts", surface: "artifacts", label: "成果", label_en: "Artifacts", glyph: "package", group: "make", rail: null, pinned_default: false, chosen: false }]);
  assert.equal(pluginTabGlyphs().characters, undefined);
  const sections = settingsSections(["characters"]);
  const pages = sections.filter((item) => item.id === "characters");
  assert.deepEqual(pages.map(({ label, icon, group, kind }) => ({ label, icon, group, kind })), [{ label: "角色", icon: "user", group: "AI", kind: "host" }]);
  const ids = sections.map((item) => item.id);
  assert.deepEqual(ids.slice(ids.indexOf("characters") - 1, ids.indexOf("characters") + 2), ["assistant", "characters", "prompts"]);
  assert.ok(settingsSections([]).some((item) => item.id === "characters"), "a page that shows no plugin still has the Host's page");
  // Settings › 角色 is the one place for it: the market neither lists it nor lets a project add or remove it.
  assert.equal(pluginMarketCards().find((item) => item.id === "characters"), undefined);
});

test("Characters is not among the plugins", () => {
  const primitives = {
    L: (value: string) => value,
    escapeHtml: (value: unknown) => String(value),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`,
  };
  const html = renderPluginRail(primitives, ["goals", "characters", "alchemist", "pages", "plugin-builder", "inbox"]);
  const items = html.slice(html.indexOf("plugin-rail-items"), html.indexOf("</nav>"));
  // Backbone first, then this project's plugins in groups, and the toggle that opens them all.
  // Groups read as purposes (plugin-e2e-review §3.1): 推进 holds the backbone, 写与做 the things one makes, 研究 the research tools.
  assert.match(items, /data-rail-zone="core"[^>]*data-plugin-id="home"[\s\S]*>推进<[\s\S]*data-plugin-id="goals"[\s\S]*data-plugin-id="inbox"[\s\S]*写与做[\s\S]*data-rail-zone="tool"[^>]*data-plugin-id="pages"[\s\S]*研究[\s\S]*data-plugin-id="alchemist"[\s\S]*data-rail-tools-toggle/);
  // Every entry carries one line saying what the person gets there.
  assert.match(items, /data-plugin-id="pages"[^>]*>[\s\S]*?<span>Pages<\/span><small class="plugin-rail-hint">[^<]+<\/small>/);
  // 角色 is a settings page (Settings › 角色), not a plugin to switch to.
  assert.doesNotMatch(items, /data-plugin-id="(market|plugin-builder|characters)"|data-work-surface-open="characters"|__SYSTEM_CAPABILITIES__/);
  // RAC-1821: the rail writes no island slot of its own; the island lives in the bar.
  assert.doesNotMatch(html, /assistant-island/, "the rail writes no island slot");
  assert.doesNotMatch(html, /plugin-rail-rule|navigation-labels-toggle/);

  const without = renderPluginRail(primitives, ["goals"]);
  assert.doesNotMatch(without, /data-plugin-id="characters"|data-plugin-tile="characters"|>创作</);
  // 更多 now lists what the project could add: grey entries that open nothing, never a Character.
  const more = without.slice(without.indexOf(">更多<"), without.indexOf("data-rail-tools-toggle"));
  assert.match(more, /data-plugin-tile="files"/);
  assert.doesNotMatch(more, /data-plugin-id=|data-plugin-tile="characters"/, "a plugin the project does not have opens nothing");
});
