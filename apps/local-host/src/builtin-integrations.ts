import type { IntegrationDriverDefinition } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { builtinIntegrationDrivers } from "./builtin-drivers.js";
import { connectorSourceAccount } from "./connector-source-account.js";
import { IntegrationDeclarations } from "./integration-declarations.js";
import { IntegrationRegistry } from "./integration-registry.js";
import { assertConnectorText, builtinConnectorText } from "./connector-words.js";
import type { IntegrationProviderFactory } from "./integration-providers.js";
import { PLATFORM_CONNECTION_SERVICES } from "./platform-connection-services.js";
import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";

/**
 * The integrations that ship with the Host, as their drivers declare them (D3 A): each source reads the connection its binding names, in
 * the registry's own Home. Everything downstream reads their declarations. A caller that brings its own `override` (a test) gets its
 * provider for every integration instead, asked by the integration's id.
 */
export function builtinIntegrationDefinitions(override?: IntegrationProviderFactory, now?: () => Date, home?: string): IntegrationDriverDefinition[] {
  return builtinIntegrationDrivers({
    provider: (integrationId, own) => binding => override ? override(integrationId, binding)
      : own(connectorSourceAccount(integrationId, binding.connection_id ?? undefined, home), binding),
    now,
  });
}

export { builtinCliDrivers, builtinCliReleaseHosts, builtinPublicFeedDriver, type CliDriver, type CliNativeDistribution, type CliReleasePort } from "./builtin-drivers.js";

/** What a reader of the declarations may do: look, never declare. */
export type IntegrationDeclarationsView = Pick<IntegrationDeclarations, "connectionServices" | "hasSource" | "integration" | "listIntegrations" | "pluginName">;

let builtinDeclarations: IntegrationDeclarations | undefined;

/** The declarations of the built-in plugins and the platform's own services, read from Manifests only: nothing is started. */
export function builtinIntegrationDeclarations(): IntegrationDeclarationsView {
  if (!builtinDeclarations) {
    const declarations = new IntegrationDeclarations(PLATFORM_CONNECTION_SERVICES);
    for (const { manifest, connectionText } of builtinIntegrationDefinitions()) {
      const source = builtinConnectorText(manifest, connectionText);
      assertConnectorText(manifest, source);
      declarations.declare(manifest, source);
    }
    builtinDeclarations = declarations;
  }
  return builtinDeclarations;
}

const registries = new Map<string, Promise<IntegrationRegistry>>();

export const existingIntegrationRegistry = (home: string): Promise<IntegrationRegistry> | undefined => registries.get(home);

/**
 * The Home's registry, with the built-in integration plugins enabled: one per Home. A caller that brings its own provider factory
 * (a test) gets a registry of its own and shares nothing.
 */
export function homeIntegrationRegistry(home: string, providerFactory?: IntegrationProviderFactory, now?: () => Date): Promise<IntegrationRegistry> {
  const build = async () => {
    const registry = new IntegrationRegistry({ platform: PLATFORM_CONNECTION_SERVICES });
    for (const definition of builtinIntegrationDefinitions(providerFactory, now, home)) await registry.enable(definition);
    return registry;
  };
  let registry = registries.get(home);
  if (inLanguagePreview()) return registry ?? Promise.reject(languagePreviewUnavailable());
  if (providerFactory) return build();
  if (!registry) { registry = build(); registries.set(home, registry); }
  return registry;
}
