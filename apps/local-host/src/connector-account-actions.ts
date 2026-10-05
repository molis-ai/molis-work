import { ActionError, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { ConnectorConnectionError } from "./connector-connection-store.js";
import { resolveApiConnection } from "./connector-access.js";

export interface ConnectorAccount { connection_id: string; service_id: string; login: string; scopes?: string[]; account_id?: string }
const text = { type: "string" };
export const connectorAccountActions = {
  read: { capability_id: "connectors.account.read", version: 1, operation: "query", action: {
    title: "查看连接账号", description: "读取一条服务连接当前授权的账号身份（与 GitHub 的授权范围）；不返回凭据", kind: "query", scope: "home",
    scheduling: "concurrent", audiences: ["user", "agent", "mcp"], permissions: ["connectors:account:read"], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: { connection_id: { type: "string", pattern: "^[a-z0-9-]{1,80}$" } }, required: ["connection_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connection_id: text, service_id: text, login: text, scopes: { type: "array", items: text }, account_id: text },
      required: ["connection_id", "service_id", "login"], additionalProperties: false },
  } } as ActionDefinition<{ connection_id: string }, ConnectorAccount>,
};
export const CONNECTOR_ACCOUNT_PERMISSIONS = ["connectors:account:read"];

const failed = (failure: string | undefined, message: string | undefined, fallback: string) =>
  new ActionError(failure === "needs_auth" ? "connectors.needs_auth" : failure === "configuration" ? "connectors.configuration" : "connectors.unavailable", message || fallback);

/** Account identity behind one connection, through the same resolver and provider calls its readers use. */
export async function readConnectorAccount(home: string, connectionId: string): Promise<ConnectorAccount> {
  let access: Awaited<ReturnType<typeof resolveApiConnection>>;
  try { access = await resolveApiConnection(home, connectionId); }
  catch (error) {
    if (error instanceof ConnectorConnectionError && error.code === "not_found") throw new ActionError("connectors.unknown", "没有这条连接");
    throw new ActionError("connectors.disconnected", error instanceof Error ? error.message : "连接不可用");
  }
  const service = access.connection.service_id;
  const identity = { connection_id: connectionId, service_id: service };
  if (service === "github") {
    const result = await githubWhoami({ token: access.token });
    if (!result.ok) throw failed(result.failure, result.failure === "needs_auth" ? "GitHub 需要重新授权" : result.message, "无法读取 GitHub 账号");
    return { ...identity, login: result.login, scopes: [...result.scopes] };
  }
  if (!isCatalogConnectorId(service)) throw new ActionError("connectors.unknown", "这条连接的服务不提供账号读取");
  let result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl: access.fetchImpl });
  if (!result.ok && result.failure === "needs_auth" && access.connection.auth_method === "oauth") {
    try {
      access = await resolveApiConnection(home, connectionId, service, true);
      result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl: access.fetchImpl });
    } catch { /* Keep the original account error. */ }
  }
  if (!result.ok) throw failed(result.failure, result.message, "无法读取账号");
  return { ...identity, login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) };
}

/** The connector owner registers account identity as a system action; connecting an account grants no other capability. */
export function connectorAccountActionProvider(home: string): ActionProviderRegistration {
  return {
    provider: { provider_id: "system.connectors", title: "服务连接", kind: "system" },
    definitions: Object.values(connectorAccountActions),
    handlers: [{ capability_id: connectorAccountActions.read.capability_id, version: 1,
      handle: (_caller, input) => readConnectorAccount(home, (input as { connection_id: string }).connection_id) }],
  };
}
