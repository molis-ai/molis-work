import assert from "node:assert/strict";
import test from "node:test";
import { renderPaletteTokens, renderPluginTintBindings } from "../packages/design-system/src/palette.ts";
import { railEntries, pluginTabGlyphs } from "../apps/workbench/src/plugin-catalog.ts";

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
