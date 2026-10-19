import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginBackgroundClient } from "@molis-ai/molis-work-plugin-runtime";

/** Available only to Host-run definitions that actually declare a background command. */
export function pluginBackgroundFor(definition: PluginDefinition, context: PluginStartContext, assertActive: () => void) {
  if (definition.execution === "sandbox" || !definition.manifest.actions?.some(action => action.action.background_job)) return undefined;
  return createPluginBackgroundClient({ install_id: context.install_id, assertActive, requireGrant: permission => context.requireGrant(permission) });
}
