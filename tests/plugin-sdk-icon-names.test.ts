import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { registeredIconNames } from "@molis-ai/molis-work-design-system";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { PLUGIN_ICON_NAMES } from "@molis-ai/molis-work-plugin-sdk/ui";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";

// BL-713 (PG-011; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §5): a view's `icon` is a name from the platform's
// icon set. The set lives in the SDK as a list a Manifest is checked against, and the host's sprite must draw every name in it.

const withViewIcon = (icon: unknown): PluginManifest => {
  const manifest = structuredClone(todoManifest) as { ui: { views: Array<Record<string, unknown>> } };
  manifest.ui.views[0]!.icon = icon;
  return manifest as unknown as PluginManifest;
};

test("RAC-2653 the SDK's list of icon names is exactly the glyphs the host's sprite draws", () => {
  assert.deepEqual([...PLUGIN_ICON_NAMES].sort(), [...registeredIconNames()].sort());
  assert.equal(new Set(PLUGIN_ICON_NAMES).size, PLUGIN_ICON_NAMES.length, "no name twice");
});

test("RAC-2625 a view icon outside the platform's set is refused when the Manifest is read, and the message names it", () => {
  const accepted = withViewIcon("book");
  assert.deepEqual(parsePluginManifest(accepted), accepted, "a name in the set reads back unchanged");
  const refused = withViewIcon("not-a-glyph");
  assert.throws(() => parsePluginManifest(refused),
    (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("not-a-glyph") && error.message.includes("不在平台图标集里"));
  assert.throws(() => parsePluginManifest(withViewIcon(7)), (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && error.message.includes("不在平台图标集里"),
    "a value that is not a string is not a name in the set");
});
