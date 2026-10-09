import { withConnectorConnections } from "./connector-connection-store.js";

/**
 * The token the market pulse's GitHub source sends: the secret of the earliest-added GitHub account connection in
 * Settings that is not disconnected (a token or OAuth account; a CLI login stores no secret), read at each request so a
 * renewed or disconnected token applies to the next pulse. The rule is the one the pulse note and docs/platform/NETWORK.md
 * state. It never moves on to a later account: when that one's secret cannot be read, or no account is connected, the
 * pulse searches GitHub anonymously (a lower rate limit). The process environment is never consulted, and a registry
 * that cannot be read means anonymous, not a failed pulse.
 */
export function alchemistPulseGithubToken(home: string): string | undefined {
  try {
    return withConnectorConnections(home, store => {
      const account = store.list("github").find(connection => !connection.disconnected_at && (connection.auth_method === "token" || connection.auth_method === "oauth"));
      if (!account) return undefined;
      try { return store.resolveToken(account.connection_id, "github"); } catch { return undefined; }
    });
  } catch { return undefined; }
}
