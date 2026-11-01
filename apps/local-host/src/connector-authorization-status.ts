import { createHash, randomUUID } from "node:crypto";
import { openConnectorsStore } from "./connectors-store.js";
import { defineErrorCodes, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { bindConnectorAuthorizationProtocol, clearConnectorAuthorizationPresentation, connectorAuthorizationInstallation, readConnectorAuthorizationCompletion } from "./connector-authorization-presentation.js";
import { invalidateConnectorRequests } from "./connector-lifecycle.js";
import type { LocalMcpSetup } from "./connector-local-mcp-plan.js";
import type { ManagedToolSource } from "./connector-tool-source.js";
import type { LocalMcpLaunch } from "./connector-local-mcp.js";

const setupErrors = defineErrorCodes("connector.setup", { foreign_request: "forbidden" });

type ConnectorAuthorizationState = "prepared" | "pending" | "connected" | "cancelled" | "failed" | "expired";
export interface ConnectorSetupPlan {
  service_id: string;
  method: "token" | "oauth" | "mcp" | "cli";
  display_name: string;
  connection_id?: string;
  expected_revision?: string;
  endpoint?: string;
  authentication?: "none" | "bearer" | "oauth";
  transport?: "http" | "sse" | "stdio";
  local_launch?: LocalMcpLaunch;
  local_setup?: LocalMcpSetup;
  cli_setup?: ManagedToolSource;
  installation?: { platform: string; architecture: string; directory: string; requires_credentials: boolean };
}
interface ConnectorSetupInitiator { actor_id: string; project_id: string | null; runtime_session_id?: string }
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
  for (const row of rows) { invalidateConnectorRequests(home, row.id); clearConnectorAuthorizationPresentation(home, row.id); }
}
export function finishConnectorAuthorization(home: string, state: string, status: "connected" | "cancelled" | "failed" | "expired", connectionId?: string) {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status=?, connection_id=COALESCE(?,connection_id) WHERE state_hash=? AND status='pending' AND expires_at>=? RETURNING id").all(status, connectionId ?? null, hash(state), Date.now())) as Array<{ id: string }>;
  for (const row of rows) {
    if (status !== "connected") invalidateConnectorRequests(home, row.id);
    clearConnectorAuthorizationPresentation(home, row.id, status === "failed");
  }
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
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE id=? AND (status IN ('prepared','pending') AND expires_at>=? OR status='failed' AND (json_extract(setup_json,'$.transport')='stdio' OR json_extract(setup_json,'$.cli_setup') IS NOT NULL))").run(id, Date.now()));
  let cleanup;
  if (connectorAuthorizationStatus(home, id)?.status === "cancelled") { invalidateConnectorRequests(home, id); cleanup = clearConnectorAuthorizationPresentation(home, id); }
  const result = connectorAuthorizationStatus(home, id);
  return result && { ...result, ...(cleanup ? { cleanup } : {}) };
}
/** Disconnect/remove withdraw every outstanding attempt for this exact connection, including consumed callbacks. */
export function cancelConnectorAuthorizationsForConnection(home: string, connectionId: string): void {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE connection_id=? AND (status IN ('prepared','pending') OR status='failed' AND (json_extract(setup_json,'$.transport')='stdio' OR json_extract(setup_json,'$.cli_setup') IS NOT NULL)) RETURNING id").all(connectionId)) as Array<{ id: string }>;
  for (const row of rows) { invalidateConnectorRequests(home, row.id); clearConnectorAuthorizationPresentation(home, row.id); }
}
/** Stopping one work withdraws only the unfinished requests it owns, never another session's independent request. */
export function cancelConnectorAuthorizationsForSession(home: string, sessionId: string, actorId: string): void {
  const rows = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='cancelled' WHERE json_extract(initiator_json,'$.runtime_session_id')=? AND json_extract(initiator_json,'$.actor_id')=? AND (status IN ('prepared','pending') OR status='failed' AND (json_extract(setup_json,'$.transport')='stdio' OR json_extract(setup_json,'$.cli_setup') IS NOT NULL)) RETURNING id")
    .all(sessionId, actorId)) as Array<{ id: string }>;
  for (const row of rows) { invalidateConnectorRequests(home, row.id); clearConnectorAuthorizationPresentation(home, row.id); }
}
export function pendingConnectorAuthorizationsForSession(home: string, sessionId: string, actorId: string) {
  return withAttempts(home, db => db.prepare("SELECT id FROM connector_authorization_results WHERE json_extract(initiator_json,'$.runtime_session_id')=? AND json_extract(initiator_json,'$.actor_id')=? AND status IN ('prepared','pending') AND expires_at>=?")
    .all(sessionId, actorId, Date.now())) as Array<{ id: string }>;
}
export function connectorAuthorizationStatus(home: string, id: string, now = Date.now()) {
  return withAttempts(home, db => {
    const row = db.prepare("SELECT id, connection_id, service_id, status, expires_at, setup_json, initiator_json FROM connector_authorization_results WHERE id=?").get(id) as
      { id: string; connection_id: string; service_id: string; status: ConnectorAuthorizationState; expires_at: number; setup_json: string | null; initiator_json: string | null } | undefined;
    if (!row) return null;
    const { setup_json, initiator_json, ...view } = row;
    const intent = initiator_json ? JSON.parse(initiator_json) as { intent_revision?: string; commit_held?: boolean } : {};
    return { ...view, status: ["prepared", "pending"].includes(row.status) && now > row.expires_at ? "expired" as const : row.status,
      ...(connectorAuthorizationInstallation(home, id)?.ready ? { installation_ready: true } : {}),
      ...(readConnectorAuthorizationCompletion(home, id) ? { completion_ready: true } : {}),
      ...(intent.intent_revision ? { intent_revision: intent.intent_revision, commit_held: intent.commit_held === true } : {}),
      ...(setup_json ? { setup: JSON.parse(setup_json) as ConnectorSetupPlan } : {}) };
  });
}

