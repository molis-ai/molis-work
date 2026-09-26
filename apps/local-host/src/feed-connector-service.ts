import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createFileSecretStore, peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { FeedConnectorService } from "@molis-ai/molis-work-plugin-feed";
import { gmailInstallationSecretRefs, isGmailTokenRefs } from "@molis-ai/molis-work-integration-gmail";
import { GMAIL_DEFAULT_SCOPE, normalizeGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import { authRefFor, bindConnectorToken, connectorCredentialStatus, unbindConnectorToken } from "./connector-credentials.js";
import { CATALOG_CONNECTORS } from "@molis-ai/molis-work-integration-catalog";
import { completeGmailOAuthFlow, defaultGmailRedirectUri, gmailOAuthConfigured, startGmailOAuthFlow, storeGmailOAuthClient } from "./gmail-oauth.js";
import { pollGithubDeviceFlow, startGithubDeviceFlow, storeGithubClientId } from "./github-oauth.js";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { createLocalFeedConnectorSync } from "./feed-connector-sync.js";
import type { OfficialProviderFactory } from "./official-integrations.js";

export function createLocalFeedConnectorService(
  db: SqliteDatabase,
  boardId: string,
  providerFactory?: OfficialProviderFactory,
  _homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedConnectorService {
  const feed = createLocalFeedApplication(db, feedOptions);
  return new FeedConnectorService(feed, boardId, {
    credentialRef: authRefFor,
    credentialStatus: connectorCredentialStatus,
    listCatalogConnectors: () => CATALOG_CONNECTORS.map((spec) => ({
      connector_id: spec.id,
      title: spec.title,
      description: spec.inbound,
    })),
    authStatus() {
      let githubClientIdBound = false;
      try { githubClientIdBound = Boolean(peekSealedEntry("connector:github:client_id")); } catch { /* Preserve unavailable-store status. */ }
      return {
        github: connectorCredentialStatus("github"),
        gmail: connectorCredentialStatus("gmail"),
        github_client_id_configured: Boolean(readProductEnv("GITHUB_CLIENT_ID") || githubClientIdBound),
        gmail_oauth_configured: gmailOAuthConfigured(),
        gmail_redirect_uri: defaultGmailRedirectUri(),
      };
    },
    bindToken: bindConnectorToken,
    unbindToken: unbindConnectorToken,
    deleteGmailTokenRefs(value) {
      if (!isGmailTokenRefs(value)) return;
      const secrets = createFileSecretStore();
      for (const ref of Object.values(value)) secrets.delete(ref);
    },
    github: { storeClientId: storeGithubClientId, startDevice: startGithubDeviceFlow, pollDevice: pollGithubDeviceFlow },
    gmail: { defaultScope: GMAIL_DEFAULT_SCOPE, normalizeScope: normalizeGmailScope,
      installationSecretRefs: gmailInstallationSecretRefs, storeClient: storeGmailOAuthClient,
      startOAuth: startGmailOAuthFlow, completeOAuth: completeGmailOAuthFlow },
  }, createLocalFeedConnectorSync(db, boardId, providerFactory, feed));
}
