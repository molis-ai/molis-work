import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduledOperationIdentity, ScheduledOperationInput } from "./operations.js";

export const SCHEDULE_OPERATION_PROVIDER_ID = "schedule.operations";
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const define = <I, O>(capability_id: string, title: string, description: string, input: Record<string, unknown>, output: Record<string, unknown>): ActionDefinition<I, O> => ({
  capability_id, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project", effect: "write", audiences: ["plugin"],
    permissions: [], subject_kinds: [], execution: { timeout_ms: 10_000, cost: "none" }, input_schema: input, output_schema: output },
});
/** Stable capability ids and schemas preserve published plugin contracts. */
export const scheduledOperationActions = {
  add: define<ScheduledOperationInput, { scheduleId: string }>("schedules.add", "定时执行", "按时间运行当前安装自己的一项功能，可将结果放入收件箱；每天/每周为固定间隔，每个安装最多 20 条。尚未派出的工作会等待执行入口，结果未知的工作不会自动重跑",
    object({ operation: { type: "string", minLength: 1, maxLength: 120 }, at: { type: "string", format: "date-time" },
      repeat: { type: "string", enum: ["none", "daily", "weekly"] }, input: { type: "object" }, inbox: { type: "boolean" } }, ["operation", "at"]),
    object({ scheduleId: { type: "string" } })),
  cancel: define<{ scheduleId: string }, { cancelled: boolean }>("schedules.cancel", "取消定时", "取消当前安装创建的定时操作；其他安装或已完成的一次性操作返回 false",
    object({ scheduleId: { type: "string", minLength: 1, maxLength: 100 } }), object({ cancelled: { type: "boolean" } })),
};
export const SCHEDULE_OPERATION_ACTIONS = Object.values(scheduledOperationActions);
export interface ScheduledOperationActionPorts {
  add(identity: ScheduledOperationIdentity, input: ScheduledOperationInput): { scheduleId: string };
  cancel(identity: ScheduledOperationIdentity, input: { scheduleId: string }): { cancelled: boolean };
}
export function createScheduledOperationActionHandlers(projectId: string, ports: ScheduledOperationActionPorts): ActionHandlerBinding[] {
  const identity = (context: ActionExecutionContext): ScheduledOperationIdentity => {
    if (context.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "定时操作不属于这个项目");
    if (context.audience !== "plugin" || !context.actor_id.startsWith("plugin:") || !context.plugin_install_id) throw new ActionError("actions.forbidden", "定时操作需要真实的插件安装身份");
    return { projectId, pluginId: context.actor_id.slice("plugin:".length), installationId: context.plugin_install_id };
  };
  return [
    { ...scheduledOperationActions.add, handle: async (context, input) => { await context.beforeEffect(); return ports.add(identity(context), input as ScheduledOperationInput); } },
    { ...scheduledOperationActions.cancel, handle: async (context, input) => { await context.beforeEffect(); return ports.cancel(identity(context), input as { scheduleId: string }); } },
  ];
}
