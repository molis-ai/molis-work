import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { isGmailTokenRefs } from "@molis-ai/molis-work-integration-gmail";
import { normalizeGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import { createGithubConnector } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";
import { createCatalogConnector } from "./catalog-connector.js";

/** The provider for one source of an integration; the Host's connection layer decides where the credential comes from. */
export type IntegrationProviderFactory = (integrationId: string, binding: IntegrationBinding) => IntegrationProviderPort;

/**
 * The one transitional port: how a source's binding becomes a provider that holds its credential references. The three-way choice
 * below goes away when integration plugins fetch through `services.connections` (PG-045); until then it is the only place that names
 * which integration reads its credential how. Every account source reads through its own connection; a source without one has no
 * account to read.
 */
export const defaultIntegrationProvider: IntegrationProviderFactory = (integrationId, binding) => {
  if (integrationId === "github") {
    return createGithubConnector({ allowFixture: false,
      ...(binding.connection_id && binding.credential_ref ? { authRef: binding.credential_ref } : {}),
    });
  }
  if (integrationId === "gmail") {
    const tokenRefs = binding.config.token_refs;
    return createGmailConnector({
      allowFixture: false,
      scope: normalizeGmailScope(binding.config.scope),
      ...(binding.connection_id && isGmailTokenRefs(tokenRefs) ? { tokenRefs } : {}),
      ...(binding.connection_id && binding.credential_ref && !isGmailTokenRefs(tokenRefs) ? { authRef: binding.credential_ref } : {}),
    });
  }
  return createCatalogConnector({ connectorId: integrationId, ...(binding.connection_id !== null ? { connectionId: binding.connection_id } : {}) });
};