/** Trusted request ownership for Host continuation checks; never protocol state or credential material. */
export function connectorAuthorizationInitiator(home: string, id: string): ConnectorSetupInitiator | undefined {
  return withAttempts(home, db => {
    const row = db.prepare("SELECT initiator_json FROM connector_authorization_results WHERE id=?").get(id) as { initiator_json: string | null } | undefined;
    return row?.initiator_json ? JSON.parse(row.initiator_json) as ConnectorSetupInitiator : undefined;
  });
}

/**
 * An action that continues, reads or cancels a prepared request (`connectors.setup.execute`, `connectors.local.execute`,
 * `connectors.cli.install`, `connectors.cli.connect`, `connectors.authorization.read`, `connectors.authorization.cancel`) uses it only for
 * whoever prepared it: the same person, project and session. The person's own page continues, reads and cancels any request of theirs
 * through its own routes and is not asked.
 */
export function requireConnectorInitiator(home: string, id: string, caller: Pick<ActionCallContext, "actor_id" | "project_id" | "runtime_session_id">): void {
  const initiator = connectorAuthorizationInitiator(home, id);
  if (!initiator || initiator.actor_id !== caller.actor_id || initiator.project_id !== caller.project_id || initiator.runtime_session_id !== caller.runtime_session_id)
    throw setupErrors.foreign_request("只能读取、取消或继续当前用户、项目和会话自己准备的接入");
}

/** Protocol recovery inspects active requests; this does not expose their one-use state. */
export function pendingConnectorAuthorizations(home: string, serviceId?: string) {
  return withAttempts(home, db => (serviceId === undefined
    ? db.prepare("SELECT id FROM connector_authorization_results WHERE status='pending' AND expires_at>=?").all(Date.now())
    : db.prepare("SELECT id FROM connector_authorization_results WHERE service_id=? AND status='pending' AND expires_at>=?").all(serviceId, Date.now())) as Array<{ id: string }>);
}

