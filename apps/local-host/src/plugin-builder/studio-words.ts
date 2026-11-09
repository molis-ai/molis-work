import { studioLocaleFiles, type AgentDesign } from "@molis-ai/molis-work-plugin-builder";
import { assertPluginLocales, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";

/** Only immutable words from this draft snapshot or original Studio release; a signed install supplies its own reader. */
export function studioWordReader(design: AgentDesign, manifest: PluginLocaleManifest): PluginLocaleReader | null {
  if (!manifest.ui?.locales) return null;
  const files = studioLocaleFiles(design.localePacks), read = (path: string) => files[path] ?? null;
  assertPluginLocales(manifest, read);
  return pluginLocaleReader(manifest, read);
}
