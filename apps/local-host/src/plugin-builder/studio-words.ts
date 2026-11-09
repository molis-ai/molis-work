import { studioLocaleFiles, type AgentDesign } from "@molis-ai/molis-work-plugin-builder";
import { assertPluginLocales, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { pluginTextSlot, pluginTextSlotKey } from "@molis-ai/molis-work-design-system";

/** The manifest explicitly names the same word the Studio already froze. */
export function studioManifestWords(design: AgentDesign) {
  if (!design.localePacks) return undefined;
  const plugin_id = design.contract.pluginId;
  return { plugin_id, name_text: { key: pluginTextSlotKey(plugin_id, pluginTextSlot("plugin", "name")) } };
}

/** Only immutable words from this draft snapshot or original Studio release; a signed install supplies its own reader. */
export function studioWordReader(design: AgentDesign, manifest: PluginLocaleManifest): PluginLocaleReader | null {
  if (!manifest.ui?.locales) return null;
  const files = studioLocaleFiles(design.localePacks), read = (path: string) => files[path] ?? null;
  assertPluginLocales(manifest, read);
  return pluginLocaleReader(manifest, read);
}
