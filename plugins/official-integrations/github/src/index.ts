import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export { createGithubProvider, githubWhoami, type GithubFetch, type GithubWhoamiResult } from "./provider.js";

export const GITHUB_WHOAMI_BEHAVIOR_ID = "whoami";
export const GITHUB_WHOAMI_PUBLIC_BEHAVIOR_ID = "github.whoami";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-github",
  packagePath: "plugins/official-integrations/github",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.github.v1", "signal-adapter.github.v1"],
} as const;

export const githubIntegrationManifest = {
  schema_version: 2,
  plugin_id: "io.molis.work.integration.github",
  version: "1.1.0",
  name: "GitHub",
  kind: "integration",
  publisher: {
    publisher_id: "io.adeptify",
    signature: "adeptify-official-signature-v1",
  },
  host_api_version: 2,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:github.com", required: true, reason: "读取 GitHub 身份与通知" },
    { permission: "secret:github", required: true, reason: "使用不可导出的 GitHub credential reference" },
  ],
  capabilities: {
    provides: ["connector.driver.github.v1", "signal.adapter.github.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.github"] },
  behaviors: [
    {
      behavior_id: GITHUB_WHOAMI_BEHAVIOR_ID,
      title: "查看当前 GitHub 账号",
      effect: "read",
      subject_kinds: ["mcp_invoke", "session"],
    },
  ],
} as const satisfies PluginManifest;

export function createGithubIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: githubIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:github.com");
      context.requireGrant("secret:github");
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./oauth.js";

export { githubAccountPresentation } from "./account-presentation.js";
