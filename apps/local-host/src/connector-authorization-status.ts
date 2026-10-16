import { createHash, randomUUID } from "node:crypto";
import { openConnectorsStore } from "./connectors-store.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";

export type ConnectorAuthorizationState = "pending" | "connected" | "cancelled" | "failed" | "expired";
const TTL = 10 * 60_000;
const hash = (state: string) => createHash("sha256").update(state).digest("hex");
function withAttempts<T>(home: string, run: (db: ReturnType<typeof openConnectorsStore>) => T): T {
  const db = openConnectorsStore(home);
  try { return run(db); } finally { db.close(); }
}
/** Public status and cancellation authority, separate from the one-use OAuth state and credentials. */
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
/** Checked again at each staged credential write and immediately before activation. */
export function connectorAuthorizationPending(home: string, state: string, now = Date.now()): boolean {
  return withAttempts(home, db => Boolean(db.prepare("SELECT 1 FROM connector_authorization_results WHERE state_hash=? AND status='pending' AND expires_at>=?").get(hash(state), now)));
}
export function assertConnectorAuthorizationPending(home: string, state: string): void {
  if (!connectorAuthorizationPending(home, state)) throw connectorErrors["connector.connection.invalid"]("授权已取消、过期或结束，请重新连接");
}
/** A cancellation is accepted only while the owner has not committed. Never undo an established connection. */
export function cancelConnectorAuthorization(home: string, id: string) {
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE id=? AND status='pending' AND expires_at>=?").run(id, Date.now()));
  return connectorAuthorizationStatus(home, id);
}
/** Disconnect/remove withdraw every outstanding attempt for this exact connection, including consumed callbacks. */
export function cancelConnectorAuthorizationsForConnection(home: string, connectionId: string): void {
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE connection_id=? AND status='pending'").run(connectionId));
}
export function connectorAuthorizationStatus(home: string, id: string, now = Date.now()) {
  return withAttempts(home, db => {
    const row = db.prepare("SELECT id, connection_id, service_id, status, expires_at FROM connector_authorization_results WHERE id=?").get(id) as
      { id: string; connection_id: string; service_id: string; status: ConnectorAuthorizationState; expires_at: number } | undefined;
    return row ? { ...row, status: row.status === "pending" && now > row.expires_at ? "expired" as const : row.status } : null;
  });
}
