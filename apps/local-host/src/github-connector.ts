import {
  createGithubProvider,
  type GithubFetch,
} from "@molis-ai/molis-work-integration-github";

import { resolveApiConnection } from "./connector-access.js";
import { connectorFixtureAllowed } from "./connector-execution-mode.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";

export function createGithubConnector(opts?: {
  fixture?: IntegrationProviderItem[];
  token?: string;
  home?: string;
  connectionId?: string;
  allowFixture?: boolean;
  fetchImpl?: GithubFetch;
  now?: () => Date;
}): IntegrationProviderPort {
  const home = opts?.home ?? resolveMolisWorkHome();
  const id = opts?.connectionId;
  return createGithubProvider({
    ...opts,
    allowFixture: id ? false : opts?.allowFixture ?? connectorFixtureAllowed(),
    resolveToken: async control => {
      if (!id) return null;
      try { return (await resolveApiConnection(home, id, control, "github")).token; }
      catch { await control.beforeEffect(); control.current(); return null; }
    },
  });
}
