import { defineErrorCodes, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorAuthorizationInitiator, connectorAuthorizationStatus } from "./connector-authorization-status.js";
import { startMcpConnection } from "./connector-mcp.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

const errors = defineErrorCodes("connector.setup.execute", { denied: "forbidden", invalid: "invalid" });
export const connectorSetupExecuteAction: ActionDefinition = {
  capability_id: "connectors.setup.execute", version: 1, operation: "command", action: {
    title: "执行已准备的免凭据 MCP 接入", description: "按本会话已准备且明确获准的 HTTP/SSE 免凭据方案连接并发现能力。只接受授权请求 id，不收地址或密钥；需要本人登录或填写凭据的方案返回原表单。成功后可继续原业务任务；不会执行业务工具，也不接管本机已有服务进程。",
    scope: "home", audiences: ["user", "agent", "mcp"], subject_kinds: ["connector"], kind: "operation", effect: "write", permissions: ["connectors:management:write"], scheduling: "concurrent",
    input_schema: { type: "object", properties: { authorization_id: { type: "string", format: "uuid" } }, required: ["authorization_id"], additionalProperties: false }, output_schema: { type: "object" },
  },
};

export function connectorSetupExecuteHandler(home: string, remember: ConnectorMcpDirectory["remember"]): ActionHandlerBinding {
  return { capability_id: connectorSetupExecuteAction.capability_id, version: 1, handle: async (caller, input) => {
    const id = (input as { authorization_id: string }).authorization_id;
    const initiator = connectorAuthorizationInitiator(home, id);
    if (!initiator || initiator.actor_id !== caller.actor_id || initiator.project_id !== caller.project_id || initiator.runtime_session_id !== caller.runtime_session_id) throw errors.denied("只能执行当前用户、项目和会话自己准备的接入");
    await caller.beforeEffect(); caller.signal?.throwIfAborted();
    const request = connectorAuthorizationStatus(home, id), setup = request?.setup;
    if (!setup || !request) throw errors.invalid("接入请求不存在，请重新准备");
    if (request.status !== "prepared") return request;
    if (request.commit_held) return { ...request, awaiting_intent: true, reason: "接入因新要求暂缓，请按最新要求保留或取消接入" };
    if (setup.method !== "mcp" || setup.authentication !== "none" || !["http", "sse"].includes(setup.transport ?? "")) return { status: "needs_person", authorization_id: id, url: `/capabilities/connections?setup=${id}` };
    return withConnectorRequest(home, id, caller.signal, async signal => {
      const result = await startMcpConnection(home, { serviceId: setup.service_id, displayName: setup.display_name, endpoint: setup.endpoint,
        authentication: "none", transport: setup.transport as "http" | "sse", setupId: id }, { signal, beforeDispatch: caller.beforeEffect });
      if ("tools" in result) remember(result.connectionId, result.tools, result.resources);
      return { ...connectorAuthorizationStatus(home, id), ...("tools" in result ? { tools: result.tools, resources: result.resources } : {}) };
    });
  } };
}
