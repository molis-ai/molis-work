import {
  createCatalogProvider,
  type CatalogFetch,
} from "@molis-ai/molis-work-integration-catalog";
import { resolveConnectorToken } from "./connector-credentials.js";

export function createCatalogConnector(opts: {
  connectorId: string;
  token?: string;
  fetchImpl?: CatalogFetch;
  now?: () => Date;
}) {
  return createCatalogProvider({
    connectorId: opts.connectorId,
    token: opts.token,
    fetchImpl: opts.fetchImpl,
    now: opts.now,
    resolveToken: opts.token ? undefined : () => resolveConnectorToken(opts.connectorId),
  });
}
