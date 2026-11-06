import { ConnectorObservationStore, type ConnectorCheckObservation } from "@molis-ai/molis-work-service-connector-host";
import { openConnectorsStore } from "./connectors-store.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { afterPassedCheck } from "./connector-failure-runs.js";
import { settleConnectionNotices } from "./assistant/assistant-connection-notices.js";

export function withConnectorObservations<T>(home: string, operation: (store: ConnectorObservationStore) => T): T {
  const db = openConnectorsStore(home);
  try { return operation(new ConnectorObservationStore(db)); } finally { db.close(); }
}

/** The code a connection's last check carries while the token endpoint has refused its refresh (S-70, `connector-refresh-refusals.ts`). */
export const REFRESH_REFUSED = "connector.refresh_refused";

/**
 * A check cannot make a changed or disabled connection look current. The caller separately rechecks its authority. Every entry that
 * writes a check comes through here, so S-70 holds in this one place: while this revision's last check is a refused refresh, no other
 * check is written over it (a read that still passes on the old access token, a check that failed for another reason); only a forced
 * refresh that went through clears it (`clearsRefreshRefusal`), and reconnecting changes the revision. A check that went through also ends
 * a run of `reauth` on the last call and settles that notice; a run of `denied` or `unavailable` only a call that goes through ends (ASC-58).
 */
export function rememberConnectorCheck(home: string, id: string, value: ConnectorCheckObservation, options: { clearsRefreshRefusal?: boolean } = {}): boolean {
  const current = withConnectorConnections(home, store => store.get(id));
  if (!current?.enabled || current.disconnected_at || current.updated_at !== value.revision) return false;
  const ended = withConnectorObservations(home, store => {
    const { check: last, call } = store.read(id);
    if (last?.code === REFRESH_REFUSED && last.revision === value.revision && value.code !== REFRESH_REFUSED && !options.clearsRefreshRefusal) return undefined;
    store.check(id, value);
    // A check that went through ends a run of `reauth` on the last call (ASC-58): the call stays, its run goes.
    if (value.outcome !== "connected" || !call?.failures || afterPassedCheck(call) === call) return false;
    store.call(id, afterPassedCheck(call)); return true;
  });
  if (ended === undefined) return false;
  if (ended) settleConnectionNotices(home, id);
  return true;
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
