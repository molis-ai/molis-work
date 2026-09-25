import {
  createCatalogProvider,
  type CatalogFetch,
} from "@molis-ai/molis-work-integration-catalog";
import { resolveConnectorToken } from "./connector-credentials.js";
import { feishuCliFetch, feishuCliMarker } from "./feishu-cli.js";
import { resolveUsableNotionToken } from "./notion-oauth.js";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";

export function createCatalogConnector(opts: {
  connectorId: string;
  token?: string;
  credentialRef?: string;
  refreshRef?: string;
  fetchImpl?: CatalogFetch;
  now?: () => Date;
}) {
  return createCatalogProvider({
    connectorId: opts.connectorId,
    token: opts.token,
    fetchImpl: opts.fetchImpl ?? (opts.connectorId === "feishu" && !opts.credentialRef && resolveConnectorToken("feishu") === feishuCliMarker() ? feishuCliFetch : undefined),
    now: opts.now,
    resolveToken: opts.token ? undefined : opts.credentialRef
      ? opts.connectorId === "notion" && opts.refreshRef
        ? (forceRefresh?: boolean) => {
            const match = /^connector-connection:([0-9a-f-]+):access$/u.exec(opts.credentialRef!);
            return match ? resolveUsableNotionToken(forceRefresh, undefined, match[1]) : resolveUsableNotionToken(forceRefresh);
          }
        : () => createFileSecretStore().get(opts.credentialRef!)
      : opts.connectorId === "notion"
        ? (forceRefresh?: boolean) => resolveUsableNotionToken(forceRefresh)
        : () => resolveConnectorToken(opts.connectorId),
  });
}
