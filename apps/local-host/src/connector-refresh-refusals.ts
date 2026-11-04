import type { ConnectorCheckObservation, ConnectorConnectionRecord, ConnectorConnectionState } from "@molis-ai/molis-work-contracts/services/connector-host";
import { replacedOAuthShape } from "./connector-oauth-shape.js";
import { rememberConnectorCheck, withConnectorObservations } from "./connector-observations.js";

// Connections whose token endpoint refused a refresh (S-70; slice s57-connections-extension X3, hub ruling 2026-10-24; kept across a restart
// since batch 13, ASC-49). The mark is the connection's last check, remembered like any other: `failed`, authorization `required`, code
// `connector.refresh_refused`. It is tied to the connection's revision, so reconnecting (which changes `updated_at`) leaves it behind, and a
// refresh that succeeds replaces it with a passing check. Until one of those, requests that carry the connection are refused before they
// are sent, and the token endpoint is not asked again, restart or not.

export const REFRESH_REFUSED = "connector.refresh_refused";

type Revisioned = Pick<ConnectorConnectionRecord, "connection_id" | "updated_at">;

/** The token endpoint said no: OAuth `invalid_grant` or `invalid_client`, or HTTP 400 or 401. A network error, a timeout or a 5xx is not this. */
export function tokenEndpointRefused(status: number | undefined, error?: unknown): boolean {
  return status === 400 || status === 401 || error === "invalid_grant" || error === "invalid_client";
}

export function markRefreshRefused(home: string, connection: Revisioned): void {
  rememberConnectorCheck(home, connection.connection_id, { at: new Date().toISOString(), revision: connection.updated_at, outcome: "failed",
    authorization: "required", code: REFRESH_REFUSED });
}

/** A forced refresh went through: if the connection was marked, its last check now says the account is authorized again. */
export function clearRefreshRefused(home: string, connection: Revisioned): void {
  if (!refreshRefused(home, connection)) return;
  rememberConnectorCheck(home, connection.connection_id, { at: new Date().toISOString(), revision: connection.updated_at, outcome: "connected",
    authorization: "verified" });
}

/** Whether this revision of the connection had its refresh refused. `check` is the connection's last check, when the caller already read it. */
export function refreshRefused(home: string, connection: Revisioned, check?: ConnectorCheckObservation | null): boolean {
  const last = check === undefined ? withConnectorObservations(home, store => store.read(connection.connection_id).check) : check;
  return last?.code === REFRESH_REFUSED && last.revision === connection.updated_at;
}

/**
 * The state to show for a connection: one whose refresh was refused needs the person to reconnect it, and so does an OAuth connection
 * of the shape the generic flow replaced (`replacedOAuthShape`), which is not read at all.
 */
export function shownState(home: string, connection: Pick<ConnectorConnectionRecord, "connection_id" | "updated_at" | "auth_method" | "service_id" | "credential_ref">,
  state: ConnectorConnectionState, check?: ConnectorCheckObservation | null): ConnectorConnectionState {
  return state === "connected" && (replacedOAuthShape(connection) || connection.auth_method === "oauth" && refreshRefused(home, connection, check)) ? "reauth_required" : state;
}
