import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const youtubeIntegrationManifest = {
  schema_version: /* @version manifest.schema */ 1,
  plugin_id: "io.molis.work.integration.youtube",
  version: /* @version plugin.integration-youtube */ "1.0.0",
  name: "YouTube Channel",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: /* @version host.api */ 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:youtube.com", required: true, reason: "读取公开 YouTube Channel Feed" },
  ],
  capabilities: {
    provides: [/* @version type.connector.driver.youtube "connector.driver.youtube.v{version}" */ "connector.driver.youtube.v1", /* @version type.signal.adapter.youtube "signal.adapter.youtube.v{version}" */ "signal.adapter.youtube.v1"],
    consumes: [/* @version type.connector.host "connector.host.v{version}" */ "connector.host.v1", /* @version type.listener.host "listener.host.v{version}" */ "listener.host.v1", /* @version type.signals.command "signals.command.v{version}" */ "signals.command.v1"],
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

export * from "./channel.js";
