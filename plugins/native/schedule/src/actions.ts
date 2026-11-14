import { objectSchema as object, createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import { parseClockTime } from "./calendar.js";
import { scheduleErrors, scheduleFailure } from "./error.js";
import type { ScheduleConversationTaskView, ScheduleTaskFields, ScheduleTaskRepeat, ScheduleTaskSubject } from "./tasks.js";
import type { ScheduleTaskReads } from "./task-grants.js";
import type { RecoverScheduleReminderInput, ScheduleJobView } from "./reminder-management.js";
import type { RecoverScheduledOperationInput, ScheduledOperationView } from "./operation-management.js";
import { createScheduleSearchHandlers, scheduleSearchActions } from "./search.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const nullableText = { type: ["string", "null"] };
const turn = object({ turn_id: id, task_id: id, kind: { enum: ["user", "assistant", "system"] }, text, important: { type: "boolean" }, created_at: text });
const task = object({ task_id: id, title: text, instructions: text, hour: { type: "integer", minimum: 0, maximum: 23 }, minute: { type: "integer", minimum: 0, maximum: 59 },
  notify_important: { type: "boolean" }, enabled: { type: "boolean" }, archived: { type: "boolean" }, unread: { type: "boolean" }, job_id: nullableText,
  last_run_at: nullableText, last_error: nullableText, created_at: text, updated_at: text, turns: { type: "array", items: turn }, clock_label: text, next_due_at: nullableText,
  repeat: { enum: ["daily", "none"] }, run_at: nullableText, subject: { anyOf: [{ type: "null" }, object({ kind: id, id })] } });
const subject = object({ kind: { type: "string", minLength: 1, maxLength: 100 }, id: { type: "string", minLength: 1, maxLength: 400 } });
const reads = object({ task_id: id, categories: { type: "integer" }, granted: { type: "integer" }, needs_confirmation: { type: "integer" },
  unavailable: { type: "integer" }, removed: { type: "integer" } });
const reminder = object({ text, plugin_id: id, plugin_title: text, needs_confirmation: { type: "boolean" },
  installation: { anyOf: [{ type: "null" }, object({ installation_id: id, generation: id, title: text, version: text, publisher: text })] } });
// Jobs belong to other plugins' wakeups; their recurrence and last result stay owned by the scheduler service.
const job = { type: "object", properties: { job_id: id, plugin_id: id, capability_id: id, object_ref: text, title: text, next_due_at: text, enabled: { type: "boolean" },
  created_at: text, updated_at: text, reminder }, required: ["job_id", "plugin_id", "capability_id", "object_ref", "title", "next_due_at", "enabled"] };
// One reminder as another plugin's background task may read it: what it says, whose it is and when; no installation or wakeup target.
const reminderItem = object({ job_id: id, text, plugin_id: id, plugin_title: text, next_due_at: text, enabled: { type: "boolean" }, needs_confirmation: { type: "boolean" } });
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
  time: { type: "string", maxLength: 16, description: "每天运行的本地时间，HH:MM；repeat 为 daily（缺省）时必填" },
  repeat: { enum: ["daily", "none"], description: "daily 每天运行；none 只在 at 运行一次，跑完就停。新建缺省为 daily；修改时缺省沿用任务原来的（一次性任务不给 at 就保留原时间）" },
  at: { type: "string", maxLength: 64, description: "一次性任务运行的时间，带时区，例如 2026-12-01T09:00:00+08:00；一年以内" },
  subject: { ...subject, description: "任务关心的对象（如一条风险），只写进这一轮的说明，不给读它的权限" },
  notify_important: { type: "boolean", description: "重要结果是否标记未读；缺省为 true" } };
const read = ["schedule:read"], write = ["schedule:write"];

