import { createCatalogProvider, type CatalogFetch } from "@molis-ai/molis-work-integration-catalog";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { apiOAuthConnectionId, apiOAuthContext } from "./connector-api-oauth.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";

/** A catalog connector reads through its source's connection; without one it has no account to read. */
export function createCatalogConnector(opts: {
  connectorId: string;
  connectionId?: string;
  token?: string;
  fetchImpl?: CatalogFetch;
  now?: () => Date;
}) {
  const home = resolveMolisWorkHome();
  const id = opts.connectionId;
  const oauthId = id ? apiOAuthConnectionId(withConnectorConnections(home, store => store.get(id))?.credential_ref ?? undefined) : undefined;
  return createCatalogProvider({
    connectorId: opts.connectorId,
    token: opts.token,
    fetchImpl: opts.fetchImpl,
    now: opts.now,
    authExtras: oauthId ? () => apiOAuthContext(home, oauthId) : undefined,
    resolveToken: opts.token || !id ? undefined : async (forceRefresh?: boolean) => {
      // A connection that cannot be read reports as no account; the source's connection check names why.
      try { return (await resolveApiConnection(home, id, opts.connectorId, forceRefresh)).token; } catch { return null; }
    },
  });
}
