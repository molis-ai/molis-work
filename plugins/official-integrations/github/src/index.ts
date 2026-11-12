import { existsSync, readFileSync } from "node:fs";
import { connectionGuide, connectionLinks } from "./connection-guide.js";
import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
import { githubAccountPresentation } from "./account-presentation.js";

export { createGithubProvider, githubWhoami, type GithubFetch, type GithubWhoamiResult } from "./provider.js";
export { readResearchLibrary, type ResearchLibraryEntry } from "./research-library.js";

export const githubIntegrationManifest = {
  schema_version: /* @version manifest.schema */ 1,
  plugin_id: "io.molis.work.integration.github",
  // 1.2.0: the account check moved to the connector action `connectors.account.read`.
  // 1.3.0: declares its connection service and its Feed source (`connection_services`, `integrations`).
  // 1.4.0: declares its OAuth flow as data (W5-11).
  version: /* @version plugin.integration-github */ "1.5.0",
  name: "GitHub",
  kind: "integration",
  publisher: {
    publisher_id: "io.adeptify",
    signature: "adeptify-official-signature-v1",
  },
  host_api_version: /* @version host.api */ 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:github.com", required: true, reason: "读取 GitHub 身份与通知" },
    { permission: "secret:github", required: true, reason: "使用不可导出的 GitHub credential reference" },
  ],
  capabilities: {
    provides: [/* @version type.connector.driver.github "connector.driver.github.v{version}" */ "connector.driver.github.v1", /* @version type.signal.adapter.github "signal.adapter.github.v{version}" */ "signal.adapter.github.v1"],
    consumes: [/* @version type.connector.host "connector.host.v{version}" */ "connector.host.v1", /* @version type.listener.host "listener.host.v{version}" */ "listener.host.v1", /* @version type.signals.command "signals.command.v{version}" */ "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.github"], locales: { default: "zh", available: ["zh", "en"] } },
  connection_services: [{
    service_id: "github",
    title: "GitHub",
    group_id: "code",
    summary: { key: "github.connection.summary" },
    auth_kind: "oauth",
    // Two ways to sign in, side by side: the web flow for a client of the person's own, and the device flow for the product's (the person
    // types a code on GitHub's page). Both read the account the same way.
    auth: { methods: [{
      kind: "oauth", grant: "authorization_code", authorize_url: "https://github.com/login/oauth/authorize",
      token_url: "https://github.com/login/oauth/access_token", scopes: ["notifications", "read:user"], pkce: "S256",
      identity: { url: "{service}/user", account_id: [["identity:/id"]], label: ["identity:/login"] },
    }, {
      kind: "oauth", grant: "device", device_authorization_url: "https://github.com/login/device/code",
      token_url: "https://github.com/login/oauth/access_token", scopes: ["notifications", "read:user"], client_secret: "optional", client_auth: "post",
      identity: { url: "{service}/user", account_id: [["identity:/id"]], label: ["identity:/login"] },
    }, { kind: "mcp", endpoint: "https://api.githubcopilot.com/mcp/", auth: "either", registration: "manual" }] },
    capabilities: [
      { label: { key: "github.connection.inbound" }, fulfillment: "live" },
      { label: { key: "common.connector.check-current-account" }, fulfillment: "live" },
    ],
    outbound_note: { key: "github.connection.outbound" },
    setup_links: connectionLinks,
  }],
  integrations: [{ integration_id: "github", kind: "source", service_id: "github" }],
} as const satisfies PluginManifest;

export function createGithubIntegrationPlugin(input: {
  /** The provider for one source's binding; the Host decides where the credential comes from. */
  providerFor(binding: IntegrationBinding): IntegrationProviderPort;
  now?: () => Date;
}) {
  const definition: PluginDefinition = definePollingIntegrationPlugin({
    manifest: githubIntegrationManifest,
    createProvider(context, binding) {
      context.requireGrant("network:github.com");
      context.requireGrant("secret:github");
      return input.providerFor(binding);
    },
    presentAccount: (cursor, label) => githubAccountPresentation(cursor, label),
    now: input.now,
  });
  return { ...definition, connectionText: { readLocale(path: string) {
    const url = new URL("../" + path, import.meta.url);
    return existsSync(url) ? readFileSync(url, "utf8") : null;
  }, guides: { github: connectionGuide } } };
}
