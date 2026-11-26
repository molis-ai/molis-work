import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { createGithubIntegrationPlugin } from "./index.js";
import { createGithubProvider, githubWhoami } from "./provider.js";
import { readResearchRepository } from "./repository-read.js";
import { GITHUB_MARK } from "./mark.js";

/** What GitHub declares the Host does for it (D3 A): its notifications source, reading its account, and a published research library at a pinned revision. */
export const drivers: IntegrationDrivers = Object.freeze({
  order: 20,
  integrations: ({ provider, now }) => [createGithubIntegrationPlugin({ now, providerFor: provider("github", account => createGithubProvider({
    allowFixture: false,
    resolveToken: async control => {
      const credential = await account.credential(control);
      return credential.ok ? credential.token : null;
    },
  })) })],
  accounts: { github: {
    check: "source",
    identity: async ({ token, fetch }) => {
      const result = await githubWhoami({ token, fetchImpl: fetch });
      return result.ok || result.failure !== "needs_auth" ? result : { ...result, message: "这个账号需要重新授权" };
    },
    source: ({ token, fetch }) => createGithubProvider({ token, fetchImpl: fetch, allowFixture: false }),
  } },
  marks: { github: GITHUB_MARK },
  repository: { read: readResearchRepository },
} satisfies IntegrationDrivers);
