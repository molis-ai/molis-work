import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";

export {
  classifyGmailForbiddenPayload,
  createGmailProvider,
  resolveStaleHistoryRecovery,
  type GmailFetch,
  type GmailForbiddenDisposition,
  type GmailTokenRefs,
  type GmailUsableTokenResult,
} from "./provider.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-gmail",
  packagePath: "plugins/official-integrations/gmail",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.gmail.v1", "signal-adapter.gmail.v1"],
} as const;

export const gmailIntegrationManifest = {
  schema_version: 1,
  plugin_id: "io.molis.work.integration.gmail",
  version: "1.0.0",
  name: "Gmail",
  kind: "integration",
  publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
  host_api_version: 1,
  entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
  permissions: [
    { permission: "network:googleapis.com", required: true, reason: "读取 Gmail profile、history 和 message" },
    { permission: "secret:gmail", required: true, reason: "使用按账号隔离的 OAuth credential reference" },
  ],
  capabilities: {
    provides: ["connector.driver.gmail.v1", "signal.adapter.gmail.v1"],
    consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
  },
  artifacts: { produces: [], consumes: [] },
  ui: { contributions: ["settings.integration.gmail"] },
} as const satisfies PluginManifest;

export function createGmailIntegrationPlugin(input: {
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  return definePollingIntegrationPlugin({
    manifest: gmailIntegrationManifest,
    createProvider(context) {
      context.requireGrant("network:googleapis.com");
      context.requireGrant("secret:gmail");
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { createGmailOAuth, parseGmailOAuthCallbackInput } from "./oauth.js";
export { GMAIL_CLIENT_ID_REF, GMAIL_CLIENT_SECRET_REF, GMAIL_REFRESH_REF, GMAIL_TOKEN_EXPIRES_AT_REF, GMAIL_OAUTH_PENDING_REF, GMAIL_OAUTH_PENDING_TTL_MS, GMAIL_ACCESS_TOKEN_SKEW_MS, GMAIL_OAUTH_CALLBACK_PATH, GMAIL_OAUTH_DEFAULT_SCOPES, type GmailOAuthPorts, type GmailOAuthSecrets, type GmailOAuthStart, type GmailOAuthComplete, type GmailOAuthExchangeInput, type OAuthFetch } from "./oauth-types.js";

export * from "./installations.js";

export { gmailAccountPresentation } from "./account-presentation.js";
