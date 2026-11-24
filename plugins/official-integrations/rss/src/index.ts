import { existsSync, readFileSync } from "node:fs";
import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { readRssHttpState } from "./http-state.js";
import type { SourcePresentation, SourcePresentationInput } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

export function rssSourcePresentation({ cursor }: SourcePresentationInput): SourcePresentation {
  const state = readRssHttpState(cursor);
  return { conditional_request: state.etag ? "etag" : state.last_modified ? "last-modified" : state.last_success_at ? "unvalidated" : "not-fetched", home_url: state.home_url ?? null };
}

export const rssIntegrationManifest = {
  schema_version: /* @version manifest.schema */ 1,
  plugin_id: "io.molis.work.integration.rss",
  version: /* @version plugin.integration-rss */ "1.0.0",
  name: "RSS",
  name_text: { key: "rss.directory.name" },
  summary: "读取你订阅的公开 RSS 与 Atom 源更新。",
  summary_text: { key: "rss.directory.summary" },
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: /* @version host.api */ 1,
  source_presentations: ["rss-http"],
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:rss", required: true, reason: "读取你选择的公开 RSS 订阅地址" },
  ],
  capabilities: {
    provides: [/* @version type.connector.driver.rss "connector.driver.rss.v{version}" */ "connector.driver.rss.v1", /* @version type.signal.adapter.rss "signal.adapter.rss.v{version}" */ "signal.adapter.rss.v1"],
    consumes: [/* @version type.connector.host "connector.host.v{version}" */ "connector.host.v1", /* @version type.listener.host "listener.host.v{version}" */ "listener.host.v1", /* @version type.signals.command "signals.command.v{version}" */ "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.rss"], locales: { default: "zh", available: ["zh", "en", "ja"] } },
} as const satisfies PluginManifest;

export function createRssIntegrationPlugin(input: {
  provider?: IntegrationProviderPort;
  now?: () => Date;
}) {
  const definition: PluginDefinition = definePollingIntegrationPlugin({
    manifest: rssIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:rss");
      if (!input.provider) throw pluginErrors.integration_unavailable("当前 RSS 实例没有绑定拉取提供器");
      return input.provider;
    },
    presentSource: (_id, request) => rssSourcePresentation(request),
    now: input.now,
  });
  return {
    ...definition,
    connectionText: {
      readLocale(path: string) {
        const url = new URL("../" + path, import.meta.url);
        return existsSync(url) ? readFileSync(url, "utf8") : null;
      },
      guides: {},
    },
  };
}

export * from "./http-state.js";

export * from "./catalog.js";
export * from "./custom-rss.js";
export * from "./feed-body.js";

export { createRssExactRouteResolver, type RssExactSourceDefinitions } from "./exact-source-routes.js";
