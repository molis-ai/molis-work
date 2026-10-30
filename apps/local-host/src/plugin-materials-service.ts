import type { PluginDefinition, PluginStartContext, PluginMaterialsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginMaterialsClient } from "@molis-ai/molis-work-plugin-runtime";
import { extractHomeMaterial } from "./material-home.js";
import { readMaterialUploads } from "./material-documents.js";
import { readMaterialLocalPage } from "./material-local-page.js";
import { materialImageTextAvailable } from "./material-native.js";
import { readOriginalFile, readOriginalRange, registerOriginalFile, releaseOriginalFile } from "./material-original-files.js";
import { readMaterialSource } from "./material-source-providers.js";
import type { PluginPlatformHome } from "./home-side.js";
import { MATERIAL_PERMISSIONS } from "./plugin-service-permissions.js";


/**
 * A platform without a Home receives no material service (the model service is refused to a sandboxed activation; this one is not). A sandboxed activation is given this
 * client like any other (PG-017): the sandbox's broker forwards the readers of bytes, a page on this machine and the saved original files, one
 * method at a time, and refuses a package that asks for a network page (S-60, S-65). `project_id` is the
 * project the Host started this activation for (`null` for a Home-level one): original-file registrations are kept per project.
 */
export function pluginMaterialsFor(home: PluginPlatformHome | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void, project_id: string | null): PluginMaterialsClient | undefined {
  if (!home || !definition.manifest.permissions.some(item => MATERIAL_PERMISSIONS.includes(item.permission))) return undefined;
  return createPluginMaterialsClient(definition.manifest, {
    extract: (source, options) => extractHomeMaterial(home.directory, source, options),
    readDocuments: (files, options) => readMaterialUploads(files, { signal: options.signal, timeoutMs: options.timeoutMs }),
    // The same passive check the Host's own screens use; it starts no helper and downloads no model.
    imageTextAvailable: () => materialImageTextAvailable(),
    readSource: (url, options) => readMaterialSource(home.directory, url, { signal: options.signal,
      beforeEffect: options.beforeEffect, onProgress: options.onProgress, allow_model_download: options.allowModelDownload,
      ...(options.allowedDomains ? { allowed_hosts: options.allowedDomains } : {}) }),
    readLocalPage: (url, options) => readMaterialLocalPage(url, { signal: options.signal, beforeDispatch: options.beforeEffect }),
    claimOriginal: (key, offered, options) => registerOriginalFile(home.directory, key, offered, options.beforeEffect),
    readOriginal: (key, options) => readOriginalFile(home.directory, key, { maxBytes: options.maxBytes, signal: options.signal }),
    readOriginalRange: (key, options) => readOriginalRange(home.directory, key, { offset: options.offset, length: options.length, revision: options.revision, signal: options.signal }),
    releaseOriginal: (key, options) => releaseOriginalFile(home.directory, key, options.beforeEffect),
  }, { install_id: context.install_id, installation_generation: context.installation_generation, project_id, assertActive, requireGrant: permission => context.requireGrant(permission) });
}
