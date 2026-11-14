import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installedArtifacts } from "./artifact-type-registry.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** A plugin that declares it takes a kind of onboarding material (batch12-design §7.3), with the action that takes it. */
export interface OnboardingTaker {
  readonly plugin_id: string;
  /** The key the project's plugin list uses for it. */
  readonly project_plugin_id: string;
  /** The Manifest's name, as the plugin market lists it. */
  readonly name: string;
  /** Its own declared action, with its own permissions; the platform calls this one only. */
  readonly take: ActionDefinition;
}

/**
 * The plugins that take `kind` from onboarding, by their Manifests' `onboarding.takes` and nothing else: the plugins this build ships
 * (read from their installed Manifest when one is in effect, so an upgrade shows) and the plugins installed on this Host, as the
 * 成果库 reads its producers. Personal plugins are not added to a project, so they take nothing.
 */
export function onboardingTakers(kind: "code_root"): OnboardingTaker[] {
  const effective = installedArtifacts.effective(), byId = new Map(effective.map(manifest => [manifest.plugin_id, manifest] as const)), known = installedArtifacts.known();
  const shipped = PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry.personal !== true).flatMap(entry => {
    const installed = byId.get(entry.manifest.plugin_id);
    return installed ? [[installed, entry.project_plugin_id] as const] : known.has(entry.manifest.plugin_id) ? [] : [[entry.manifest, entry.project_plugin_id] as const];
  });
  const shippedIds = new Set(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.plugin_id));
  const sources: ReadonlyArray<readonly [PluginManifest, string]> = [...shipped, ...effective.filter(manifest => !shippedIds.has(manifest.plugin_id)).map(manifest => [manifest, manifest.plugin_id] as const)];
  return sources.flatMap(([manifest, project_plugin_id]) => {
    const declared = manifest.onboarding?.takes.find(take => take.kind === kind);
    const action = declared && manifest.actions?.find(item => item.capability_id === declared.capability_id && item.version === declared.version);
    if (!action) return [];
    return [{ plugin_id: manifest.plugin_id, project_plugin_id, name: manifest.name, take: { ...action, provider_id: manifest.plugin_id } as ActionDefinition }];
  });
}
