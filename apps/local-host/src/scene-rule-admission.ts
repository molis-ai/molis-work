import { functionsErrors } from "@molis-ai/molis-work-module-functions";
import type { ActionProvider, ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { admitSceneRules, ruleDeclarer } from "./functions-host.js";
import { HOME_PROVIDER_ID, homeDockScene } from "./home-actions.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

let owners: ReadonlyMap<string, string> | undefined;

/**
 * The default-rule keys this build's own scenes declare, each with its owner: the shipped plugin, or the Host's home provider for the
 * scene the Host declares. Read from the declarations, never listed. These keys are reserved: only the owner declares one, and no
 * plugin that is not host-trusted can be installed declaring one (the Runtime's `reservedRuleKeys`).
 */
export function hostRuleKeyOwners(): ReadonlyMap<string, string> {
  owners ??= new Map([
    ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }) => (manifest.action_scenes ?? []).flatMap(scene => scene.default_rule ? [[scene.default_rule.function_key, manifest.plugin_id] as const] : [])),
    ...(homeDockScene.default_rule ? [[homeDockScene.default_rule.function_key, HOME_PROVIDER_ID] as const] : []),
  ]);
  return owners;
}

export const hostReservedRuleKeys = (): ReadonlySet<string> => new Set(hostRuleKeyOwners().keys());

/**
 * Registering a provider whose scenes declare default rules: refused when a key is a reserved one and the provider is not its owner,
 * or when another plugin already declared it. Throws before the provider is registered, so a refusal writes nothing.
 */
export function admitProviderRules(homeDirectory: string | undefined, provider: ActionProvider, scenes: readonly ActionSceneDefinition[] | undefined): void {
  if (!homeDirectory || !scenes?.some(scene => scene.default_rule)) return;
  const declarer = ruleDeclarer(provider);
  for (const { default_rule: rule } of scenes) {
    const owner = rule ? hostRuleKeyOwners().get(rule.function_key) : undefined;
    if (rule && owner !== undefined && owner !== declarer) throw functionsErrors.rule_key_taken(`默认规则 ${rule.function_key} 是 ${owner} 的，${declarer} 不能声明`);
  }
  admitSceneRules(homeDirectory, provider, scenes);
}
