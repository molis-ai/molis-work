import { intakeMaterial, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installedArtifacts } from "./artifact-type-registry.js";
import { shippedParts } from "./plugin-registry.js";

/** What onboarding hands a plugin (contract-design §2.5). */
export type OnboardingMaterialKind = "code_root" | "documents" | "drafts";

/** A plugin that declares it takes a kind of onboarding material (batch12-design §7.3), with the action that takes it. */
export interface OnboardingTaker {
  readonly plugin_id: string;
  /** The key the project's plugin list uses for it. */
  readonly project_plugin_id: string;
  /** The Manifest's name, as the plugin market lists it. */
  readonly name: string;
  /** Its own declared action, with its own permissions; the platform calls this one only. */
  readonly take: ActionDefinition;
  /** A `drafts` taker's two other actions, named by its intake: reading batches again and keeping the chosen drafts. */
  readonly drafts?: { readonly get: ActionDefinition; readonly keep: ActionDefinition };
}

/**
 * The plugins that take `kind` from onboarding, by their intakes that accept it and nothing else (contract-design §2.3): the plugins this build ships
 * (read from their installed Manifest when one is in effect, so an upgrade shows) and the plugins installed on this Host, as the
 * 成果库 reads its producers. A personal registration is still a project plugin (Pages and Todo are), so it is offered when it declares one.
 */
export function onboardingTakers(kind: OnboardingMaterialKind): OnboardingTaker[] {
  const effective = installedArtifacts.effective(), byId = new Map(effective.map(manifest => [manifest.plugin_id, manifest] as const)), known = installedArtifacts.known();
  const shipped = shippedParts().flatMap(entry => {
    const installed = byId.get(entry.manifest.plugin_id);
    return installed ? [[installed, entry.project_plugin_id] as const] : known.has(entry.manifest.plugin_id) ? [] : [[entry.manifest, entry.project_plugin_id] as const];
  });
  const shippedIds = new Set(shippedParts().map(entry => entry.manifest.plugin_id));
  const sources: ReadonlyArray<readonly [PluginManifest, string]> = [...shipped, ...effective.filter(manifest => !shippedIds.has(manifest.plugin_id)).map(manifest => [manifest, manifest.plugin_id] as const)];
  return sources.flatMap(([manifest, project_plugin_id]) => {
    const action = manifest.actions?.find(item => intakeMaterial(item.action.intake, kind));
    if (!action) return [];
    const own = (ref: { capability_id: string; version: number }) => {
      const found = manifest.actions?.find(item => item.capability_id === ref.capability_id && item.version === ref.version);
      return found && { ...found, provider_id: manifest.plugin_id } as ActionDefinition;
    };
    const material = intakeMaterial(action.action.intake, "drafts"), get = material && own(material.get), keep = material && own(material.keep);
    if (material && !(get && keep)) return [];
    return [{ plugin_id: manifest.plugin_id, project_plugin_id, name: manifest.name, take: { ...action, provider_id: manifest.plugin_id } as ActionDefinition,
      ...(get && keep ? { drafts: { get, keep } } : {}) }];
  });
}
