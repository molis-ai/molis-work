import { createPrologueTypeSafeProvider } from "./typesafe-prologue.js";
import { selectedTypeSafeConnection, typeSafeCredential, typeSafeConfiguration } from "./typesafe-connection.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { createLazyFileSecretStore, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import {
  FUNCTIONS_CREDENTIAL_REF,
  HOME_DOCK_SCENE_ID,
  type FunctionsSettingsStatus,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  createFunctionsService,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";

// Historical aliases are translated to the original native Inbox owner, never
// whichever installed plugin happens to declare an identical offer_id today.
const legacyHomeChoices = Object.fromEntries(["inbox.done", "inbox.dismiss"].map(offer_id => [offer_id,
  subjectOfferChoiceKey({ capability_id: "inbox.actions.prepare", version: 1, provider_id: "io.molis.work.inbox" },
    { offer_id, title: offer_id, action: { capability_id: "inbox.entry.status", version: 1 } }),
]));

export interface FunctionsHostOptions {
  readonly secrets?: FunctionsSecretPort;
  readonly provider?: TypeSafeProvider;
  readonly env?: NodeJS.Dict<string>;
}

/** Discovery inspects configuration without unlocking the user's Keychain. Execution resolves the secret. */
export function functionsCredentialConfigured(home: string, options: FunctionsHostOptions = {}): boolean {
  if ((options.env ?? process.env).TYPESAFE_API_KEY?.trim()) return true;
  if (options.secrets) return !!options.secrets.get(FUNCTIONS_CREDENTIAL_REF)?.trim();
  const selected = selectedTypeSafeConnection(home, "functions");
  const ref = selected ? withConnectorConnections(home, store => {
    const connection = store.get(selected.connection_id);
    return connection && connection.service_id === "typesafe" && !connection.disconnected_at ? connection.credential_ref : null;
  }) : FUNCTIONS_CREDENTIAL_REF;
  return !!ref && runWithMolisWorkHome(home, () => peekSealedEntry(ref) !== null);
}

export function functionsConnectionStatus(home: string, options: FunctionsHostOptions = {}): FunctionsSettingsStatus {
  const configured = functionsCredentialConfigured(home, options);
  return { has_credential: configured, source: (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : configured ? "ui" : "none" };
}

function functionsSecrets(home: string, options: FunctionsHostOptions): FunctionsSecretPort {
  if (options.secrets) return options.secrets;
  const base = createLazyFileSecretStore(home);
  return { get: ref => ref === FUNCTIONS_CREDENTIAL_REF ? typeSafeCredential(home, "functions") : base.get(ref),
    put: (ref, value) => base.put(ref, value), delete: ref => base.delete(ref) };
}

export function withFunctionsService<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => T,
  options: FunctionsHostOptions = {},
): T {
  const store = openFunctionsStore(homeDirectory);
  try {
    store.migrateSceneReferences(HOME_DOCK_SCENE_ID, legacyHomeChoices);
    return run(createFunctionsService({
      store,
      secrets: functionsSecrets(homeDirectory, options),
      env: options.env ?? process.env,
      provider: options.provider ?? createPrologueTypeSafeProvider(homeDirectory, {
        resolveCredential: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() || functionsSecrets(homeDirectory, options).get(FUNCTIONS_CREDENTIAL_REF)?.trim() || null,
        configuration: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : options.secrets ? "custom" : typeSafeConfiguration(homeDirectory, "functions"),
      }),
    }));
  } finally {
    store.close();
  }
}

export async function withFunctionsServiceAsync<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => Promise<T>,
  options: FunctionsHostOptions = {},
): Promise<T> {
  const store = openFunctionsStore(homeDirectory);
  try {
    store.migrateSceneReferences(HOME_DOCK_SCENE_ID, legacyHomeChoices);
    return await run(createFunctionsService({
      store,
      secrets: functionsSecrets(homeDirectory, options),
      env: options.env ?? process.env,
      provider: options.provider ?? createPrologueTypeSafeProvider(homeDirectory, {
        resolveCredential: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() || functionsSecrets(homeDirectory, options).get(FUNCTIONS_CREDENTIAL_REF)?.trim() || null,
        configuration: () => (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : options.secrets ? "custom" : typeSafeConfiguration(homeDirectory, "functions"),
      }),
    }));
  } finally {
    store.close();
  }
}

export function parseSceneFunctionKey(body: Readonly<Record<string, unknown>>): string | null | undefined {
  if (!("function_key" in body)) return undefined;
  const value = body.function_key;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
