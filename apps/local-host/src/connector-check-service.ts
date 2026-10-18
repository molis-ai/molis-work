import { withConnectorConnections } from "./connector-connection-store.js";
import { inspectMcpConnection } from "./connector-mcp.js";
import { inspectApiConnection } from "./connector-access.js";
import { inspectCliConnection } from "./connector-cli.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { rememberConnectorCheck } from "./connector-observations.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import type { StoredMcpConfiguration } from "./connector-mcp-configuration.js";

export interface ConnectorCheckControl { signal?: AbortSignal; beforeEffect?(): void | Promise<void> }

/** All entrypoints verify through the protocol owner. Discovery never executes a business tool. */
export async function checkConnectorConnection(home: string, id: string, remember: ConnectorMcpDirectory["remember"], control: ConnectorCheckControl = {}) {
  const row = withConnectorConnections(home, store => store.require(id));
  await control.beforeEffect?.(); control.signal?.throwIfAborted();
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(control.signal ? [control.signal] : [])]);
  let result: Awaited<ReturnType<typeof inspectMcpConnection | typeof inspectCliConnection | typeof inspectApiConnection>>;
  try {
    result = row.auth_method === "mcp" ? await inspectMcpConnection(home, id, { signal, beforeDispatch: control.beforeEffect })
      : row.auth_method === "cli" ? await inspectCliConnection(home, id, false, signal) : await inspectApiConnection(home, id, false, signal);
  } catch (error) {
    await control.beforeEffect?.(); control.signal?.throwIfAborted();
    rememberConnectorCheck(home, id, { at: new Date().toISOString(), revision: row.updated_at, outcome: "failed",
      authorization: error instanceof ActionError && error.code === "connector.mcp.authorization" ? "required" : "unknown",
      ...(error instanceof ActionError ? { code: error.code } : {}) });
    throw error;
  }
  await control.beforeEffect?.(); control.signal?.throwIfAborted();
  const checked_at = new Date().toISOString();
  const protocol = row.auth_method === "mcp" ? withConnectorProtocols(home, store => store.get<StoredMcpConfiguration>(id)) : null;
  if (!rememberConnectorCheck(home, id, { at: checked_at, revision: row.updated_at, outcome: "connected",
    authorization: row.auth_method === "none" || protocol?.mode === "none" ? "not-required" : "verified",
    ...("verified_account" in result ? { account: result.verified_account } : "account" in result && typeof result.account === "object" ? { account: result.account } : {}) })) throw connectorErrors["connector.connection.invalid"]("检查期间连接已变化，请重新检查");
  if ("tools" in result) remember(id, result.tools, result.resources);
  return { connection_id: id, checked_at, ...result };
}

/** Enabling is already committed; an unsuccessful check must not pretend it undid that change. */
export async function verifyEnabledConnection(home: string, id: string, remember: ConnectorMcpDirectory["remember"], control: ConnectorCheckControl = {}) {
  try { return { available: true, result: await checkConnectorConnection(home, id, remember, control) }; }
  catch {
    control.signal?.throwIfAborted(); await control.beforeEffect?.();
    return { available: false, reason: "连接已启用，但尚未通过检查；请检查账号授权，通用密钥需在使用它的服务中验证" };
  }
}