/** The same authority record starts before the person enters a credential or an OAuth session exists. */
export function prepareConnectorAuthorization(home: string, setup: ConnectorSetupPlan, initiator: ConnectorSetupInitiator, now = Date.now()) {
  const id = withAttempts(home, db => {
    const plan = JSON.stringify(setup), owner = JSON.stringify(initiator);
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = db.prepare("SELECT id FROM connector_authorization_results WHERE setup_json=? AND json_extract(initiator_json,'$.actor_id')=? AND json_extract(initiator_json,'$.project_id') IS ? AND json_extract(initiator_json,'$.runtime_session_id') IS ? AND status IN ('prepared','pending') AND expires_at>=? ORDER BY expires_at DESC LIMIT 1")
        .get(plan, initiator.actor_id, initiator.project_id, initiator.runtime_session_id ?? null, now) as { id: string } | undefined;
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
  if (JSON.stringify(request.setup.cli_setup) !== JSON.stringify(actual.cli_setup)) throw connectorErrors["connector.connection.invalid"]("CLI 安装方案与准备时不同，请重新准备接入");
  if (JSON.stringify(request.setup.local_setup) !== JSON.stringify(actual.local_setup)) throw connectorErrors["connector.connection.invalid"]("本地安装方案与准备时不同，请重新准备接入");
  if (JSON.stringify(request.setup.local_launch) !== JSON.stringify(actual.local_launch)) throw connectorErrors["connector.connection.invalid"]("本地启动方案与准备时不同，请重新准备接入");
  for (const key of ["service_id", "method", "connection_id", "endpoint", "authentication", "transport"] as const) {
    const expected = request.setup[key];
    if (expected !== actual[key] && (expected !== undefined || ["service_id", "method", "connection_id"].includes(key))) {
      throw connectorErrors["connector.connection.invalid"]("提交的服务、方式或连接与本次方案不同，请重新准备接入");
    }
  }
  return request.setup;
}

/** The callback knows only its one-use state. It cannot select a work or bypass that request's current intent. */
export function connectorAuthorizationForState(home: string, state: string) {
  const row = withAttempts(home, db => db.prepare("SELECT id FROM connector_authorization_results WHERE state_hash=?").get(hash(state))) as { id: string } | undefined;
  return row ? connectorAuthorizationStatus(home, row.id) : null;
}

/** A new human message parks commits, without deciding whether the connection is still wanted. */
export function holdConnectorAuthorizationsForSession(home: string, sessionId: string, actorId: string, revision: string): void {
  withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET initiator_json=json_set(initiator_json,'$.intent_revision',?,'$.commit_held',json('true')) WHERE json_extract(initiator_json,'$.runtime_session_id')=? AND json_extract(initiator_json,'$.actor_id')=? AND status IN ('prepared','pending')")
    .run(revision, sessionId, actorId));
}

export function releaseConnectorAuthorizationIntent(home: string, id: string, revision: string): void {
  const changed = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET initiator_json=json_set(initiator_json,'$.commit_held',json('false')) WHERE id=? AND json_extract(initiator_json,'$.intent_revision')=? AND status IN ('prepared','pending') AND expires_at>=?")
    .run(id, revision, Date.now()));
  if (!changed.changes) throw connectorErrors["connector.connection.invalid"]("接入要求已变化或请求已结束，请读取最新状态");
}

/** An explicit retry reopens only a failed local verification, preserving its exact prepared plan. */
export function retryLocalConnectorAuthorization(home: string, id: string): void {
  if (!connectorAuthorizationInstallation(home, id)?.ready) throw connectorErrors["connector.connection.invalid"]("没有可继续验证的安装，请重新准备接入");
  const changed = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='prepared', expires_at=? WHERE id=? AND status='failed' AND (json_extract(setup_json,'$.transport')='stdio' OR json_extract(setup_json,'$.cli_setup') IS NOT NULL)").run(Date.now() + 24 * 60 * 60_000, id));
  if (!changed.changes) throw connectorErrors["connector.connection.invalid"]("接入请求已变化，请读取当前状态");
}

/** An installed CLI waits on the same request for person login; installation alone is not an account connection. */
export function prepareInstalledCliAuthorization(home: string, state: string): void {
  const row = withAttempts(home, db => db.prepare("UPDATE connector_authorization_results SET status='prepared', expires_at=? WHERE state_hash=? AND status='pending' AND expires_at>=? AND json_extract(setup_json,'$.cli_setup') IS NOT NULL RETURNING id")
    .get(Date.now() + 24 * 60 * 60_000, hash(state), Date.now())) as { id: string } | undefined;
  if (!row) throw connectorErrors["connector.connection.invalid"]("CLI 接入已取消或过期，请查看当前状态");
  clearConnectorAuthorizationPresentation(home, row.id, true);
}
