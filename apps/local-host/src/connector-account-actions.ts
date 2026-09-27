import { ActionError, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { resolveConnectorToken } from "./connector-credentials.js";
import { feishuCliFetch, feishuCliMarker } from "./feishu-cli.js";
import { resolveUsableNotionToken } from "./notion-oauth.js";

export interface ConnectorAccount { connector_id: string; login: string; scopes?: string[]; account_id?: string }
const text = { type: "string" };
export const connectorAccountActions = {
  read: { capability_id: "connectors.account.read", version: 1, operation: "query", action: {
    title: "查看连接账号", description: "读取一个已连接服务当前授权的账号身份（与 GitHub 的授权范围）；不返回凭据", kind: "query", scope: "home",
    scheduling: "concurrent", audiences: ["user", "agent", "mcp"], permissions: ["connectors:account:read"], subject_kinds: ["connector"],
    input_schema: { type: "object", properties: { connector_id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,40}$" } }, required: ["connector_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { connector_id: text, login: text, scopes: { type: "array", items: text }, account_id: text }, required: ["connector_id", "login"], additionalProperties: false },
  } } as ActionDefinition<{ connector_id: string }, ConnectorAccount>,
};
export const CONNECTOR_ACCOUNT_PERMISSIONS = ["connectors:account:read"];

const failed = (failure: string | undefined, message: string | undefined, fallback: string) =>
  new ActionError(failure === "needs_auth" ? "connectors.needs_auth" : failure === "configuration" ? "connectors.configuration" : "connectors.unavailable", message || fallback);

/** Account identity for a connected service, through the same credential owner and provider calls the settings page used. */
export async function readConnectorAccount(connectorId: string): Promise<ConnectorAccount> {
  const token = connectorId === "notion" ? await resolveUsableNotionToken() : resolveConnectorToken(connectorId);
  if (!token) throw new ActionError("connectors.disconnected", "未连接");
  if (connectorId === "github") {
    const result = await githubWhoami({ token });
    if (!result.ok) throw failed(result.failure, result.failure === "needs_auth" ? "GitHub 需要重新授权" : result.message, "无法读取 GitHub 账号");
    return { connector_id: connectorId, login: result.login, scopes: [...result.scopes] };
  }
  if (!isCatalogConnectorId(connectorId)) throw new ActionError("connectors.unknown", "没有这个 Connector");
  const fetchImpl = connectorId === "feishu" && token === feishuCliMarker() ? feishuCliFetch : undefined;
  let result = await catalogWhoami({ connectorId, token, fetchImpl });
  if (!result.ok && result.failure === "needs_auth" && connectorId === "notion") {
    try {
      const renewed = await resolveUsableNotionToken(true);
      if (renewed) result = await catalogWhoami({ connectorId, token: renewed });
    } catch { /* Keep the original account error. */ }
  }
  if (!result.ok) throw failed(result.failure, result.message, "无法读取账号");
  return { connector_id: connectorId, login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) };
}

/** The connector owner registers account identity as a system action; connecting an account grants no other capability. */
export function connectorAccountActionProvider(home: string): ActionProviderRegistration {
  return {
    provider: { provider_id: "system.connectors", title: "服务连接", kind: "system" },
    definitions: Object.values(connectorAccountActions),
    handlers: [{ capability_id: connectorAccountActions.read.capability_id, version: 1,
      handle: (_caller, input) => runWithMolisWorkHome(home, () => readConnectorAccount((input as { connector_id: string }).connector_id)) }],
  };
}
