import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { SchedulePluginRouteHandler, SchedulePluginRouteResponse } from "./routes.js";
import { parseClockTime } from "./calendar.js";
import { ScheduleTaskError } from "./task-error.js";
import {
  archiveScheduleConversationTask,
  bindScheduleConversationJob,
  createScheduleConversationTask,
  getScheduleConversationTask,
  listScheduleConversationTasks,
  openScheduleConversationTask,
  toScheduleConversationTaskView,
  updateScheduleConversationTask,
  type ScheduleConversationTaskRecord,
  type ScheduleConversationTaskView,
  type ScheduleTaskDatabase,
} from "./tasks.js";
import {
  isScheduleConversationJob,
  ownedScheduleJobs,
  pauseOrResumeConversationTask,
  registerConversationJob,
  type ScheduleJobPort,
} from "./wakeup.js";

export interface ScheduleRouteHandlerPorts {
  listJobs(): readonly ScheduleJobRecord[];
  setEnabled(jobId: string, enabled: boolean): ScheduleJobRecord;
  listTasks(): readonly ScheduleConversationTaskView[];
  createTask(input: {
    title: string;
    instructions: string;
    hour: number;
    minute: number;
    notify_important: boolean;
  }): ScheduleConversationTaskView;
  updateTask(taskId: string, input: {
    title: string; instructions: string; hour: number; minute: number; notify_important: boolean;
  }): ScheduleConversationTaskView;
  archiveTask(taskId: string): void;
  setTaskEnabled(taskId: string, enabled: boolean): ScheduleConversationTaskView;
  openTask(taskId: string): ScheduleConversationTaskView;
  changed(): void;
  renderWorkbench?(): string;
}

export function createScheduleRouteHandlerPorts(options: {
  db: ScheduleTaskDatabase;
  schedule: ScheduleJobPort;
  now?: () => Date;
}): Omit<ScheduleRouteHandlerPorts, "changed"> {
  const now = options.now ?? (() => new Date());
  const viewOf = (task: ScheduleConversationTaskRecord): ScheduleConversationTaskView => {
    const job = task.job_id ? options.schedule.get(task.job_id) : null;
    return toScheduleConversationTaskView(task, job?.next_due_at ?? null);
  };
  const asView = (taskId: string): ScheduleConversationTaskView => {
    const task = getScheduleConversationTask(options.db, taskId);
    if (!task) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
    return viewOf(task);
  };
  return {
    listJobs: () => ownedScheduleJobs(options.schedule.list()),
    setEnabled: (jobId, enabled) => {
      const job = options.schedule.get(jobId);
      if (job && isScheduleConversationJob(job)) {
        throw new ScheduleTaskError("schedule_task_invalid", "对话任务请用任务自己的开关");
      }
      return options.schedule.setEnabled(jobId, enabled);
    },
    listTasks: () => listScheduleConversationTasks(options.db).map(viewOf),
    createTask(input) {
      const created = createScheduleConversationTask(options.db, input, now);
      const job = registerConversationJob(options.schedule, created, now());
      bindScheduleConversationJob(options.db, created.task_id, job.job_id, now);
      return asView(created.task_id);
    },
    updateTask(taskId, input) {
      options.db.transaction(() => {
        const task = updateScheduleConversationTask(options.db, taskId, input, now);
        if (task.enabled) {
          const job = registerConversationJob(options.schedule, task, now());
          bindScheduleConversationJob(options.db, task.task_id, job.job_id, now);
        }
      }).immediate();
      return asView(taskId);
    },
    archiveTask(taskId) {
      options.db.transaction(() => {
        const task = getScheduleConversationTask(options.db, taskId);
        if (!task || task.archived) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
        archiveScheduleConversationTask(options.db, taskId, now);
        if (task.job_id && options.schedule.get(task.job_id)) options.schedule.cancel(task.job_id);
      }).immediate();
    },
    setTaskEnabled: (taskId, enabled) => {
      pauseOrResumeConversationTask(options.db, options.schedule, taskId, enabled, now);
      return asView(taskId);
    },
    openTask: (taskId) => {
      openScheduleConversationTask(options.db, taskId, now);
      return asView(taskId);
    },
  };
}

export function createScheduleRouteHandlers(options: ScheduleRouteHandlerPorts): Record<string, SchedulePluginRouteHandler> {
  return {
    "schedule.list": () => ({
      status: 200,
      body: { jobs: options.listJobs(), tasks: options.listTasks() },
    }),
    "schedule.workbench": () => options.renderWorkbench
      ? { status: 200, html: options.renderWorkbench() }
      : { status: 501, body: { error: "Schedule 工作区不可用" } },
    "schedule.job.enabled": ({ params, request }) => {
      const enabled = request.body.enabled;
      if (typeof enabled !== "boolean") {
        return { status: 400, body: { error: "请指定是否启用" } };
      }
      const jobId = params.job_id;
      if (!jobId) return { status: 404, body: { error: "定时任务不存在", code: "schedule_job_not_found" } };
      const job = options.setEnabled(jobId, enabled);
      options.changed();
      return { status: 200, body: { job } };
    },
    "schedule.task.create": ({ request }) => {
      const title = typeof request.body.title === "string" ? request.body.title : "";
      const instructions = typeof request.body.instructions === "string" ? request.body.instructions : "";
      const notifyImportant = request.body.notify_important !== false;
      const clock = parseClockTime(request.body.time ?? request.body.clock);
      const task = options.createTask({
        title,
        instructions,
        hour: clock.hour,
        minute: clock.minute,
        notify_important: notifyImportant,
      });
      options.changed();
      return { status: 201, body: { task } };
    },
    "schedule.task.update": ({ params, request }) => {
      const clock = parseClockTime(request.body.time ?? request.body.clock);
      const task = options.updateTask(params.task_id ?? "", {
        title: typeof request.body.title === "string" ? request.body.title : "",
        instructions: typeof request.body.instructions === "string" ? request.body.instructions : "",
        hour: clock.hour,
        minute: clock.minute,
        notify_important: request.body.notify_important !== false,
      });
      options.changed();
      return { status: 200, body: { task } };
    },
    "schedule.task.archive": ({ params }) => {
      options.archiveTask(params.task_id ?? "");
      options.changed();
      return { status: 200, body: { archived: true } };
    },
    "schedule.task.enabled": ({ params, request }) => {
      const enabled = request.body.enabled;
      if (typeof enabled !== "boolean") {
        return { status: 400, body: { error: "请指定是否启用" } };
      }
      const taskId = params.task_id;
      if (!taskId) return { status: 404, body: { error: "定时任务不存在", code: "schedule_task_not_found" } };
      const task = options.setTaskEnabled(taskId, enabled);
      options.changed();
      return { status: 200, body: { task } };
    },
    "schedule.task.open": ({ params }) => {
      const taskId = params.task_id;
      if (!taskId) return { status: 404, body: { error: "定时任务不存在", code: "schedule_task_not_found" } };
      const task = options.openTask(taskId);
      options.changed();
      return { status: 200, body: { task } };
    },
  };
}

export function scheduleRouteErrorResponse(error: unknown): SchedulePluginRouteResponse {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "schedule_job_not_found" || code === "schedule_task_not_found") {
    return { status: 404, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, ...(code ? { code } : {}) } };
}
