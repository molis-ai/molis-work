import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-rss",
  packagePath: "plugins/official-integrations/rss",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.rss.v1", "signal-adapter.rss.v1"],
} as const;

export const rssIntegrationManifest = {
  schema_version: 1,
  plugin_id: "io.molis.work.integration.rss",
  version: "1.0.0",
  name: "RSS",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:rss", required: true, reason: "读取用户选择的公开 RSS 地址" },
  ],
  capabilities: {
    provides: ["connector.driver.rss.v1", "signal.adapter.rss.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.rss"] },
} as const satisfies PluginManifest;

export function createRssIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: rssIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:rss");
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./http-state.js";

export * from "./catalog.js";
export * from "./custom-rss.js";
export * from "./feed-body.js";
