import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export const webQueryIntegrationManifest = {
  schema_version: /* @version manifest.schema */ 1,
  plugin_id: "io.molis.work.integration.web-query",
  version: /* @version package.plugins/official-integrations/web-query/index.webQueryIntegrationManifest */ "1.0.0",
  name: "Web Query",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: /* @version host.api */ 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:web-query", required: true, reason: "执行用户配置的公开 Web Query" },
    { permission: "secret:web-query", required: false, reason: "使用用户选择的搜索 Provider credential reference" },
  ],
  capabilities: {
    provides: [/* @version type.connector.driver.web-query "connector.driver.web-query.v{version}" */ "connector.driver.web-query.v1", /* @version type.signal.adapter.web-query "signal.adapter.web-query.v{version}" */ "signal.adapter.web-query.v1"],
    consumes: [/* @version type.connector.host "connector.host.v{version}" */ "connector.host.v1", /* @version type.listener.host "listener.host.v{version}" */ "listener.host.v1", /* @version type.signals.command "signals.command.v{version}" */ "signals.command.v1"],
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
