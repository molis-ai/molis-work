import {
  createGithubProvider,
  type GithubFetch,
} from "@molis-ai/molis-work-integration-github";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { resolveGithubToken } from "./connector-credentials.js";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGithubConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  token?: string;
  authRef?: string;
  allowFixture?: boolean;
  fetchImpl?: GithubFetch;
  now?: () => Date;
}): IntegrationProviderPort {
  return createGithubProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    resolveToken: opts?.authRef ? () => createFileSecretStore().get(opts.authRef!) : resolveGithubToken,
  });
}