// `schedule.register/list/...` are the platform wakeup capabilities other plugins consume; the plugin's own tasks live beside them.
function define<I, O>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[], options: { plugin?: false } = {}): ActionDefinition<I, O> {
  return createActionDefinition<I, O>(`schedule.${name}`, operation, { title, description,
    audiences: ["user", "workflow", "agent", "mcp"],
    permissions, subject_kinds: ["schedule_task"], input_schema: input, output_schema: output, ...options }, version);
}

/** A reminder of this project, without the operations other plugins scheduled or their input (`schedule.reminders.list`). */
export interface ScheduleReminderItem { job_id: string; text: string; plugin_id: string; plugin_title: string; next_due_at: string; enabled: boolean; needs_confirmation: boolean }
export interface ScheduleTaskInput { title: string; instructions: string; time?: string; notify_important?: boolean; repeat?: ScheduleTaskRepeat; at?: string; subject?: ScheduleTaskSubject }
/** What a due task still needs from the Host: a configured text model, and a verified workspace bound to the project. */
export interface ScheduleTaskReadiness { model: boolean; workspace: boolean }
export const scheduleActions = {
  list: define<{ subject?: ScheduleTaskSubject }, { jobs: ScheduleJobView[]; tasks: ScheduleConversationTaskView[]; operations: ScheduledOperationView[]; reads?: ScheduleTaskReads[] }>("tasks.list", /* @version action.schedule.tasks.list */ 1, "定时任务列表",
    "读取当前项目的对话任务与其他插件登记的闹钟；已归档任务不在列表中。给了 subject 时只列关心这个对象的任务，并带每个任务能读什么（reads；读不到时不带）",
    "query", object({ subject }, []),
    object({ jobs: { type: "array", items: job }, tasks: { type: "array", items: task }, operations: { type: "array", items: operationView },
      reads: { type: "array", items: reads } }, ["jobs", "tasks", "operations"]), read),
  reminders: define<Record<string, never>, { reminders: ScheduleReminderItem[] }>("reminders.list", /* @version action.schedule.reminders.list */ 1, "提醒列表",
    "只读取当前项目的提醒：内容、来自哪个插件、下一次时间与是否启用；不含定时任务与其他插件登记的定时操作", "query", object({}),
    object({ reminders: { type: "array", items: reminderItem } }), read),
  readiness: define<Record<string, never>, ScheduleTaskReadiness>("tasks.readiness", /* @version action.schedule.tasks.readiness */ 1, "定时任务就绪情况",
    "读取对话任务到点执行需要的条件：已配置的文字模型、项目绑定的工作区；缺任何一项都仍可创建任务，到点时才会叫醒失败", "query", object({}),
    object({ model: { type: "boolean" }, workspace: { type: "boolean" } }), read),
  createTask: define<ScheduleTaskInput, { task: ScheduleConversationTaskView }>("tasks.create", /* @version action.schedule.tasks.create */ 1, "新建定时任务",
    "新建每天定时运行的对话任务并登记下一次唤醒；到点后由项目 Agent 按说明执行", "command",
    object(fields, ["title", "instructions"]), object({ task }), write),
  updateTask: define<ScheduleTaskInput & { task_id: string }, { task: ScheduleConversationTaskView }>("tasks.update", /* @version action.schedule.tasks.update */ 1, "修改定时任务",
    "修改任务标题、说明与时间；启用中的任务按新时间重新排期，保留原对话记录", "command",
    object({ task_id: id, ...fields }, ["task_id", "title", "instructions"]), object({ task }), write),
  archiveTask: define<{ task_id: string }, { archived: true }>("tasks.archive", /* @version action.schedule.tasks.archive */ 1, "归档定时任务",
    "停止任务并移出列表，取消尚未到点的唤醒；保留原对话记录", "command", object({ task_id: id }), object({ archived: { const: true } }), write),
  setTaskEnabled: define<{ task_id: string; enabled: boolean }, { task: ScheduleConversationTaskView }>("tasks.enabled", /* @version action.schedule.tasks.enabled */ 1, "暂停或恢复定时任务",
    "暂停时不再唤醒；恢复时从现在起计算下一次运行时间", "command", object({ task_id: id, enabled: { type: "boolean" } }), object({ task }), write),
  openTask: define<{ task_id: string }, { task: ScheduleConversationTaskView }>("tasks.open", /* @version action.schedule.tasks.open */ 1, "标记定时任务已读",
    "打开任务时清除未读标记，不改变排期", "command", object({ task_id: id }), object({ task }), write),
  setJobEnabled: define<{ job_id: string; enabled: boolean }, { job: ScheduleJobRecord }>("jobs.enabled", /* @version action.schedule.jobs.enabled */ 1, "暂停或恢复闹钟",
    "暂停或恢复其他插件登记的闹钟；对话任务使用自己的开关", "command", object({ job_id: id, enabled: { type: "boolean" } }), object({ job }), write),
  recoverReminder: define<RecoverScheduleReminderInput, { job: ScheduleJobView }>("reminders.recover", /* @version action.schedule.reminders.recover */ 1, "确认并恢复旧提醒",
    "查看提醒内容和当前安装后，明确将旧提醒交给当前安装并恢复原排期；过期时补提醒一次。预期安装 ID 和世代仅用于拒绝过期确认，不能授权任意安装", "command",
    object({ job_id: id, expected_installation_id: id, expected_generation: id }), object({ job }), write, { plugin: false }),
  recoverOperation: define<RecoverScheduledOperationInput, { operation: ScheduledOperationView }>("operations.recover", /* @version action.schedule.operations.recover */ 1, "核对并恢复定时操作",
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
  listTasks(subject?: ScheduleTaskSubject): readonly ScheduleConversationTaskView[];
  /** What each task may read beyond project files, from the platform's one list; a Host that cannot say leaves it out. */
  taskReads?(): Promise<ScheduleTaskReads[]>;
  /** Whether the Host can run a due task right now; a Host that cannot say leaves it out. */
  readiness?(): ScheduleTaskReadiness | Promise<ScheduleTaskReadiness>;
  createTask(input: ScheduleTaskFields): ScheduleConversationTaskView;
  updateTask(taskId: string, input: ScheduleTaskFields): ScheduleConversationTaskView;
  archiveTask(taskId: string): void;
  /** After an archive has committed: the task's read grants go with it (the platform's; Schedule only asks it to clear them). */
  archived?(taskId: string): Promise<void>;
  setTaskEnabled(taskId: string, enabled: boolean): ScheduleConversationTaskView;
  openTask(taskId: string): ScheduleConversationTaskView;
}

/** A one-off task's time, checked as a reminder's is: an instant with its time zone, not past, within a year. */
function oneOffAt(value: string | undefined, now: number): Date {
  const raw = value?.trim() ?? "";
  const at = Date.parse(raw);
  if (!raw || !Number.isFinite(at) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    throw scheduleErrors.task_invalid("一次性任务的时间要写成带时区的时间，例如 2026-12-01T09:00:00+08:00");
  }
  if (at <= now) throw scheduleErrors.task_invalid("一次性任务的时间已经过去了");
  if (at > now + 366 * 86_400_000) throw scheduleErrors.task_invalid("一次性任务最多设在一年以内");
  return new Date(at);
}

export type ScheduleActionWrite = <T>(caller: ActionExecutionContext, operation: () => T) => Promise<T>;
export function createScheduleActionHandlers(projectId: string, ports: ScheduleActionPorts, write?: ScheduleActionWrite): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与定时任务所在项目不一致");
  };
  // `after` runs once the write has committed, outside its transaction: what it calls is another owner's, not part of this write.
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>,
    after?: (input: I) => Promise<void>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    // The scheduler service's refusals leave Schedule as Schedule's own declared failures.
    handle: async (caller, input) => { try {
      project(caller);
      const run = async () => {
        if (definition.operation !== "command") return await handle(input as I, caller);
        if (write) return await write(caller, () => handle(input as I, caller));
        await caller.beforeEffect();
        return await handle(input as I, caller);
      };
      const output = await run();
      await after?.(input as I);
      return output;
    } catch (error) { throw scheduleFailure(error); } },
  });
  // A change that leaves out how the task repeats keeps it as it is, like its subject: editing a one-off task's title on Schedule's
  // page (which sends only the title, instructions and time) does not turn it into a daily one.
  const editable = (input: ScheduleTaskInput, current?: ScheduleConversationTaskView): ScheduleTaskFields => {
    const common = { title: input.title, instructions: input.instructions, notify_important: input.notify_important !== false,
      ...(input.subject ? { subject: input.subject } : {}) };
    const repeat = input.repeat ?? (current?.repeat === "none" ? "none" : "daily");
    if (repeat === "daily") return { ...common, ...parseClockTime(input.time), repeat: "daily" };
    if (input.at === undefined && current?.repeat === "none" && current.run_at) {
      const kept = new Date(current.run_at);
      return { ...common, hour: kept.getHours(), minute: kept.getMinutes(), repeat: "none", run_at: current.run_at };
    }
    const at = oneOffAt(input.at, Date.now());
    return { ...common, hour: at.getHours(), minute: at.getMinutes(), repeat: "none", run_at: at.toISOString() };
  };
  return [
    // With a subject, the list is that object's tasks and says what each may read (a plugin showing its object's review).
    bind(scheduleActions.list, async input => {
      const tasks = [...ports.listTasks(input.subject)];
      if (!input.subject) return { jobs: [...ports.listJobs()], tasks, operations: ports.listOperations?.() ?? [] };
      const ids = new Set(tasks.map(item => item.task_id));
      // The reads are the platform's; when it cannot say, the tasks still show and `reads` is left out rather than shown as none.
      const reads = await ports.taskReads?.().then(all => all.filter(item => ids.has(item.task_id)), () => undefined);
      return { jobs: [], tasks, operations: [], ...(reads ? { reads } : {}) };
    }),
    bind(scheduleActions.reminders, () => ({ reminders: ports.listJobs().flatMap(job => job.reminder ? [{ job_id: job.job_id, text: job.reminder.text,
      plugin_id: job.reminder.plugin_id, plugin_title: job.reminder.plugin_title, next_due_at: job.next_due_at, enabled: job.enabled,
      needs_confirmation: job.reminder.needs_confirmation }] : []) })),
    bind(scheduleActions.readiness, () => {
      if (!ports.readiness) throw new ActionError("actions.unredeemed", "当前宿主未提供定时任务就绪检查");
      return ports.readiness();
    }),
    bind(scheduleActions.createTask, input => ({ task: ports.createTask(editable(input)) })),
    bind(scheduleActions.updateTask, input => ({ task: ports.updateTask(input.task_id, editable(input, ports.listTasks().find(task => task.task_id === input.task_id))) })),
    bind(scheduleActions.archiveTask, input => { ports.archiveTask(input.task_id); return { archived: true as const }; },
      async input => { await ports.archived?.(input.task_id); }),
    bind(scheduleActions.setTaskEnabled, input => ({ task: ports.setTaskEnabled(input.task_id, input.enabled) })),
    bind(scheduleActions.openTask, input => ({ task: ports.openTask(input.task_id) })),
    bind(scheduleActions.setJobEnabled, input => ({ job: ports.setEnabled(input.job_id, input.enabled) })),
    bind(scheduleActions.recoverReminder, input => ({ job: ports.recoverReminder(input) })),
    bind(scheduleActions.recoverOperation, input => {
      if (!ports.recoverOperation) throw new ActionError("actions.unredeemed", "当前宿主未提供定时操作恢复入口");
      return { operation: ports.recoverOperation(input) };
    }),
    ...createScheduleSearchHandlers(projectId, () => ports.listTasks()),
  ];
}
