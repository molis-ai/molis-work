import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { createGmailIntegrationPlugin, GMAIL_OAUTH_CALLBACK_ALIAS } from "./index.js";
import { createGmailProvider } from "./provider.js";
import { GMAIL_MAILBOX_DRIVER } from "./recent-mail.js";
import { normalizeGmailScope } from "./scope.js";
import { GMAIL_MARK } from "./mark.js";

/** What Gmail declares the Host does for it (D3 A): its inbox source, its account, the OAuth return address its client was registered under, and recent mail for onboarding. */
export const drivers: IntegrationDrivers = Object.freeze({
  order: 30,
  integrations: ({ provider, now }) => [createGmailIntegrationPlugin({ now, providerFor: provider("gmail", (account, binding) => {
    const request = globalThis.fetch;
    return createGmailProvider({
      allowFixture: false,
      scope: normalizeGmailScope(binding.config.scope),
      // A 401 is tried once more with a fresh token, within the call it answered.
      ...(account.bound ? { fetchForCall: control => async (url: string, init?: RequestInit) => {
        const response = await request(url, init);
        if (response.status !== 401) return response;
        const token = await account.refreshed(control);
        await control.beforeEffect();
        control.current();
        if (token === null) return response;
        return request(url, { ...init, signal: AbortSignal.any([control.signal, ...(init?.signal ? [init.signal] : [])]), headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
      } } : {}),
      resolveUsableToken: async ({ control }) => {
        const credential = await account.credential(control);
        if (credential.ok) return { ok: true, accessToken: credential.token };
        return credential.status === "needs_auth"
          ? { ok: false, status: "needs_auth", message: "请重新授权所选 Gmail 连接", action: "在「设置 › 服务连接」中重新授权" }
          : { ok: false, status: "none" };
      },
    });
  }) })],
  accounts: { gmail: { check: "source", source: ({ token, fetch }) => createGmailProvider({ accessToken: token, fetchImpl: fetch, allowFixture: false }) } },
  marks: { gmail: GMAIL_MARK },
  oauth_callback_aliases: [GMAIL_OAUTH_CALLBACK_ALIAS],
  mailbox: GMAIL_MAILBOX_DRIVER,
} satisfies IntegrationDrivers);
