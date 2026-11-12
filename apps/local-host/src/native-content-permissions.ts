import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { builtinPluginByManifestId } from "./plugin-registry.js";

const PAGES_PLUGIN_ID = "io.molis.work.pages", LINGGUANG_PLUGIN_ID = "io.molis.work.lingguang";

/** The handoff stations (workflow content roles) a shipped plugin declares in its own Manifest, read from the build's registrations (PG-031). */
const contentStations = (pluginId: string) => (builtinPluginByManifestId(pluginId)?.manifest.actions ?? [])
  .filter(definition => definition.action.workflow_content);

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...registeredPermissions("io.molis.work.feed"),
  ...[...contentStations(PAGES_PLUGIN_ID), ...contentStations(LINGGUANG_PLUGIN_ID), ...Object.values(inboxContentActions)].flatMap(definition => definition.action.permissions),
])];

/** Read the same generated registration as Runtime; no plugin implementation or second permission list. */
function registeredPermissions(pluginId: string): string[] {
  const manifest = builtinPluginByManifestId(pluginId)?.manifest;
  return [...(manifest?.actions ?? []).flatMap(action => action.action.permissions), ...(manifest?.action_scenes ?? []).flatMap(scene => scene.permissions)];
}
