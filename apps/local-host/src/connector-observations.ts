import { ConnectorObservationStore, type ConnectorCheckObservation } from "@molis-ai/molis-work-service-connector-host";
import { openConnectorsStore } from "./connectors-store.js";
import { withConnectorConnections } from "./connector-connection-store.js";

export function withConnectorObservations<T>(home: string, operation: (store: ConnectorObservationStore) => T): T {
  const db = openConnectorsStore(home);
  try { return operation(new ConnectorObservationStore(db)); } finally { db.close(); }
}

/** A check cannot make a changed or disabled connection look current. The caller separately rechecks its authority. */
export function rememberConnectorCheck(home: string, id: string, value: ConnectorCheckObservation): boolean {
  const current = withConnectorConnections(home, store => store.get(id));
  if (!current?.enabled || current.disconnected_at || current.updated_at !== value.revision) return false;
  withConnectorObservations(home, store => store.check(id, value)); return true;
}

/**
 * A connection just committed from an account the service named moments before (an OAuth return reads the identity before it commits):
 * that read is the connection's first check, remembered with its time, so the page shows when it was last confirmed (ASC-45, PF-A04)
 * without sending another request.
 */
export function rememberVerifiedAccount(home: string, id: string, account: { login: string; account_id?: string }): void {
  const row = withConnectorConnections(home, store => store.get(id));
  if (row) rememberConnectorCheck(home, id, { at: new Date().toISOString(), revision: row.updated_at, outcome: "connected", authorization: "verified", account });
}
