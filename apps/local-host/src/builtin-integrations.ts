import type { IntegrationProviderPort, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createCatalogIntegrationPlugin, catalogConnectorIds } from "@molis-ai/molis-work-integration-catalog";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { createGmailIntegrationPlugin } from "@molis-ai/molis-work-integration-gmail";
import { normalizeGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import { createCatalogConnector } from "./catalog-connector.js";
import { createGithubConnector } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";
import { IntegrationDeclarations } from "./integration-declarations.js";
import { IntegrationRegistry } from "./integration-registry.js";
import type { IntegrationProviderFactory } from "./integration-providers.js";
import { PLATFORM_CONNECTION_SERVICES } from "./platform-connection-services.js";

/** Built-in source providers resolve the current bound connection in the registry's own Home. */
const githubProvider = (home: string | undefined, binding: IntegrationBinding): IntegrationProviderPort => createGithubConnector({
  home, connectionId: binding.connection_id ?? undefined, allowFixture: false,
});

const gmailProvider = (home: string | undefined, binding: IntegrationBinding): IntegrationProviderPort => createGmailConnector({
  home, connectionId: binding.connection_id ?? undefined, allowFixture: false,
  scope: normalizeGmailScope(binding.config.scope),
});

const catalogProvider = (home: string | undefined, connectorId: string, binding: IntegrationBinding): IntegrationProviderPort =>
  createCatalogConnector({ home, connectorId, connectionId: binding.connection_id ?? undefined });

/**
 * The integration plugins that ship with the Host: the one place they are listed, and the one place each is given the provider of its
 * own kind. Everything downstream reads their declarations. A caller that brings its own `override` (a test) gets its provider for every
 * integration instead, asked by the integration's id.
 */
export function builtinIntegrationDefinitions(override?: IntegrationProviderFactory, now?: () => Date, home?: string): PluginDefinition[] {
  const providerFor = (integrationId: string, own: (binding: IntegrationBinding) => IntegrationProviderPort) =>
    (binding: IntegrationBinding): IntegrationProviderPort => override ? override(integrationId, binding) : own(binding);
  return [
    createGithubIntegrationPlugin({ providerFor: providerFor("github", binding => githubProvider(home, binding)), now }),
    createGmailIntegrationPlugin({ providerFor: providerFor("gmail", binding => gmailProvider(home, binding)), now }),
    ...catalogConnectorIds().map(connectorId => createCatalogIntegrationPlugin({
      connectorId, providerFor: providerFor(connectorId, binding => catalogProvider(home, connectorId, binding)), now })),
  ];
}

/** What a reader of the declarations may do: look, never declare. */
export type IntegrationDeclarationsView = Pick<IntegrationDeclarations, "connectionServices" | "hasSource" | "integration" | "listIntegrations" | "pluginName">;

let builtinDeclarations: IntegrationDeclarations | undefined;

/** The declarations of the built-in plugins and the platform's own services, read from Manifests only: nothing is started. */
export function builtinIntegrationDeclarations(): IntegrationDeclarationsView {
  if (!builtinDeclarations) {
    const declarations = new IntegrationDeclarations(PLATFORM_CONNECTION_SERVICES);
    for (const definition of builtinIntegrationDefinitions()) declarations.declare(definition.manifest);
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
    for (const definition of builtinIntegrationDefinitions(providerFactory, now, home)) await registry.enable(definition);
    return registry;
  };
  if (providerFactory) return build();
  let registry = registries.get(home);
  if (!registry) { registry = build(); registries.set(home, registry); }
  return registry;
}
