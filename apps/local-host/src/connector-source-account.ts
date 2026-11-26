import type { ConnectorSourceAccount } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { apiOAuthConnectionId, apiOAuthContext, ApiOAuthError } from "./connector-api-oauth.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { resolveConfiguredHome } from "./product-home.js";

/**
 * The account an integration's source reads, over the connection its binding names: the Host resolves and refreshes the credential, and
 * a source bound to no connection has no account. A connection that cannot be read reports as no account; the source's connection check
 * names why.
 */
export function connectorSourceAccount(service: string, connectionId: string | undefined, home = resolveConfiguredHome()): ConnectorSourceAccount {
  return {
    bound: connectionId !== undefined,
    async credential(control, forceRefresh = false) {
      if (!connectionId) return { ok: false, status: "none" };
      try { return { ok: true, token: (await resolveApiConnection(home, connectionId, control, service, forceRefresh)).token }; }
      catch (error) {
        await control.beforeEffect();
        control.current();
        return { ok: false, status: error instanceof ApiOAuthError ? "needs_auth" : "none" };
      }
    },
    async refreshed(control) {
      return connectionId ? (await resolveApiConnection(home, connectionId, control, service, "if_available"))?.token ?? null : null;
    },
    context() {
      const oauthId = connectionId && apiOAuthConnectionId(withConnectorConnections(home, store => store.get(connectionId), true)?.credential_ref ?? undefined);
      return oauthId ? apiOAuthContext(home, oauthId) : undefined;
    },
  };
}
