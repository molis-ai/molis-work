import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { connectorAuthorizationInitiator, connectorAuthorizationStatus } from "./connector-authorization-status.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";

type Checker = NonNullable<NonNullable<PrologueNodeAdapterOptions["checks"]>["owned"]>[number];
export type ConnectorSetupCheckScope = Parameters<Checker["authorize"]>[0];
const CONNECTOR_SETUP_CHECKER = "molis.connector-setup";

/** The owner proves the request's caller; current Assistant grants are checked independently on every look. */
export function connectorSetupChecker(home: string, authorize: (scope: ConnectorSetupCheckScope) => Promise<void>): Checker {
  const params = { type: "object", properties: { authorization_id: { type: "string", minLength: 36, maxLength: 36 } }, required: ["authorization_id"], additionalProperties: false };
  const idOf = (input: unknown) => (input as { authorization_id: string }).authorization_id;
  return {
    id: CONNECTOR_SETUP_CHECKER, version: "1", params,
    checkParams: input => {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1
        || typeof idOf(input) !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOf(input))) return "需要本会话准备接入后得到的 authorization_id";
      return undefined;
    },
    authorize: async (scope, input) => {
      const request = connectorAuthorizationInitiator(home, idOf(input));
      if (scope.plugin_id !== ASSISTANT_PLUGIN_ID || !request || request.runtime_session_id !== scope.session_id || request.actor_id !== scope.actor_id
        || (request.project_id ?? ASSISTANT_PERSONAL_OWNER) !== scope.project_id) throw new ActionError("actions.forbidden", "接入请求不属于当前助理会话");
      await authorize(scope);
    },
    read: async (_scope, input, signal) => {
      signal.throwIfAborted();
      const request = connectorAuthorizationStatus(home, idOf(input));
      if (!request) return { status: "failed", note: "接入请求已经不存在" };
      const source = { ref: `connector-setup:${request.id}` };
      if (request.status === "prepared" || request.status === "pending") return { status: "pending", source, note: request.commit_held
        ? `${request.completion_ready ? "本人操作结果已收到，" : ""}接入因任务更新而暂缓；需按最新意图明确保留或取消`
        : "仍在等待本人完成接入；关闭页面不会取消" };
      if (request.status !== "connected") return { status: "failed", source, note: `接入请求已${request.status === "cancelled" ? "取消" : request.status === "expired" ? "过期" : "失败"}` };
      const connection = listConnectorConnectionViews(home, request.service_id).find(row => row.connection_id === request.connection_id);
      if (!connection?.enabled || connection.state !== "connected") return { status: "failed", source, note: "连接已停用、移除或需要重新授权" };
      return { status: "satisfied", source, note: `「${connection.display_name}」已提交接入；继续前核对当前账号、权限及实际能力。登录成功不代表原任务完成` };
    },
  };
}
