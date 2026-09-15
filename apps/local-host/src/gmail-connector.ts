import {
  createGmailProvider,
  type GmailFetch,
  type GmailTokenRefs,
} from "@molis-ai/molis-work-integration-gmail";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { createFileSecretStore, readProductEnv } from "@molis-ai/molis-work-storage";
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
  return createGmailProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    authRef: opts?.authRef ?? readProductEnv("GMAIL_AUTH_REF"),
    resolveAuthRef(authRef) {
      return createFileSecretStore().get(authRef);
    },
    resolveUsableToken: resolveUsableGmailAccessToken,
  });
}
