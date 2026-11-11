import assert from "node:assert/strict";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createTextReader, ownedTextRef, pluginLocaleReader, type PluginLocaleRead } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createCatalogIntegrationPlugin, type officialMethodsFor } from "@molis-ai/molis-work-integration-catalog";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { createGmailIntegrationPlugin } from "@molis-ai/molis-work-integration-gmail";
import { shippedPagePack } from "./page-text-packs.js";

export function connectorDefinition(connectorId: string): PluginDefinition & {
  connectionText: { readLocale: PluginLocaleRead; guides: Readonly<Record<string, ReturnType<typeof officialMethodsFor>>> };
} {
  const providerFor = () => { throw new Error("Only the declaration is needed"); };
  if (connectorId === "github") return createGithubIntegrationPlugin({ providerFor });
  if (connectorId === "gmail") return createGmailIntegrationPlugin({ providerFor });
  return createCatalogIntegrationPlugin({ connectorId, providerFor });
}

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
