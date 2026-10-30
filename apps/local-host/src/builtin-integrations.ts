import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCatalogIntegrationPlugin, catalogConnectorIds } from "@molis-ai/molis-work-integration-catalog";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { createGmailIntegrationPlugin } from "@molis-ai/molis-work-integration-gmail";
import { IntegrationDeclarations } from "./integration-declarations.js";
import { IntegrationRegistry } from "./integration-registry.js";
import { defaultIntegrationProvider, type IntegrationProviderFactory } from "./integration-providers.js";
import { PLATFORM_CONNECTION_SERVICES } from "./platform-connection-services.js";

/** The integration plugins that ship with the Host: the one place they are listed. Everything downstream reads their declarations. */
export function builtinIntegrationDefinitions(providerFactory: IntegrationProviderFactory, now?: () => Date): PluginDefinition[] {
  return [
    createGithubIntegrationPlugin({ providerFor: binding => providerFactory("github", binding), now }),
    createGmailIntegrationPlugin({ providerFor: binding => providerFactory("gmail", binding), now }),
    ...catalogConnectorIds().map(connectorId => createCatalogIntegrationPlugin({
      connectorId, providerFor: binding => providerFactory(connectorId, binding), now })),
  ];
}

/** What a reader of the declarations may do: look, never declare. */
export type IntegrationDeclarationsView = Pick<IntegrationDeclarations, "connectionServices" | "hasSource" | "integration" | "listIntegrations" | "pluginName">;

let builtinDeclarations: IntegrationDeclarations | undefined;

/** The declarations of the built-in plugins and the platform's own services, read from Manifests only: nothing is started. */
export function builtinIntegrationDeclarations(): IntegrationDeclarationsView {
  if (!builtinDeclarations) {
    const declarations = new IntegrationDeclarations(PLATFORM_CONNECTION_SERVICES);
    for (const definition of builtinIntegrationDefinitions(defaultIntegrationProvider)) declarations.declare(definition.manifest);
    builtinDeclarations = declarations;
  }
  return builtinDeclarations;
}

const registries = new Map<string, Promise<IntegrationRegistry>>();

/**
 * The Home's registry, with the built-in integration plugins enabled: one per Home. A caller that brings its own provider factory
 * (a test) gets a registry of its own and shares nothing.
 */
export function homeIntegrationRegistry(home: string, providerFactory?: IntegrationProviderFactory, now?: () => Date): Promise<IntegrationRegistry> {
  const build = async () => {
    const registry = new IntegrationRegistry({ platform: PLATFORM_CONNECTION_SERVICES, now });
    for (const definition of builtinIntegrationDefinitions(providerFactory ?? defaultIntegrationProvider, now)) await registry.enable(definition);
    return registry;
  };
  if (providerFactory) return build();
  let registry = registries.get(home);
  if (!registry) { registry = build(); registries.set(home, registry); }
  return registry;
}
