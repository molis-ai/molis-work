import { createGmailOAuth } from "@molis-ai/molis-work-integration-gmail";
import { createFileSecretStore, peekSealedEntry, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { oauthRefreshGuard } from "./connector-oauth-targets.js";

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
  startGmailOAuthFlow,
  completeGmailOAuthFlow,
} = gmailOAuth;
export function resolveUsableGmailAccessToken(input: Omit<Parameters<typeof gmailOAuth.resolveUsableGmailAccessToken>[0], "beforePersist">) {
  const id = /^connector-connection:([0-9a-f-]{36}):access$/u.exec(input.tokenRefs.access)?.[1];
  if (!id) throw new Error("Gmail 凭据不属于已登记的连接");
  return gmailOAuth.resolveUsableGmailAccessToken({ ...input, beforePersist: oauthRefreshGuard(resolveMolisWorkHome(), id) });
}
export type { GmailOAuthComplete } from "@molis-ai/molis-work-integration-gmail";
