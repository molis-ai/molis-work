import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";

export const SCHEDULE_TASK_WAKEUP_CAPABILITY = "schedule.task.wakeup";
export const SCHEDULE_REMINDER_WAKEUP = "schedule.reminder.wakeup";
export const SCHEDULE_OPERATION_WAKEUP = "schedule.operation.wakeup";
export const SCHEDULE_RECONCILE_JOB = "schedule-reconcile";
const text = { type: "string", minLength: 1 };
const wake = (capability_id: string, title: string, permissions: readonly string[]): ActionDefinition<ScheduleWakeupInput, ScheduleWakeupReply> => ({
  capability_id, version: 1, operation: "command", action: { title, description: title, kind: "operation", scope: "project", audiences: ["plugin"],
    scheduling: "concurrent", permissions: ["storage:private", "schedule:read", "schedule:write", ...permissions], subject_kinds: [],
    execution: { timeout_ms: 660_000 }, input_schema: { type: "object", properties: {
      job_id: text, plugin_id: text, capability_id: text, object_ref: text, due_at: text,
    }, required: ["job_id", "plugin_id", "capability_id", "object_ref", "due_at"], additionalProperties: false },
    output_schema: { type: "object", properties: { status: { enum: ["ok", "failed", "plugin_unavailable"] }, detail: { type: "string" } }, additionalProperties: false },
  },
});
export const scheduleWakeupActions = {
  task: wake(SCHEDULE_TASK_WAKEUP_CAPABILITY, "运行每日对话任务", ["agent:run"]),
  reminder: wake(SCHEDULE_REMINDER_WAKEUP, "投递到期提醒", ["plugins:read", "notifications:write"]),
  operation: wake(SCHEDULE_OPERATION_WAKEUP, "执行到期插件操作", ["plugins:read", "actions:invoke", "notifications:write"]),
};
