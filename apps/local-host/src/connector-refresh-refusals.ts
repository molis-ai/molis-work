import { resolve } from "node:path";
import type { ConnectorConnectionRecord, ConnectorConnectionState } from "@molis-ai/molis-work-contracts/services/connector-host";

// Connections whose token endpoint refused a refresh (S-70 provisional; slice s57-connections-extension X3, hub ruling 2026-10-24). The
// mark is not a stored fact: it is what the token endpoint's answer says, held in this Host process only. It is tied to the
// connection's revision, so reconnecting (which changes `updated_at`) clears it, a refresh that succeeds clears it, and a restart
// forgets it: the next request tries one refresh again and marks the connection only if that is refused too.

const refused = new Map<string, string>();
const key = (home: string, connection_id: string) => `${resolve(home)}:${connection_id}`;

/** The token endpoint said no: OAuth `invalid_grant` or `invalid_client`, or HTTP 400 or 401. A network error, a timeout or a 5xx is not this. */
export function tokenEndpointRefused(status: number | undefined, error?: unknown): boolean {
  return status === 400 || status === 401 || error === "invalid_grant" || error === "invalid_client";
}

export function markRefreshRefused(home: string, connection: Pick<ConnectorConnectionRecord, "connection_id" | "updated_at">): void {
  refused.set(key(home, connection.connection_id), connection.updated_at);
}

export function clearRefreshRefused(home: string, connection_id: string): void {
  refused.delete(key(home, connection_id));
}

/** Whether this revision of the connection had its refresh refused; a mark left from an earlier revision is dropped. */
export function refreshRefused(home: string, connection: Pick<ConnectorConnectionRecord, "connection_id" | "updated_at">): boolean {
  const marked = refused.get(key(home, connection.connection_id));
  if (marked === undefined) return false;
  if (marked === connection.updated_at) return true;
  refused.delete(key(home, connection.connection_id));
  return false;
}

/** The state to show for a connection: one whose refresh was refused needs the person to reconnect it. */
export function shownState(home: string, connection: Pick<ConnectorConnectionRecord, "connection_id" | "updated_at">, state: ConnectorConnectionState): ConnectorConnectionState {
  return state === "connected" && refreshRefused(home, connection) ? "reauth_required" : state;
}
