import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import { parseClockTime } from "./calendar.js";
import type { ScheduleConversationTaskView } from "./tasks.js";
import type { RecoverScheduleReminderInput, ScheduleJobView } from "./reminder-management.js";
import type { RecoverScheduledOperationInput, ScheduledOperationView } from "./operation-management.js";
import { createScheduleSearchHandlers, scheduleSearchActions } from "./search.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const nullableText = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const turn = object({ turn_id: id, task_id: id, kind: { enum: ["user", "assistant", "system"] }, text, important: { type: "boolean" }, created_at: text });
const task = object({ task_id: id, title: text, instructions: text, hour: { type: "integer", minimum: 0, maximum: 23 }, minute: { type: "integer", minimum: 0, maximum: 59 },
  notify_important: { type: "boolean" }, enabled: { type: "boolean" }, archived: { type: "boolean" }, unread: { type: "boolean" }, job_id: nullableText,
  last_run_at: nullableText, last_error: nullableText, created_at: text, updated_at: text, turns: { type: "array", items: turn }, clock_label: text, next_due_at: nullableText });
const reminder = object({ text, plugin_id: id, plugin_title: text, needs_confirmation: { type: "boolean" },
  installation: { anyOf: [{ type: "null" }, object({ installation_id: id, generation: id, title: text, version: text, publisher: text })] } });
// Jobs belong to other plugins' wakeups; their recurrence and last result stay owned by the scheduler service.
const job = { type: "object", properties: { job_id: id, plugin_id: id, capability_id: id, object_ref: text, title: text, next_due_at: text, enabled: { type: "boolean" },
  created_at: text, updated_at: text, reminder }, required: ["job_id", "plugin_id", "capability_id", "object_ref", "title", "next_due_at", "enabled"] };
const occurrence = object({ projectId: id, operationId: id, dueAt: text, state: { enum: ["pending", "running", "succeeded", "failed", "unknown", "skipped"] },
  detail: nullableText, startedAt: nullableText, finishedAt: nullableText,
  decisions: { type: "array", items: object({ decision: { enum: ["retry", "skip"] }, at: text, previousDetail: nullableText }) } },
  ["projectId", "operationId", "dueAt", "state", "detail", "startedAt", "finishedAt"]);
const operationView = object({ id, projectId: id, pluginId: id, installationId: nullableText, installationGeneration: nullableText, pluginTitle: text,
  operationId: id, operationTitle: text, input: {}, inbox: { type: "boolean" }, link: text, jobId: id, jobOwner: id, repeat: { enum: ["none", "daily", "weekly"] }, at: text,
  state: { enum: ["enabled", "paused", "needs_confirmation", "needs_review", "completed"] }, detail: nullableText, revision: id,
  job: { anyOf: [{ type: "null" }, job] }, installation: { anyOf: [{ type: "null" }, object({ installationId: id, generation: id, title: text, version: text, publisher: text,
    operations: { type: "array", items: { type: "object", properties: { id, description: text }, required: ["id"] } } })] },
  occurrences: { type: "array", items: occurrence } });
// Blank or malformed values reach the task owner, whose validation explains what to fix.
const fields = { title: { type: "string", maxLength: 200, description: "1 到 80 字" }, instructions: { type: "string", maxLength: 16000, description: "Agent 到点要做的说明，最多 8000 字" },
  time: { type: "string", maxLength: 16, description: "每天运行的本地时间，HH:MM" },
  notify_important: { type: "boolean", description: "重要结果是否标记未读；缺省为 true" } };
const read = ["schedule:read"], write = ["schedule:write"];

// `schedule.register/list/...` are the platform wakeup capabilities other plugins consume; the plugin's own tasks live beside them.
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[], options: { plugin?: false } = {}): ActionDefinition<I, O> {
  return { capability_id: `schedule.${name}`, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    permissions, subject_kinds: ["schedule_task"], input_schema: input, output_schema: output, ...options } };
}

