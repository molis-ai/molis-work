import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createCatalogIntegrationPlugin, catalogConnectorIds } from "@molis-ai/molis-work-integration-catalog";
import { createGithubIntegrationPlugin } from "@molis-ai/molis-work-integration-github";
import { createGmailIntegrationPlugin } from "@molis-ai/molis-work-integration-gmail";
import { createRssIntegrationPlugin } from "@molis-ai/molis-work-integration-rss";
import { normalizeGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import { createCatalogConnector } from "./catalog-connector.js";
import { createGithubConnector } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";
import { IntegrationDeclarations } from "./integration-declarations.js";
import { IntegrationRegistry, type BuiltinIntegrationDefinition } from "./integration-registry.js";
import { assertConnectorText, builtinConnectorText } from "./connector-words.js";
import type { IntegrationProviderFactory } from "./integration-providers.js";
import { PLATFORM_CONNECTION_SERVICES } from "./platform-connection-services.js";
import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";

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
export function builtinIntegrationDefinitions(override?: IntegrationProviderFactory, now?: () => Date, home?: string): BuiltinIntegrationDefinition[] {
  const providerFor = (integrationId: string, own: (binding: IntegrationBinding) => IntegrationProviderPort) =>
    (binding: IntegrationBinding): IntegrationProviderPort => override ? override(integrationId, binding) : own(binding);
  return [
    createRssIntegrationPlugin({ now }),
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
  let registry = registries.get(home);
  if (inLanguagePreview()) return registry ?? Promise.reject(languagePreviewUnavailable());
  if (providerFactory) return build();
  if (!registry) { registry = build(); registries.set(home, registry); }
  return registry;
}
