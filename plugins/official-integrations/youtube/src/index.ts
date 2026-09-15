import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-youtube",
  packagePath: "plugins/official-integrations/youtube",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.youtube.v1", "signal-adapter.youtube.v1"],
} as const;

export const youtubeIntegrationManifest = {
  schema_version: 1,
  plugin_id: "io.molis.work.integration.youtube",
  version: "1.0.0",
  name: "YouTube Channel",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:youtube.com", required: true, reason: "读取公开 YouTube Channel Feed" },
  ],
  capabilities: {
    provides: ["connector.driver.youtube.v1", "signal.adapter.youtube.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.youtube"] },
} as const satisfies PluginManifest;

export function createYoutubeIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: youtubeIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:youtube.com");
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./channel.js";
