import type { PluginDefinition, PluginStartContext, PluginMaterialsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginMaterialsClient } from "@molis-ai/molis-work-plugin-runtime";
import { extractHomeMaterial } from "./material-home.js";
import { readMaterialUploads } from "./material-documents.js";
import { readMaterialSource } from "./material-source-providers.js";
import type { PluginPlatformHome } from "./home-side.js";

/** Same trust boundary as services.model; a sandbox or platform without a Home receives no material service. */
export function pluginMaterialsFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void): PluginMaterialsClient | undefined {
  if (!home || definition.execution === "sandbox" || !definition.manifest.permissions.some(item => ["materials:read", "materials:fetch"].includes(item.permission))) return undefined;
  return createPluginMaterialsClient(definition.manifest, {
    extract: (source, options) => extractHomeMaterial(home.directory, source, options),
    readDocuments: (files, options) => readMaterialUploads(files, { signal: options.signal, timeoutMs: options.timeoutMs }),
    readSource: (url, options) => readMaterialSource(home.directory, url, { signal: options.signal,
      beforeEffect: options.beforeEffect, onProgress: options.onProgress, allow_model_download: options.allowModelDownload }),
  }, { install_id: context.install_id, assertActive, requireGrant: permission => context.requireGrant(permission) });
}
