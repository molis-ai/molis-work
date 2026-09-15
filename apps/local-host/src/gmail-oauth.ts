import { createGmailOAuth } from "@molis-ai/molis-work-integration-gmail";
import { createFileSecretStore, peekSealedEntry } from "@molis-ai/molis-work-storage";
import { GMAIL_AUTH_REF, bindConnectorToken, resolveGmailToken } from "./connector-credentials.js";

const gmailOAuth = createGmailOAuth({
  secrets: createFileSecretStore,
  hasSecret: (ref) => Boolean(peekSealedEntry(ref)),
  environment: () => process.env,
  legacyAuthRef: GMAIL_AUTH_REF,
  resolveLegacyToken: resolveGmailToken,
  bindLegacyToken: (value) => { bindConnectorToken("gmail", value); },
});

export const {
  defaultGmailRedirectUri, assertLoopbackGmailRedirectUri,
  publicGmailCallbackUri, assertAllowedGmailRedirectUri,
  resolveGmailClientId, resolveGmailClientSecret, storeGmailOAuthClient,
  gmailOAuthConfigured, validatePendingGmailOAuthSession,
  resolveUsableGmailAccessToken, startGmailOAuthFlow,
  completeGmailOAuthFlow, gmailAccessBound,
} = gmailOAuth;
export type { GmailOAuthComplete } from "@molis-ai/molis-work-integration-gmail";
