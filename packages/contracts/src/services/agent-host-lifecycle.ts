import type { ActionDefinition } from "../platform/actions.js";
import type { AgentSessionDecision, AgentSessionLifecycleReceipt, AgentSessionLifecycleView, AgentSessionPurgePreview, AgentSessionRef } from "./agent-host-runtime.js";

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const version = { type: "integer", minimum: 1 } as const;
const session = { type: "object", required: ["runtime_id", "session_id"], additionalProperties: false, properties: { runtime_id: id, session_id: id } } as const;
const decision = { type: "object", required: ["operation_id", "expected_version", "expected_state"], additionalProperties: false,
  properties: { operation_id: id, expected_version: version, expected_state: { enum: ["active", "archived"] } } } as const;
const preview = { type: "object", required: ["session", "version", "state", "runs", "resources", "destroys_key"], additionalProperties: false,
  properties: { session, version, state: { enum: ["active", "archived"] }, runs: { type: "integer", minimum: 0 }, resources: { type: "integer", minimum: 0 }, destroys_key: { type: "boolean" } } } as const;
const receipt = { type: "object", required: ["scope", "session", "operation_id", "action", "state", "version"], additionalProperties: false,
  properties: { scope: { const: "agent-host-session" }, session, operation_id: id, action: { enum: ["archive", "unarchive", "purge"] }, state: { enum: ["active", "archived", "purged"] }, version } } as const;
const query = { scope: "project", kind: "query", scheduling: "concurrent", audiences: ["plugin"], permissions: [], subject_kinds: [] } as const;
const command = { ...query, kind: "operation", effect: "write" } as const;
const input = { type: "object", required: ["session"], additionalProperties: false, properties: { session } } as const;
const change = { ...input, required: ["session", "decision"], properties: { session, decision } } as const;
type Target = { session: AgentSessionRef };
type Change = Target & { decision: AgentSessionDecision };

/** Plugin business owners use current invocation identity; no payload can choose an owner. */
export const agentSessionLifecycleActions = {
  read: { capability_id: "agent.session.lifecycle.read.v1", version: 1, operation: "query",
    action: { ...query, title: "读取会话生命周期", description: "读取当前业务主人会话的运行时状态与原决定，供显式恢复，不读取正文。", input_schema: input,
      output_schema: { type: "object", required: ["session", "state", "version"], additionalProperties: false, properties: { session, state: { enum: ["active", "archived", "purged", "unknown"] }, version: { type: ["integer", "null"] },
        operation: { type: "object", required: ["action", "decision", "completed"], additionalProperties: false,
          properties: { action: { enum: ["archive", "unarchive", "purge"] }, decision, completed: { type: "boolean" }, preview, receipt } } } } } } as ActionDefinition<Target, AgentSessionLifecycleView>,
  previewPurge: { capability_id: "agent.session.lifecycle.preview-purge.v1", version: 1, operation: "query",
    action: { ...query, title: "预览会话清除", description: "固定静止会话的当前版本和清除计数；有进行中或未对账工作时拒绝。", input_schema: input, output_schema: preview } } as ActionDefinition<Target, AgentSessionPurgePreview>,
  archive: { capability_id: "agent.session.lifecycle.archive.v1", version: 1, operation: "command",
    action: { ...command, title: "归档运行时会话", description: "按原版本和原操作归档静止会话；不停止正在进行的工作，不改变记忆期限。", input_schema: change, output_schema: receipt } } as ActionDefinition<Change, AgentSessionLifecycleReceipt>,
  unarchive: { capability_id: "agent.session.lifecycle.unarchive.v1", version: 1, operation: "command",
    action: { ...command, title: "取消运行时会话归档", description: "按原版本和原操作取消归档；历史装配不等于取消归档。", input_schema: change, output_schema: receipt } } as ActionDefinition<Change, AgentSessionLifecycleReceipt>,
  purge: { capability_id: "agent.session.lifecycle.purge.v1", version: 1, operation: "command",
    action: { ...command, title: "清除运行时会话", description: "只执行固定预览的原清除决定；回执仅覆盖运行时和 AgentHost，业务副本由原主人处理。", input_schema: { ...change, required: ["session", "decision", "preview"], properties: { session, decision, preview } }, output_schema: receipt } } as ActionDefinition<Change & { preview: AgentSessionPurgePreview }, AgentSessionLifecycleReceipt>,
} as const;
