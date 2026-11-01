import { createPrologueTypeSafeProvider } from "./typesafe-prologue.js";
import { selectedTypeSafeConnection, typeSafeCredential, typeSafeConfiguration } from "./typesafe-connection.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { JudgmentRuleSceneMap, JudgmentRuleSettingsStatus } from "@molis-ai/molis-work-contracts/modules/functions";
import { SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE, type ActionProvider, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  admitDeclaredRulesIn,
  createFunctionsService,
  type DeclaredRuleSubject,
  type DeclaredSceneRule,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-judgment-rules";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";

/**
 * A rule whose scene recommends the offers plugins declare (`recommendation_source: "subject-offers"`) has an offer id for each of its
 * options, and its target is the key of the declaration that answers to that id, which names the declaring plugin as the key's owner.
 * An id that two declarations answer to is left unmapped rather than guessed. Any other rule keeps its option keys as they are.
 */
function declaredRuleTargets(rule: DeclaredRuleSubject): JudgmentRuleSceneMap {
  if (rule.recommendation_source !== "subject-offers") return {};
  const targets = new Map<string, Set<string>>();
  for (const { manifest } of PLATFORM_PLUGIN_REGISTRATIONS) {
    for (const definition of manifest.actions ?? []) {
      const { action } = definition;
      if (action.input_type !== SUBJECT_OFFERS_INPUT_TYPE || action.output_type !== SUBJECT_OFFERS_OUTPUT_TYPE) continue;
      const source = { capability_id: definition.capability_id, version: definition.version, provider_id: manifest.plugin_id };
      for (const choice of action.subject_offer_choices ?? []) {
        if (!rule.option_keys.includes(choice.offer_id) || !(choice.subject_kinds ?? action.subject_kinds).some(kind => rule.subject_kinds.includes(kind))) continue;
        targets.set(choice.offer_id, (targets.get(choice.offer_id) ?? new Set()).add(subjectOfferChoiceKey(source, choice)));
      }
    }
  }
  return Object.fromEntries([...targets].flatMap(([offerId, keys]) => keys.size === 1 ? [[offerId, [...keys][0]!]] : []));
}

/** Who a provider's declared rules are recorded under: the plugin, whichever installation registered it; the Host's own provider for a scene the Host declares. */
export const ruleDeclarer = (provider: ActionProvider): string => provider.plugin_id ?? provider.provider_id;

const declaredRules = (provider: ActionProvider, scenes: readonly ActionSceneDefinition[]): DeclaredSceneRule[] => scenes.flatMap(scene => scene.default_rule
  ? [{ declarer: ruleDeclarer(provider), scene_id: scene.scene_id, ...(scene.recommendation_source ? { recommendation_source: scene.recommendation_source } : {}), rule: scene.default_rule }] : []);

/**
 * Refuses a provider whose scenes declare a rule key another plugin already declared, before it is registered and before anything is
 * written. Scenes without a rule do not touch the library, and a Home without one has nothing declared yet.
 */
export function admitSceneRules(homeDirectory: string, provider: ActionProvider, scenes: readonly ActionSceneDefinition[]): void {
  const rules = declaredRules(provider, scenes);
  if (rules.length) admitDeclaredRulesIn(homeDirectory, rules);
}

/**
 * Writes the rules the scenes just registered declare for themselves, built in or installed alike, each once into the Home's library.
 * Scenes without a rule do not open the library.
 */
export function seedSceneRules(homeDirectory: string, provider: ActionProvider, scenes: readonly ActionSceneDefinition[], options: FunctionsHostOptions = {}): void {
  const rules = declaredRules(provider, scenes);
  if (rules.length) withFunctionsService(homeDirectory, service => service.seedDeclaredRules(rules, declaredRuleTargets), options);
}

export interface FunctionsHostOptions {
  /** A test's own key; otherwise the key is the TypeSafe connection bound for Functions. */
  readonly credential?: () => string | null;
  readonly provider?: TypeSafeProvider;
  readonly env?: NodeJS.Dict<string>;
}

/** Discovery inspects configuration without unlocking the user's Keychain. Execution resolves the secret. */
export function functionsCredentialConfigured(home: string, options: FunctionsHostOptions = {}): boolean {
  if ((options.env ?? process.env).TYPESAFE_API_KEY?.trim()) return true;
  if (options.credential) return !!options.credential()?.trim();
  const selected = selectedTypeSafeConnection(home);
  const ref = selected ? withConnectorConnections(home, store => {
    const connection = store.get(selected.connection_id);
    return connection && connection.service_id === "typesafe" && connection.enabled && !connection.disconnected_at ? connection.credential_ref : null;
  }) : null;
  return !!ref && runWithMolisWorkHome(home, () => peekSealedEntry(ref) !== null);
}

/** Test/development overrides do not use the saved account binding. */
export function functionsConnectionId(home: string, options: FunctionsHostOptions): string | null {
  return (options.env ?? process.env).TYPESAFE_API_KEY?.trim() || options.credential ? null : selectedTypeSafeConnection(home)?.connection_id ?? null;
}

export function functionsConnectionStatus(home: string, options: FunctionsHostOptions = {}): JudgmentRuleSettingsStatus {
  const configured = functionsCredentialConfigured(home, options);
  return { has_credential: configured, source: (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : configured ? "ui" : "none" };
}

function functionsCredential(home: string, options: FunctionsHostOptions): () => string | null {
  return options.credential ?? (() => typeSafeCredential(home));
}

/** A service and its database connection, owned and closed by the calling Host resource. */
export function openFunctionsService(homeDirectory: string, options: FunctionsHostOptions = {}) {
  const service = createFunctionsService({
    home: homeDirectory,
    credential: functionsCredential(homeDirectory, options),
    env: options.env ?? process.env,
    provider: options.provider ?? createPrologueTypeSafeProvider(homeDirectory, {
      resolveCredential: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() || functionsCredential(homeDirectory, options)()?.trim() || null,
      configuration: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : options.credential ? "custom" : typeSafeConfiguration(homeDirectory),
    }),
  });
  let closed = false;
  return { service, close() { if (!closed) { service.close(); closed = true; } } };
}

export function withFunctionsService<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => T,
  options: FunctionsHostOptions = {},
): T {
  const resource = openFunctionsService(homeDirectory, options);
  try { return run(resource.service); }
  finally { resource.close(); }
}

export async function withFunctionsServiceAsync<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => Promise<T>,
  options: FunctionsHostOptions = {},
): Promise<T> {
  const resource = openFunctionsService(homeDirectory, options);
  try { return await run(resource.service); }
  finally { resource.close(); }
}

export function parseSceneFunctionKey(body: Readonly<Record<string, unknown>>): string | null | undefined {
  if (!("function_key" in body)) return undefined;
  const value = body.function_key;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
