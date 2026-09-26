import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PrepareSessionMessage, SessionMessageRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { SessionMessageService } from "./messages.js";

type SendInput = Omit<PrepareSessionMessage, "actor_id" | "project_id">;
const text = { type: "string" }, nullable = { type: ["string", "null"] };
const context = { type: "object", properties: { kind: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 }, content: { type: "string", maxLength: 40_000 } }, required: ["kind", "id", "content"], additionalProperties: false };
const target = { session_id: text, project_id: nullable, runtime_id: text, native_runtime_session_id: nullable,
  current_goal_id: nullable, workspace_id: nullable, workspace_path: nullable, status: { enum: ["discovered", "active", "closed"] } };
const properties = { request_id: text, actor_id: text, project_id: text, idempotency_key: text,
  target: { type: "object", properties: target, required: Object.keys(target), additionalProperties: false },
  text: nullable, context: { anyOf: [{ type: "null" }, context] }, content_available: { type: "boolean" },
  state: { enum: ["pending", "uncertain", "failed", "accepted"] }, attempt_count: { type: "integer", minimum: 0 },
  native_turn_id: nullable, error_code: nullable, created_at: text, updated_at: text };
const output = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
const requestInput = { type: "object", properties: { request_id: { type: "string", minLength: 1 } }, required: ["request_id"], additionalProperties: false };
const definition = <I>(id: string, title: string, description: string, operation: "query" | "command", input: Record<string, unknown>): ActionDefinition<I, SessionMessageRecord> => ({
  capability_id: id, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user", "agent", "workflow", "mcp"], subject_kinds: ["session"], permissions: operation === "query" ? ["sessions:read"] : ["sessions:read", "sessions:message"], input_schema: input, output_schema: output },
});
export const sessionMessageActions = {
  messageSend: definition<SendInput>("sessions.message.send", "发送会话消息", "向明确选择的现有会话发送文本与可选上下文。固定幂等键和预期目标；accepted 表示 Runtime 接收，uncertain 表示无法确认，不能自动重发。", "command", {
    type: "object", properties: { session_id: { type: "string", minLength: 1 }, expected_goal_id: nullable,
      idempotency_key: { type: "string", minLength: 1, maxLength: 200 }, text: { type: "string", minLength: 1, maxLength: 20_000 }, context },
    required: ["session_id", "expected_goal_id", "idempotency_key", "text"], additionalProperties: false,
  }),
  messageRead: definition<{ request_id: string }>("sessions.message.read", "消息送达状态", "读取当前调用者在本项目提交的消息、固定目标和送达回执。查询不会重发。", "query", requestInput),
  messageRetry: definition<{ request_id: string }>("sessions.message.retry", "重试被拒绝的消息", "仅重试 Runtime 已明确拒绝的原请求，保留原文与目标。已接收或结果未确认的请求不会重复投递。", "command", requestInput),
};
export function createSessionMessageHandlers(projectId: string, resources: () => Promise<{ messages: SessionMessageService }>,
  assertAuthority: (caller: ActionCallContext, action: ActionReference) => Promise<void>): ActionHandlerBinding[] {
  const bind = <I>(definition: ActionDefinition<I, SessionMessageRecord>, operation: (service: SessionMessageService, input: I, caller: { actor_id: string; project_id: string }, authorize: () => Promise<void>) => SessionMessageRecord | Promise<SessionMessageRecord>): ActionHandlerBinding => ({
    ...definition, async handle(caller, input) {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "消息调用不属于当前项目");
      const authorize = async () => { await assertAuthority(caller, definition); caller.signal?.throwIfAborted(); };
      const { messages } = await resources(); await authorize();
      return operation(messages, input as I, { actor_id: caller.actor_id, project_id: projectId }, authorize);
    },
  });
  return [
    bind(sessionMessageActions.messageSend, (service, input, caller, authorize) => service.send({ ...input, ...caller }, authorize)),
    bind(sessionMessageActions.messageRead, (service, input, caller) => service.read(input.request_id, caller)),
    bind(sessionMessageActions.messageRetry, (service, input, caller, authorize) => service.retry(input.request_id, caller, authorize)),
  ];
}
