import {
  createGithubProvider,
  type GithubFetch,
} from "@molis-ai/molis-work-integration-github";

import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { resolveGithubToken } from "./connector-credentials.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGithubConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  token?: string;
  allowFixture?: boolean;
  fetchImpl?: GithubFetch;
  now?: () => Date;
}): IntegrationProviderPort {
  return createGithubProvider({
    ...opts,
    allowFixture: opts?.allowFixture ?? connectorFixtureAllowed(),
    resolveToken: resolveGithubToken,
  });
}
