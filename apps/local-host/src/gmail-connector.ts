import { createGmailProvider, type GmailFetch } from "@molis-ai/molis-work-integration-gmail";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ApiOAuthError } from "./connector-api-oauth.js";
import { resolveApiConnection } from "./connector-access.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGmailConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  allowFixture?: boolean;
  home?: string;
  connectionId?: string;
  accessToken?: string;
  scope?: string;
  fetchImpl?: GmailFetch;
  getNowMs?: () => number;
}): IntegrationProviderPort {
  const home = opts?.home ?? resolveMolisWorkHome();
  const id = opts?.connectionId;
  const request = opts?.fetchImpl ?? globalThis.fetch;
  return createGmailProvider({
    ...opts,
    allowFixture: id ? false : opts?.allowFixture ?? connectorFixtureAllowed(),
    ...(id ? { fetchForCall: control => async (url: string, init?: RequestInit) => {
      const response = await request(url, init);
      if (response.status !== 401) return response;
      const access = await resolveApiConnection(home, id, control, "gmail", "if_available");
      await control.beforeEffect(); control.current();
      if (!access) return response;
      return request(url, { ...init, signal: AbortSignal.any([control.signal, ...(init?.signal ? [init.signal] : [])]), headers: { ...init?.headers, Authorization: `Bearer ${access.token}` } });
    } } : {}),
    resolveUsableToken: async ({ control }) => {
      if (!id) return { ok: false, status: "none" };
      try { return { ok: true, accessToken: (await resolveApiConnection(home, id, control, "gmail")).token }; }
      catch (error) {
        await control.beforeEffect(); control.current();
        return error instanceof ApiOAuthError
          ? { ok: false, status: "needs_auth", message: "请重新授权所选 Gmail 连接", action: "在 Connectors 中重新授权" }
          : { ok: false, status: "none" };
      }
    },
  });
}
