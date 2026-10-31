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

/*
 * How each kind of built-in integration turns a source's binding into a provider that holds the source's credential references: the
 * Host's last per-kind credential wiring for them. Every account source reads through its own connection; a source without one has no
 * account to read. These go away when integration plugins fetch through `services.connections` (PG-045), which is a piece of its own
 * after the GitHub device flow joins the declared OAuth flow (T-066).
 */
const githubProvider = (binding: IntegrationBinding): IntegrationProviderPort => createGithubConnector({ allowFixture: false,
  ...(binding.connection_id && binding.credential_ref ? { authRef: binding.credential_ref } : {}),
});

const gmailProvider = (binding: IntegrationBinding): IntegrationProviderPort => createGmailConnector({
  allowFixture: false,
  scope: normalizeGmailScope(binding.config.scope),
  ...(binding.connection_id && binding.credential_ref ? { authRef: binding.credential_ref } : {}),
});

const catalogProvider = (connectorId: string, binding: IntegrationBinding): IntegrationProviderPort =>
  createCatalogConnector({ connectorId, ...(binding.connection_id !== null ? { connectionId: binding.connection_id } : {}) });

/**
 * The integration plugins that ship with the Host: the one place they are listed, and the one place each is given the provider of its
 * own kind. Everything downstream reads their declarations. A caller that brings its own `override` (a test) gets its provider for every
 * integration instead, asked by the integration's id.
 */
export function builtinIntegrationDefinitions(override?: IntegrationProviderFactory, now?: () => Date): PluginDefinition[] {
  const providerFor = (integrationId: string, own: (binding: IntegrationBinding) => IntegrationProviderPort) =>
    (binding: IntegrationBinding): IntegrationProviderPort => override ? override(integrationId, binding) : own(binding);
  return [
    createGithubIntegrationPlugin({ providerFor: providerFor("github", githubProvider), now }),
    createGmailIntegrationPlugin({ providerFor: providerFor("gmail", gmailProvider), now }),
    ...catalogConnectorIds().map(connectorId => createCatalogIntegrationPlugin({
      connectorId, providerFor: providerFor(connectorId, binding => catalogProvider(connectorId, binding)), now })),
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
    for (const definition of builtinIntegrationDefinitions(providerFactory, now)) await registry.enable(definition);
    return registry;
  };
  if (providerFactory) return build();
  let registry = registries.get(home);
  if (!registry) { registry = build(); registries.set(home, registry); }
  return registry;
}
