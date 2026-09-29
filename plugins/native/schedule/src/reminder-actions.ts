import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReminderIdentity, ReminderInput } from "./reminders.js";

/** Host-composed common reminder service, independent of enabling the Schedule conversation UI. */
export const SCHEDULE_REMINDER_PROVIDER_ID = "schedule.reminders";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const define = <I, O>(capability_id: string, title: string, description: string, input: Record<string, unknown>, output: Record<string, unknown>): ActionDefinition<I, O> => ({
  capability_id, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project", effect: "write", audiences: ["plugin"],
    permissions: [], subject_kinds: [], execution: { timeout_ms: 10_000, cost: "none" }, input_schema: input, output_schema: output },
});
/** Stable ids preserve already-published contracts; Schedule now owns their implementation and declaration. */
export const reminderActions = {
  add: define<ReminderInput, { reminderId: string }>("reminders.add", "到点提醒", "由 Schedule 在设定时间把提醒放入收件箱，不运行插件代码；每日和每周为固定间隔，每个安装最多 200 条",
    object({ at: { type: "string", format: "date-time" }, text: { type: "string", minLength: 1, maxLength: 200 }, repeat: { enum: ["none", "daily", "weekly"] } }, ["at", "text"]),
    object({ reminderId: { type: "string" } })),
  cancel: define<{ reminderId: string }, { cancelled: boolean }>("reminders.cancel", "取消提醒", "只能取消当前插件安装创建的提醒；已投递的一次性提醒返回 false",
    object({ reminderId: { type: "string", minLength: 1, maxLength: 100 } }), object({ cancelled: { type: "boolean" } })),
};
export const REMINDER_ACTIONS = Object.values(reminderActions);
export interface ReminderActionPorts {
  add(identity: ReminderIdentity, input: ReminderInput): { reminderId: string };
  cancel(identity: ReminderIdentity, input: { reminderId: string }): { cancelled: boolean };
}
export function createReminderActionHandlers(projectId: string, ports: ReminderActionPorts): ActionHandlerBinding[] {
  const identity = (context: ActionExecutionContext): ReminderIdentity => {
    if (context.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "提醒不属于这个项目");
    if (context.audience !== "plugin" || !context.actor_id.startsWith("plugin:") || !context.plugin_install_id) throw new ActionError("actions.forbidden", "提醒需要真实的插件安装身份");
    return { projectId, pluginId: context.actor_id.slice("plugin:".length), installationId: context.plugin_install_id };
  };
  return [
    { ...reminderActions.add, handle: async (context, input) => { await context.beforeEffect(); return ports.add(identity(context), input as ReminderInput); } },
    { ...reminderActions.cancel, handle: async (context, input) => { await context.beforeEffect(); return ports.cancel(identity(context), input as { reminderId: string }); } },
  ];
}
