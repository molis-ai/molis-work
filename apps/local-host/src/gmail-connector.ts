import { createGmailProvider, type GmailFetch } from "@molis-ai/molis-work-integration-gmail";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { createFileSecretStore, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { resolveApiOAuthToken } from "./connector-api-oauth.js";
import { REPLACED_OAUTH_NOTE, apiOAuthConnectionId, replacedOAuthAccessRef } from "./connector-oauth-shape.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGmailConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  allowFixture?: boolean;
  authRef?: string;
  accessToken?: string;
  scope?: string;
  fetchImpl?: GmailFetch;
  getNowMs?: () => number;
}): IntegrationProviderPort {
  const home = resolveMolisWorkHome();
  const oauthId = apiOAuthConnectionId(opts?.authRef);
  // The access token a connection of the shape the generic flow replaced left behind is never read (W5-11 §2.6, M4).
  const replaced = Boolean(opts?.authRef && replacedOAuthAccessRef(opts.authRef));
  const request = opts?.fetchImpl ?? globalThis.fetch;
  return createGmailProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    authRef: oauthId || replaced ? undefined : opts?.authRef,
    ...(oauthId ? { fetchForCall: control => async (url: string, init?: RequestInit) => {
      const response = await request(url, init);
      if (response.status !== 401) return response;
      const token = await resolveApiOAuthToken(home, oauthId, control, true);
      await control.beforeEffect(); control.current();
      return request(url, { ...init, signal: AbortSignal.any([control.signal, ...(init?.signal ? [init.signal] : [])]), headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
    } } : {}),
    resolveAuthRef(authRef) {
      return createFileSecretStore().get(authRef);
    },
    resolveUsableToken: oauthId ? async ({ control }) => {
      try { return { ok: true, accessToken: await resolveApiOAuthToken(home, oauthId, control) }; }
      catch { await control.beforeEffect(); control.current(); return { ok: false, status: "needs_auth", message: "请重新授权所选 Gmail 连接", action: "在 Connectors 中重新授权" }; }
    } : async () => replaced ? { ok: false, status: "needs_auth", message: REPLACED_OAUTH_NOTE, action: "新增 Gmail 连接" } : { ok: false, status: "none" },
  });
}
