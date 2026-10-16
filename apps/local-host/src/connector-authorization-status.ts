import { createHash, randomUUID } from "node:crypto";
import { openConnectorsStore } from "./connectors-store.js";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { bindConnectorAuthorizationProtocol, clearConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";

export type ConnectorAuthorizationState = "prepared" | "pending" | "connected" | "cancelled" | "failed" | "expired";
export interface ConnectorSetupPlan {
  service_id: string;
  method: "token" | "oauth" | "mcp" | "cli";
  display_name: string;
  connection_id?: string;
  expected_revision?: string;
  endpoint?: string;
  authentication?: "none" | "bearer" | "oauth";
  transport?: "http" | "sse";
}
export interface ConnectorSetupInitiator { actor_id: string; project_id: string | null; runtime_session_id?: string }
const TTL = 10 * 60_000;
const hash = (state: string) => createHash("sha256").update(state).digest("hex");
function withAttempts<T>(home: string, run: (db: ReturnType<typeof openConnectorsStore>) => T): T {
  const db = openConnectorsStore(home);
  try { return run(db); } finally { db.close(); }
}
/** Public status and cancellation authority, separate from the one-use OAuth state and credentials. */
export function beginConnectorAuthorization(home: string, state: string, connectionId: string, serviceId: string, now = Date.now(), preparedId?: string) {
  expireConnectorAuthorizations(home, now);
  const id = withAttempts(home, db => {
    const expired = db.prepare("DELETE FROM connector_authorization_results WHERE setup_json IS NULL AND expires_at < ? RETURNING id").all(now - TTL) as Array<{ id: string }>;
    for (const row of expired) clearConnectorAuthorizationPresentation(home, row.id);
    if (preparedId) {
      const updated = db.prepare("UPDATE connector_authorization_results SET state_hash=?, connection_id=?, status='pending', expires_at=? WHERE id=? AND service_id=? AND status='prepared' AND expires_at>=?")
        .run(hash(state), connectionId, now + TTL, preparedId, serviceId, now);
      if (!updated.changes) throw connectorErrors["connector.connection.invalid"]("接入请求已开始、取消或过期，请查看当前状态");
      return preparedId;
    }
    const id = randomUUID();
    db.prepare("INSERT INTO connector_authorization_results (id,state_hash,connection_id,service_id,status,expires_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(id, hash(state), connectionId, serviceId, now + TTL);
    return id;
  });
  bindConnectorAuthorizationProtocol(home, id, state, serviceId);
  return id;
}
/** Uses the existing protocol timer; terminal conversation receipts outlive their one-use credentials. */
export function expireConnectorAuthorizations(home: string, now = Date.now()): void {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='expired' WHERE status IN ('prepared','pending') AND expires_at<? RETURNING id").all(now)) as Array<{ id: string }>;
  for (const row of rows) clearConnectorAuthorizationPresentation(home, row.id);
}
export function finishConnectorAuthorization(home: string, state: string, status: "connected" | "cancelled" | "failed" | "expired", connectionId?: string) {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status=?, connection_id=COALESCE(?,connection_id) WHERE state_hash=? AND status='pending' AND expires_at>=? RETURNING id").all(status, connectionId ?? null, hash(state), Date.now())) as Array<{ id: string }>;
  for (const row of rows) clearConnectorAuthorizationPresentation(home, row.id);
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
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE id=? AND status IN ('prepared','pending') AND expires_at>=?").run(id, Date.now()));
  if (connectorAuthorizationStatus(home, id)?.status === "cancelled") clearConnectorAuthorizationPresentation(home, id);
  return connectorAuthorizationStatus(home, id);
}
/** Disconnect/remove withdraw every outstanding attempt for this exact connection, including consumed callbacks. */
export function cancelConnectorAuthorizationsForConnection(home: string, connectionId: string): void {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE connection_id=? AND status IN ('prepared','pending') RETURNING id").all(connectionId)) as Array<{ id: string }>;
  for (const row of rows) clearConnectorAuthorizationPresentation(home, row.id);
}
export function connectorAuthorizationStatus(home: string, id: string, now = Date.now()) {
  return withAttempts(home, db => {
    const row = db.prepare("SELECT id, connection_id, service_id, status, expires_at, setup_json FROM connector_authorization_results WHERE id=?").get(id) as
      { id: string; connection_id: string; service_id: string; status: ConnectorAuthorizationState; expires_at: number; setup_json: string | null } | undefined;
    if (!row) return null;
    const { setup_json, ...view } = row;
    return { ...view, status: ["prepared", "pending"].includes(row.status) && now > row.expires_at ? "expired" as const : row.status,
      ...(setup_json ? { setup: JSON.parse(setup_json) as ConnectorSetupPlan } : {}) };
  });
}

/** Protocol recovery inspects active requests; this does not expose their one-use state. */
export function pendingConnectorAuthorizations(home: string, serviceId: string) {
  return withAttempts(home, db => db.prepare("SELECT id FROM connector_authorization_results WHERE service_id=? AND status='pending' AND expires_at>=?")
    .all(serviceId, Date.now()) as Array<{ id: string }>);
}

/** The same authority record starts before the person enters a credential or an OAuth session exists. */
export function prepareConnectorAuthorization(home: string, setup: ConnectorSetupPlan, initiator: ConnectorSetupInitiator, now = Date.now()) {
  const id = withAttempts(home, db => {
    const plan = JSON.stringify(setup), owner = JSON.stringify(initiator);
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = db.prepare("SELECT id FROM connector_authorization_results WHERE setup_json=? AND initiator_json=? AND status IN ('prepared','pending') AND expires_at>=? ORDER BY expires_at DESC LIMIT 1")
        .get(plan, owner, now) as { id: string } | undefined;
      const key = previous?.id ?? randomUUID();
      if (!previous) db.prepare("INSERT INTO connector_authorization_results (id,state_hash,connection_id,service_id,status,expires_at,setup_json,initiator_json) VALUES (?, ?, ?, ?, 'prepared', ?, ?, ?)")
        .run(key, hash(randomUUID()), setup.connection_id ?? "", setup.service_id, now + 24 * 60 * 60_000, plan, owner);
      db.exec("COMMIT"); return key;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
  return connectorAuthorizationStatus(home, id, now)!;
}

/** Reopening is safe; starting the protocol must still claim this prepared record exactly once. */
export function assertConnectorSetup(home: string, id: string, actual: Pick<ConnectorSetupPlan, "service_id" | "method"> & Partial<ConnectorSetupPlan>) {
  const request = connectorAuthorizationStatus(home, id);
  if (!request?.setup || request.status !== "prepared") throw connectorErrors["connector.connection.invalid"]("接入请求已开始、取消或过期，请查看当前状态");
  for (const key of ["service_id", "method", "connection_id", "endpoint", "authentication", "transport"] as const) {
    const expected = request.setup[key];
    if (expected !== actual[key] && (expected !== undefined || ["service_id", "method", "connection_id"].includes(key))) {
      throw connectorErrors["connector.connection.invalid"]("提交的服务、方式或连接与本次方案不同，请重新准备接入");
    }
  }
  return request.setup;
}
