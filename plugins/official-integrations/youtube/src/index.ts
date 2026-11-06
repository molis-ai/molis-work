import { V_HOST_API, V_MANIFEST_SCHEMA, V_PACKAGE_PLUGINS_OFFICIAL_INTEGRATIONS_YOUTUBE_INDEX_YOUTUBEINTEGRATIONMANIFEST } from "./versions.generated.js";
import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const youtubeIntegrationManifest = {
  schema_version: V_MANIFEST_SCHEMA,
  plugin_id: "io.molis.work.integration.youtube",
  version: V_PACKAGE_PLUGINS_OFFICIAL_INTEGRATIONS_YOUTUBE_INDEX_YOUTUBEINTEGRATIONMANIFEST,
  name: "YouTube Channel",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: V_HOST_API,
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
