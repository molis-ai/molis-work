import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  IntegrationBinding,
  PluginConnectionServiceDeclaration,
  PluginIntegrationDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
import { getCatalogSpec } from "./catalog.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-integration-catalog",
  packagePath: "plugins/official-integrations/catalog",
  kind: "integration-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["connector.catalog.v1", "signal-adapter.catalog.v1"],
} as const;

/** The document sources the 成果库 can import through a connected service, and the service each reads with. */
const DOCUMENT_SOURCES: Readonly<Record<string, string>> = { notion: "notion", feishu: "feishu", lark: "lark", "google-docs": "google-drive" };

/** The service this connector is, and the card shown for it where a person connects accounts. */
function catalogConnectionService(connectorId: string): PluginConnectionServiceDeclaration {
  const spec = getCatalogSpec(connectorId);
  const feed = spec.feed_available !== false;
  return {
    service_id: connectorId,
    // WeChat is Work WeChat here.
    title: connectorId === "wechat" ? "企业微信" : spec.title,
    group_id: spec.group_id,
    summary: spec.summary,
    auth_kind: connectorId === "loom" ? "none" : connectorId === "notion" ? "notion" : connectorId === "feishu" ? "feishu" : "token",
    // A connector with no token to paste (Loom) is reached through MCP only.
    auth: { methods: spec.token_label ? [{ kind: "token", label: spec.token_label, placeholder: spec.token_placeholder }] : [{ kind: "mcp" }] },
    auth_help: spec.auth_help,
    capabilities: [
      { label: spec.inbound, fulfillment: feed ? "live" : "unfulfilled" },
      { label: "在连接设置中检查当前账号", fulfillment: "live" },
    ],
    outbound_note: "连接设置可检查当前账号。Agent 可用能力以能力库为准。",
    setup_links: spec.setup_links,
  };
}

/** What the connector does with its service: pull a Feed source if it has one, and import the documents it can read. */
function catalogIntegrations(connectorId: string): PluginIntegrationDeclaration[] {
  const integrations: PluginIntegrationDeclaration[] = [];
  if (getCatalogSpec(connectorId).feed_available !== false) integrations.push({ integration_id: connectorId, kind: "source", service_id: connectorId });
  for (const [source, service] of Object.entries(DOCUMENT_SOURCES)) {
    if (service === connectorId) integrations.push({ integration_id: source === connectorId ? `${source}-documents` : source, kind: "document_import", service_id: connectorId, document_source: source });
  }
  return integrations;
}

export function catalogIntegrationManifest(connectorId: string): PluginManifest {
  const spec = getCatalogSpec(connectorId);
  const integrations = catalogIntegrations(connectorId);
  return {
    schema_version: 2,
    plugin_id: `io.molis.work.integration.${connectorId}`,
    // 1.1.0: the account check moved to the connector action `connectors.account.read`.
    // 1.2.0: declares its connection service and what it does with it (`connection_services`, `integrations`).
    version: "1.2.0",
    name: spec.title,
    kind: "integration",
    publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
    host_api_version: 2,
    entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
    permissions: [
      ...[spec.permission_host, ...(spec.additional_permission_hosts ?? [])].map(host => ({ permission: `network:${host}`, required: true, reason: `读取 ${spec.title} 身份与入站更新` })),
      { permission: `secret:${connectorId}`, required: true, reason: `使用不可导出的 ${spec.title} credential reference` },
    ],
    capabilities: {
      provides: [`connector.driver.${connectorId}.v1`, `signal.adapter.${connectorId}.v1`],
      consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
    },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [`settings.integration.${connectorId}`] },
    connection_services: [catalogConnectionService(connectorId)],
    ...(integrations.length > 0 ? { integrations } : {}),
  };
}

export function createCatalogIntegrationPlugin(input: {
  connectorId: string;
  /** The provider for one source's binding; the Host decides where the credential comes from. */
  providerFor(binding: IntegrationBinding): IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  const spec = getCatalogSpec(input.connectorId);
  return definePollingIntegrationPlugin({
    manifest: catalogIntegrationManifest(input.connectorId),
    createProvider(context, binding) {
      for (const host of [spec.permission_host, ...(spec.additional_permission_hosts ?? [])]) context.requireGrant(`network:${host}`);
      context.requireGrant(`secret:${input.connectorId}`);
      return input.providerFor(binding);
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { CATALOG_CONNECTORS, catalogConnectorIds, getCatalogSpec, isCatalogConnectorId } from "./catalog.js";
export { setupLinksFor } from "./setup-links.js";
export { officialMethodsFor, OFFICIAL_CONNECTOR_METHODS } from "./methods.js";
export { catalogAccountPresentation, catalogWhoami, createCatalogProvider, type CatalogWhoamiResult } from "./provider.js";
export { CatalogLiveError } from "./http.js";
export { catalogCloudOrigin } from "./targets.js";
export type { CatalogFetch } from "./types.js";
export { readExternalDocument, externalDocumentErrors } from "./document-import.js";
export type { ExternalDocument, ExternalDocumentSource, ExternalDocumentImportErrorCode } from "./document-import.js";
export { notionAuthorizationUrl, notionOAuthToken, NotionOAuthError, type NotionOAuthTokens } from "./notion-oauth.js";
