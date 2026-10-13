import { createGmailOAuth } from "@molis-ai/molis-work-integration-gmail";
import { createFileSecretStore, peekSealedEntry } from "@molis-ai/molis-work-storage";

const gmailOAuth = createGmailOAuth({
  secrets: createFileSecretStore,
  hasSecret: (ref) => Boolean(peekSealedEntry(ref)),
  environment: () => process.env,
});

export const {
  defaultGmailRedirectUri, assertLoopbackGmailRedirectUri,
  publicGmailCallbackUri, assertAllowedGmailRedirectUri,
  resolveGmailClientId, resolveGmailClientSecret, storeGmailOAuthClient,
  gmailOAuthConfigured, cancelGmailOAuthFlow, validatePendingGmailOAuthSession,
  resolveUsableGmailAccessToken, startGmailOAuthFlow,
  completeGmailOAuthFlow,
} = gmailOAuth;
export type { GmailOAuthComplete } from "@molis-ai/molis-work-integration-gmail";
