import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginBackgroundClient } from "@molis-ai/molis-work-plugin-runtime";

/** Host-run definitions that actually declare a background command; only they get `services.background`. */
export function hasPluginBackground(definition: PluginDefinition): boolean {
  return definition.execution !== "sandbox" && !!definition.manifest.actions?.some(action => action.action.background_job);
}

export function pluginBackgroundFor(definition: PluginDefinition, context: PluginStartContext, assertActive: () => void) {
  if (!hasPluginBackground(definition)) return undefined;
  return createPluginBackgroundClient({ install_id: context.install_id, assertActive, requireGrant: permission => context.requireGrant(permission) });
}
