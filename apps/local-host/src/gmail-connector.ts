import {
  createGmailProvider,
  type GmailFetch,
  type GmailTokenRefs,
} from "@molis-ai/molis-work-integration-gmail";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { createFileSecretStore, readProductEnv, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { apiOAuthConnectionId, resolveApiOAuthToken } from "./connector-api-oauth.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGmailConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  allowFixture?: boolean;
  authRef?: string;
  accessToken?: string;
  tokenRefs?: GmailTokenRefs;
  scope?: string;
  fetchImpl?: GmailFetch;
  getNowMs?: () => number;
}): IntegrationProviderPort {
  const home = resolveMolisWorkHome();
  const oauthId = apiOAuthConnectionId(opts?.authRef ?? opts?.tokenRefs?.access);
  const request = opts?.fetchImpl ?? globalThis.fetch;
  return createGmailProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    authRef: oauthId ? undefined : opts?.authRef ?? readProductEnv("GMAIL_AUTH_REF"),
    ...(oauthId ? { fetchImpl: async (url: string, init?: RequestInit) => {
      const response = await request(url, init);
      if (response.status !== 401) return response;
      const token = await resolveApiOAuthToken(home, oauthId, true);
      return request(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
    } } : {}),
    resolveAuthRef(authRef) {
      return createFileSecretStore().get(authRef);
    },
    resolveUsableToken: oauthId ? async () => {
      try { return { ok: true, accessToken: await resolveApiOAuthToken(home, oauthId) }; }
      catch { return { ok: false, status: "needs_auth", message: "请重新授权所选 Gmail 连接", action: "在 Connectors 中重新授权" }; }
    } : resolveUsableGmailAccessToken,
  });
}
