import { ScheduleTaskError } from "./task-error.js";
import type { ScheduleActionPorts } from "./actions.js";
import type { ScheduleReminderManagement } from "./reminder-management.js";
import type { ScheduledOperationManagement } from "./operation-management.js";
import { migrateScheduledOperations, setScheduledOperationEnabled } from "./operations.js";
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

/** The task owner: the project database holds the tasks, the scheduler service their wakeups. */
export function createScheduleActionPorts(options: {
  db: ScheduleTaskDatabase;
  schedule: ScheduleJobPort;
  reminders?: ScheduleReminderManagement;
  operations?: ScheduledOperationManagement;
  now?: () => Date;
}): ScheduleActionPorts {
  migrateScheduledOperations(options.db);
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
    listJobs: () => ownedScheduleJobs(options.schedule.list()).map(job => options.reminders?.view(job) ?? job),
    setEnabled: (jobId, enabled) => {
      const job = options.schedule.get(jobId);
      if (job && isScheduleConversationJob(job)) {
        throw new ScheduleTaskError("schedule_task_invalid", "对话任务请用任务自己的开关");
      }
      if (job && enabled) options.reminders?.assertCanEnable(job);
      const operation = setScheduledOperationEnabled(options.db, options.schedule, jobId, enabled);
      if (operation) return operation;
      return options.schedule.setEnabled(jobId, enabled);
    },
    recoverReminder: input => {
      if (!options.reminders) throw new ScheduleTaskError("schedule_task_invalid", "当前宿主未提供提醒恢复入口");
      return options.reminders.recover(input);
    },
    listOperations: () => options.operations?.list() ?? [],
    orphanedOccurrences: () => options.operations?.orphanedOccurrences() ?? [],
    recoverOperation: input => {
      if (!options.operations) throw new ScheduleTaskError("schedule_task_invalid", "当前宿主未提供定时操作恢复入口");
      return options.operations.recover(input);
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
