import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-web-query",
  packagePath: "plugins/official-integrations/web-query",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.web-query.v1", "signal-adapter.web-query.v1"],
} as const;

export const webQueryIntegrationManifest = {
  schema_version: 1,
  plugin_id: "io.molis.work.integration.web-query",
  version: "1.0.0",
  name: "Web Query",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:web-query", required: true, reason: "执行用户配置的公开 Web Query" },
    { permission: "secret:web-query", required: false, reason: "使用用户选择的搜索 Provider credential reference" },
  ],
  capabilities: {
    provides: ["connector.driver.web-query.v1", "signal.adapter.web-query.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.web-query"] },
} as const satisfies PluginManifest;

export function createWebQueryIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: webQueryIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:web-query");
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
