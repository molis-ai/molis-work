import { createHash, randomUUID } from "node:crypto";
import { openConnectorsStore } from "./connectors-store.js";

export type ConnectorAuthorizationState = "pending" | "connected" | "cancelled" | "failed" | "expired";
const TTL = 10 * 60_000;
const hash = (state: string) => createHash("sha256").update(state).digest("hex");
function withAttempts<T>(home: string, run: (db: ReturnType<typeof openConnectorsStore>) => T): T {
  const db = openConnectorsStore(home);
  try { return run(db); } finally { db.close(); }
}
/** A read-only UI receipt, separate from the one-use OAuth state and credentials. */
export function beginConnectorAuthorization(home: string, state: string, connectionId: string, serviceId: string, now = Date.now()) {
  return withAttempts(home, db => {
    db.prepare("DELETE FROM connector_authorization_results WHERE expires_at < ?").run(now - TTL);
    const id = randomUUID();
    db.prepare("INSERT INTO connector_authorization_results VALUES (?, ?, ?, ?, 'pending', ?)").run(id, hash(state), connectionId, serviceId, now + TTL);
    return id;
  });
}
export function finishConnectorAuthorization(home: string, state: string, status: Exclude<ConnectorAuthorizationState, "pending" | "expired">) {
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status=? WHERE state_hash=? AND status='pending' AND expires_at>=?").run(status, hash(state), Date.now()));
}
export function connectorAuthorizationStatus(home: string, id: string, now = Date.now()) {
  return withAttempts(home, db => {
    const row = db.prepare("SELECT id, connection_id, service_id, status, expires_at FROM connector_authorization_results WHERE id=?").get(id) as
      { id: string; connection_id: string; service_id: string; status: ConnectorAuthorizationState; expires_at: number } | undefined;
    return row ? { ...row, status: row.status === "pending" && now > row.expires_at ? "expired" as const : row.status } : null;
  });
}
