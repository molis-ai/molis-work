import { withConnectorConnections } from "./connector-connection-store.js";
import { inspectMcpConnection } from "./connector-mcp.js";
import { inspectApiConnection } from "./connector-access.js";
import { inspectCliConnection } from "./connector-cli.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

export interface ConnectorCheckControl { signal?: AbortSignal; beforeEffect?(): void | Promise<void> }

/** All entrypoints verify through the protocol owner. Discovery never executes a business tool. */
export async function checkConnectorConnection(home: string, id: string, remember: ConnectorMcpDirectory["remember"], control: ConnectorCheckControl = {}) {
  const row = withConnectorConnections(home, store => store.require(id));
  await control.beforeEffect?.(); control.signal?.throwIfAborted();
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(control.signal ? [control.signal] : [])]);
  const result = row.auth_method === "mcp" ? await inspectMcpConnection(home, id, { signal })
    : row.auth_method === "cli" ? await inspectCliConnection(home, id, false, signal) : await inspectApiConnection(home, id, false, signal);
  await control.beforeEffect?.(); control.signal?.throwIfAborted();
  if ("tools" in result) remember(id, result.tools, result.resources);
  return { connection_id: id, checked_at: new Date().toISOString(), ...result };
}

/** Enabling is already committed; an unsuccessful check must not pretend it undid that change. */
export async function verifyEnabledConnection(home: string, id: string, remember: ConnectorMcpDirectory["remember"], control: ConnectorCheckControl = {}) {
  try { return { available: true, result: await checkConnectorConnection(home, id, remember, control) }; }
  catch {
    control.signal?.throwIfAborted(); await control.beforeEffect?.();
    return { available: false, reason: "连接已启用，但尚未通过检查；请检查账号授权，通用密钥需在使用它的服务中验证" };
  }
}
