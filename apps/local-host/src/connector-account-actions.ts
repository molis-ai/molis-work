import type { ActionClient, ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorUsagesAction, connectorUsagesHandler } from "./connector-usage-actions.js";
import { modelConnectionUsages, modelConnectionUsagesHandler } from "./model-connection-usages.js";
import { connectorCliActions, connectorCliHandlers } from "./connector-cli-actions.js";
import { connectorPluginSlotActions, connectorPluginSlotHandlers, type PluginSlotDeclarations } from "./connector-plugin-slot-actions.js";
import { ActionError, defineErrorCodes, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";

import { resolveApiConnection } from "./connector-access.js";
import { connectorManagementActions, connectorManagementHandlers } from "./connector-management-actions.js";
import { connectorRecordActions, connectorRecordHandlers } from "./connector-record-actions.js";
import { connectorLocalActions, connectorLocalHandlers } from "./connector-local-actions.js";
import { connectorSetupAction, connectorSetupHandler } from "./connector-setup.js";
import { connectorSetupExecuteAction, connectorSetupExecuteHandler } from "./connector-setup-execute.js";
import { connectorSetupIntentAction, connectorSetupIntentHandler } from "./connector-setup-intent.js";
import { noProjectMcp, type ProjectMcpManagementPort } from "./connector-project-mcp.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";
import type { ConnectorActionInspector } from "./connector-status-view.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { rememberConnectorCheck } from "./connector-observations.js";

export const CONNECTOR_PROVIDER_ID = "system.connectors";

interface ConnectorAccount { connection_id: string; service_id: string; login: string; scopes?: string[]; account_id?: string }
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

const accountErrors = defineErrorCodes("connector.account", {
  unknown: "invalid", disconnected: "invalid", needs_auth: "invalid", configuration: "invalid", unavailable: "invalid",
});
const failed = (failure: string | undefined, message: string | undefined, fallback: string) =>
  failure === "needs_auth" ? accountErrors.needs_auth(message || fallback)
    : failure === "configuration" ? accountErrors.configuration(message || fallback) : accountErrors.unavailable(message || fallback);

/** Account identity behind one connection, through the same resolver and provider calls its readers use. */
export async function readConnectorAccount(home: string, connectionId: string): Promise<ConnectorAccount> {
  let access: Awaited<ReturnType<typeof resolveApiConnection>>;
  try { access = await resolveApiConnection(home, connectionId); }
  catch (error) {
    if ((error instanceof ActionError && ["connector.connection.invalid","connector.connection.not_found","connector.connection.service_mismatch","connector.connection.disconnected"].includes(error.code)) && error.code === "connector.connection.not_found") throw accountErrors.unknown("没有这条连接");
    throw accountErrors.disconnected(error instanceof Error ? error.message : "连接不可用");
  }
  const service = access.connection.service_id;
  const identity = { connection_id: connectionId, service_id: service };
  if (service === "github") {
    const result = await githubWhoami({ token: access.token });
    if (!result.ok) throw failed(result.failure, result.failure === "needs_auth" ? "GitHub 需要重新授权" : result.message, "无法读取 GitHub 账号");
    return { ...identity, login: result.login, scopes: [...result.scopes], ...(result.account_id ? { account_id: result.account_id } : {}) };
  }
  if (!isCatalogConnectorId(service)) throw accountErrors.unknown("这条连接的服务不提供账号读取");
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
export function connectorAccountActionProvider(home: string, remember: ConnectorMcpDirectory["remember"], projectMcp: ProjectMcpManagementPort = noProjectMcp, inspect?: ConnectorActionInspector, clientFor?: (caller: ActionCallContext) => ActionClient, pluginSlots?: PluginSlotDeclarations): ActionProviderRegistration {
  return {
    provider: { provider_id: CONNECTOR_PROVIDER_ID, title: "服务连接", kind: "system" },
    definitions: [connectorUsagesAction, modelConnectionUsages, ...Object.values(connectorAccountActions), ...Object.values(connectorManagementActions), ...Object.values(connectorRecordActions), connectorSetupAction, connectorSetupExecuteAction, connectorSetupIntentAction, ...Object.values(connectorLocalActions), ...Object.values(connectorCliActions), ...Object.values(connectorPluginSlotActions)],
    handlers: [connectorUsagesHandler(home, clientFor), modelConnectionUsagesHandler(home), { capability_id: connectorAccountActions.read.capability_id, version: 1,
      handle: async (caller, input) => {
        const id = (input as { connection_id: string }).connection_id, revision = withConnectorConnections(home, store => store.get(id)?.updated_at);
        await caller.beforeEffect();
        const result = await readConnectorAccount(home, id);
        await caller.beforeEffect(); caller.signal?.throwIfAborted();
        if (revision && !rememberConnectorCheck(home, id, { at: new Date().toISOString(), revision, outcome: "connected", authorization: "verified", account: { login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) }, ...(result.scopes?.length ? { scopes: result.scopes } : {}) })) throw accountErrors.disconnected("读取期间连接已变化，请重新检查");
        return result;
      } }, ...connectorManagementHandlers(home, remember, projectMcp, inspect), ...connectorRecordHandlers(home), connectorSetupHandler(home), connectorSetupExecuteHandler(home, remember), connectorSetupIntentHandler(home, remember), ...connectorLocalHandlers(home, remember), ...connectorCliHandlers(home), ...connectorPluginSlotHandlers(home, pluginSlots)],
  };
}
