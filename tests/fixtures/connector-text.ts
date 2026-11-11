import assert from "node:assert/strict";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createTextReader, ownedTextRef, pluginLocaleReader, type PluginLocaleRead } from "@molis-ai/molis-work-plugin-sdk/ui";
import { shippedPagePack } from "./page-text-packs.js";

export function connectorText(definition: { manifest: PluginManifest; connectionText: { readLocale: PluginLocaleRead } }) {
  const source = pluginLocaleReader(definition.manifest, definition.connectionText.readLocale);
  assert.ok(source, definition.manifest.plugin_id);
  const pack = source.pack("zh");
  assert.ok(pack, definition.manifest.plugin_id);
  const common = shippedPagePack("workbench", "zh");
  const words = createTextReader({ locale: "zh", packs: [common, pack] });
  return (word: PluginConnectionWord): string => {
    if (typeof word === "string") return word;
    const ref = ownedTextRef(word, pack.owner);
    if ("key" in ref) assert.equal(typeof (ref.owner === common.owner ? common : pack).messages[ref.key], "string", ref.key);
    return words.text(ref);
  };
}