export interface ScheduleTaskInput { title: string; instructions: string; time: string; notify_important?: boolean }
export const scheduleActions = {
  list: define<Record<string, never>, { jobs: ScheduleJobView[]; tasks: ScheduleConversationTaskView[]; operations: ScheduledOperationView[] }>("tasks.list", "定时任务列表",
    "读取当前项目的每日对话任务与其他插件登记的闹钟；已归档任务不在列表中", "query", object({}),
    object({ jobs: { type: "array", items: job }, tasks: { type: "array", items: task }, operations: { type: "array", items: operationView } }), read),
  createTask: define<ScheduleTaskInput, { task: ScheduleConversationTaskView }>("tasks.create", "新建定时任务",
    "新建每天定时运行的对话任务并登记下一次唤醒；到点后由项目 Agent 按说明执行", "command",
    object(fields, ["title", "instructions", "time"]), object({ task }), write),
  updateTask: define<ScheduleTaskInput & { task_id: string }, { task: ScheduleConversationTaskView }>("tasks.update", "修改定时任务",
    "修改任务标题、说明与时间；启用中的任务按新时间重新排期，保留原对话记录", "command",
    object({ task_id: id, ...fields }, ["task_id", "title", "instructions", "time"]), object({ task }), write),
  archiveTask: define<{ task_id: string }, { archived: true }>("tasks.archive", "归档定时任务",
    "停止任务并移出列表，取消尚未到点的唤醒；保留原对话记录", "command", object({ task_id: id }), object({ archived: { const: true } }), write),
  setTaskEnabled: define<{ task_id: string; enabled: boolean }, { task: ScheduleConversationTaskView }>("tasks.enabled", "暂停或恢复定时任务",
    "暂停时不再唤醒；恢复时从现在起计算下一次运行时间", "command", object({ task_id: id, enabled: { type: "boolean" } }), object({ task }), write),
  openTask: define<{ task_id: string }, { task: ScheduleConversationTaskView }>("tasks.open", "标记定时任务已读",
    "打开任务时清除未读标记，不改变排期", "command", object({ task_id: id }), object({ task }), write),
  setJobEnabled: define<{ job_id: string; enabled: boolean }, { job: ScheduleJobRecord }>("jobs.enabled", "暂停或恢复闹钟",
    "暂停或恢复其他插件登记的闹钟；对话任务使用自己的开关", "command", object({ job_id: id, enabled: { type: "boolean" } }), object({ job }), write),
  recoverReminder: define<RecoverScheduleReminderInput, { job: ScheduleJobView }>("reminders.recover", "确认并恢复旧提醒",
    "查看提醒内容和当前安装后，明确将旧提醒交给当前安装并恢复原排期；过期时补提醒一次。预期安装 ID 和世代仅用于拒绝过期确认，不能授权任意安装", "command",
    object({ job_id: id, expected_installation_id: id, expected_generation: id }), object({ job }), write, { plugin: false }),
  recoverOperation: define<RecoverScheduledOperationInput, { operation: ScheduledOperationView }>("operations.recover", "核对并恢复定时操作",
    "先读取原功能、输入、当前安装与执行记录，再决定恢复、重试最早的未知结果（可能重复副作用）或跳过该次。预期版本与 revision 拒绝过期确认；不会直接执行插件代码，保留原排期与历史", "command",
    object({ operation_id: id, decision: { enum: ["resume", "retry", "skip"] }, expected_revision: id, expected_installation_id: id, expected_generation: id, expected_version: id }),
    object({ operation: operationView }), write, { plugin: false }),
  searchEntries: scheduleSearchActions.entries,
  subject: scheduleSearchActions.subject,
};
export const SCHEDULE_ACTIONS: readonly ActionDefinition[] = Object.values(scheduleActions);
export const SCHEDULE_ACTION_PERMISSIONS = [...new Set(SCHEDULE_ACTIONS.flatMap(definition => definition.action.permissions))];

/** The plugin's business service, bound by the Host to the project database that owns the tasks. */
export interface ScheduleActionPorts {
  listJobs(): readonly ScheduleJobView[];
  setEnabled(jobId: string, enabled: boolean): ScheduleJobRecord;
  recoverReminder(input: RecoverScheduleReminderInput): ScheduleJobView;
  listOperations?(): ScheduledOperationView[];
  recoverOperation?(input: RecoverScheduledOperationInput): ScheduledOperationView;
  listTasks(): readonly ScheduleConversationTaskView[];
  createTask(input: { title: string; instructions: string; hour: number; minute: number; notify_important: boolean }): ScheduleConversationTaskView;
  updateTask(taskId: string, input: { title: string; instructions: string; hour: number; minute: number; notify_important: boolean }): ScheduleConversationTaskView;
  archiveTask(taskId: string): void;
  setTaskEnabled(taskId: string, enabled: boolean): ScheduleConversationTaskView;
  openTask(taskId: string): ScheduleConversationTaskView;
}

export function createScheduleActionHandlers(projectId: string, ports: ScheduleActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与定时任务所在项目不一致");
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    handle: (caller, input) => { project(caller); return handle(input as I, caller); },
  });
  const editable = (input: ScheduleTaskInput) => ({ title: input.title, instructions: input.instructions, ...parseClockTime(input.time), notify_important: input.notify_important !== false });
  return [
    bind(scheduleActions.list, () => ({ jobs: [...ports.listJobs()], tasks: [...ports.listTasks()], operations: ports.listOperations?.() ?? [] })),
    bind(scheduleActions.createTask, input => ({ task: ports.createTask(editable(input)) })),
    bind(scheduleActions.updateTask, input => ({ task: ports.updateTask(input.task_id, editable(input)) })),
    bind(scheduleActions.archiveTask, input => { ports.archiveTask(input.task_id); return { archived: true as const }; }),
    bind(scheduleActions.setTaskEnabled, input => ({ task: ports.setTaskEnabled(input.task_id, input.enabled) })),
    bind(scheduleActions.openTask, input => ({ task: ports.openTask(input.task_id) })),
    bind(scheduleActions.setJobEnabled, input => ({ job: ports.setEnabled(input.job_id, input.enabled) })),
    bind(scheduleActions.recoverReminder, async (input, caller) => {
      await caller.beforeEffect();
      return { job: ports.recoverReminder(input) };
    }),
    bind(scheduleActions.recoverOperation, async (input, caller) => {
      await caller.beforeEffect();
      if (!ports.recoverOperation) throw new ActionError("actions.unredeemed", "当前宿主未提供定时操作恢复入口");
      return { operation: ports.recoverOperation(input) };
    }),
    ...createScheduleSearchHandlers(projectId, () => ports.listTasks()),
  ];
}
