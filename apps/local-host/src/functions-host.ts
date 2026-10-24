import { createPrologueTypeSafeProvider } from "./typesafe-prologue.js";
import { selectedTypeSafeConnection, typeSafeCredential, typeSafeConfiguration } from "./typesafe-connection.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { HOME_DOCK_SCENE_ID, type FunctionSceneMap, type FunctionsSettingsStatus } from "@molis-ai/molis-work-contracts/modules/functions";
import { SUBJECT_OFFERS_INPUT_TYPE, SUBJECT_OFFERS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  createFunctionsService,
  type BuiltinRuleSubject,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";

/**
 * The Home dock rule recommends the offers the shipped plugins declare for its subject: each of its options is an offer id, and
 * its target is the key of the declaration that answers to that id, which names the declaring plugin as the key's owner. An id that
 * two declarations answer to is left unmapped rather than guessed. The other built-in rules keep their option keys as they are.
 */
function declaredRuleTargets(rule: BuiltinRuleSubject): FunctionSceneMap {
  if (rule.scene_id !== HOME_DOCK_SCENE_ID) return {};
  const targets = new Map<string, Set<string>>();
  for (const { manifest } of BUILTIN_PLUGIN_CATALOG) {
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

export function functionsConnectionStatus(home: string, options: FunctionsHostOptions = {}): FunctionsSettingsStatus {
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
    builtinSceneMap: declaredRuleTargets,
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
