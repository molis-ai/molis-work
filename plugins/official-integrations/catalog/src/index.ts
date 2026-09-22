import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
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

export const CATALOG_WHOAMI_BEHAVIOR_ID = "whoami";

export function catalogPublicBehaviorId(connectorId: string): string {
  return `${connectorId}.whoami`;
}

export function catalogIntegrationManifest(connectorId: string): PluginManifest {
  const spec = getCatalogSpec(connectorId);
  return {
    schema_version: 2,
    plugin_id: `io.molis.work.integration.${connectorId}`,
    version: "1.0.0",
    name: spec.title,
    kind: "integration",
    publisher: { publisher_id: "io.adeptify", signature: "adeptify-official-signature-v1" },
    host_api_version: 2,
    entrypoints: [{ deployment: "local", entrypoint: "./dist/index.js" }],
    permissions: [
      { permission: `network:${spec.permission_host}`, required: true, reason: `读取 ${spec.title} 身份与入站更新` },
      { permission: `secret:${connectorId}`, required: true, reason: `使用不可导出的 ${spec.title} credential reference` },
    ],
    capabilities: {
      provides: [`connector.driver.${connectorId}.v1`, `signal.adapter.${connectorId}.v1`],
      consumes: ["connector.host.v1", "listener.host.v1", "signals.command.v1"],
    },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [`settings.integration.${connectorId}`] },
    behaviors: [
      {
        behavior_id: CATALOG_WHOAMI_BEHAVIOR_ID,
        title: `查看当前 ${spec.title} 账号`,
        effect: "read",
        subject_kinds: ["mcp_invoke", "session"],
      },
    ],
  };
}

export function createCatalogIntegrationPlugin(input: {
  connectorId: string;
  provider: IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  const spec = getCatalogSpec(input.connectorId);
  return definePollingIntegrationPlugin({
    manifest: catalogIntegrationManifest(input.connectorId),
    createProvider(context) {
      context.requireGrant(`network:${spec.permission_host}`);
      context.requireGrant(`secret:${input.connectorId}`);
      return input.provider;
    },
    now: input.now,
  });
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { CATALOG_CONNECTORS, catalogConnectorIds, getCatalogSpec, isCatalogConnectorId } from "./catalog.js";
export { setupLinksFor } from "./setup-links.js";
export { catalogAccountPresentation, catalogWhoami, createCatalogProvider, type CatalogWhoamiResult } from "./provider.js";
export { CatalogLiveError } from "./http.js";
export type { CatalogFetch } from "./types.js";
export { readExternalDocument, ExternalDocumentImportError } from "./document-import.js";
export type { ExternalDocument, ExternalDocumentSource, ExternalDocumentImportErrorCode } from "./document-import.js";
