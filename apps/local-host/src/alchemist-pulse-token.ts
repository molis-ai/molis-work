import { withConnectorConnections } from "./connector-connection-store.js";

/**
 * The token the market pulse's GitHub source sends: the secret of a GitHub account connection from Settings (the
 * oldest one that is still connected), read at each request so a renewed or disconnected token applies to the next
 * pulse. Without a usable connection the pulse searches GitHub anonymously (a lower rate limit). The process
 * environment is never consulted, and a registry that cannot be read means anonymous, not a failed pulse.
 */
export function alchemistPulseGithubToken(home: string): string | undefined {
  try {
    return withConnectorConnections(home, store => {
      for (const connection of store.list("github")) {
        if (connection.disconnected_at || (connection.auth_method !== "token" && connection.auth_method !== "oauth")) continue;
        try { return store.resolveToken(connection.connection_id, "github"); } catch { /* try the next account */ }
      }
      return undefined;
    });
  } catch { return undefined; }
}
