import { defineErrorCodes, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { cancelConnectorAuthorization, connectorAuthorizationInitiator, connectorAuthorizationStatus, releaseConnectorAuthorizationIntent } from "./connector-authorization-status.js";
import { commitRetainedConnectorAuthorization } from "./connector-authorization-commit.js";
import { verifyEnabledConnection } from "./connector-check-service.js";
import type { ConnectorMcpDirectory } from "./connector-mcp-actions.js";

const errors = defineErrorCodes("connector.setup.intent", { changed: "conflict", denied: "forbidden" });
export const connectorSetupIntentAction: ActionDefinition = {
  capability_id: "connectors.setup.resolve", version: 1, operation: "command", action: {
    title: "按最新要求保留或取消接入", description: "本人发来新要求后，读取本会话接入请求的最新状态和 intent_revision，再按最新意图选择 retain 或 cancel。保留只释放该接入的提交，不启动业务任务；改用另一服务、账号或撤回接入授权时取消旧请求。不能依据旧计划自动保留。",
    scope: "home", audiences: ["agent"], subject_kinds: ["connector"], kind: "operation", effect: "write", permissions: ["connectors:management:write"],
    input_schema: { type: "object", properties: { authorization_id: { type: "string", format: "uuid" }, intent_revision: { type: "string", minLength: 1 },
      decision: { type: "string", enum: ["retain", "cancel"] } }, required: ["authorization_id", "intent_revision", "decision"], additionalProperties: false },
    output_schema: { type: "object" },
  },
};

export function connectorSetupIntentHandler(home: string, remember: ConnectorMcpDirectory["remember"]): ActionHandlerBinding {
  return { capability_id: connectorSetupIntentAction.capability_id, version: 1, handle: async (caller, input) => {
    const choice = input as { authorization_id: string; intent_revision: string; decision: "retain" | "cancel" };
    await caller.beforeEffect();
    const initiator = connectorAuthorizationInitiator(home, choice.authorization_id);
    if (!caller.runtime_session_id || initiator?.runtime_session_id !== caller.runtime_session_id || initiator.actor_id !== caller.actor_id || initiator.project_id !== caller.project_id) {
      throw errors.denied("只能根据本会话最新要求处理它自己发起的接入");
    }
    const request = connectorAuthorizationStatus(home, choice.authorization_id);
    if (request?.intent_revision !== choice.intent_revision || !["prepared", "pending"].includes(request.status)) throw errors.changed("接入要求已变化或请求已结束，请重新读取");
    if (choice.decision === "cancel") return cancelConnectorAuthorization(home, choice.authorization_id)!;
    releaseConnectorAuthorizationIntent(home, choice.authorization_id, choice.intent_revision);
    const result = (await commitRetainedConnectorAuthorization(home, choice.authorization_id))!;
    return result.status === "connected" ? { ...result, verification: await verifyEnabledConnection(home, result.connection_id, remember, caller) } : result;
  } };
}
