import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export { createGithubProvider, githubWhoami, type GithubFetch, type GithubWhoamiResult } from "./provider.js";
export { readResearchLibrary, type ResearchLibraryEntry } from "./research-library.js";

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
  // 1.2.0: the account check moved to the connector action `connectors.account.read`.
  // 1.3.0: declares its connection service and its Feed source (`connection_services`, `integrations`).
  version: "1.3.0",
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
  connection_services: [{
    service_id: "github",
    title: "GitHub",
    group_id: "code",
    summary: "本机账号。Feed 拉未读通知，可在连接设置中检查账号。",
    auth_kind: "github",
    auth: { methods: [{ kind: "oauth" }] },
    capabilities: [
      { label: "Feed 拉未读通知", fulfillment: "live" },
      { label: "在连接设置中检查当前账号", fulfillment: "live" },
    ],
    outbound_note: "连接设置可检查当前 GitHub 账号。Agent 可用能力以能力库为准。",
    // The catalog package keeps the same links for its connection methods until those move into the plugins (W5-11).
    setup_links: [
      { label: "创建 Personal Access Token", url: "https://github.com/settings/tokens/new?scopes=notifications,read:user&description=Molis%20Work" },
      { label: "注册 OAuth App", url: "https://github.com/settings/applications/new" },
    ],
  }],
  integrations: [{ integration_id: "github", kind: "source", service_id: "github" }],
} as const satisfies PluginManifest;

export function createGithubIntegrationPlugin(input: {
  /** The provider for one source's binding; the Host decides where the credential comes from. */
  providerFor(binding: IntegrationBinding): IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: githubIntegrationManifest,
    createProvider(context, binding) {
      context.requireGrant("network:github.com");
      context.requireGrant("secret:github");
      return input.providerFor(binding);
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./oauth.js";

export { githubAccountPresentation } from "./account-presentation.js";
