import type { ScheduleJobRecord, ScheduleRegisterInput, ScheduleWakeupControl } from "@molis-ai/molis-work-contracts/services/scheduler";

import { nextDailyLocalDue } from "./calendar.js";
import { SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY } from "./manifest.js";
import { parseScheduledAgentReply } from "./reply.js";
import {
  appendScheduleConversationTurn,
  bindScheduleConversationJob,
  getScheduleConversationTask,
  listScheduleConversationTasks,
  setScheduleConversationTaskEnabled,
  type ScheduleConversationTaskRecord,
  type ScheduleTaskDatabase,
} from "./tasks.js";

export interface ScheduledTaskRunner {
  run(input: {
    title: string;
    instructions: string;
    history: readonly { kind: string; text: string }[];
  }, control?: ScheduleWakeupControl): Promise<{ text: string; important: boolean }>;
}

export interface ScheduleJobPort {
  list(): readonly ScheduleJobRecord[];
  get(jobId: string): ScheduleJobRecord | null;
  isExecuting?(jobId: string): boolean;
  setEnabled(jobId: string, enabled: boolean): ScheduleJobRecord;
  cancel(jobId: string): { cancelled: boolean };
  register(input: ScheduleRegisterInput): ScheduleJobRecord;
}

export function isScheduleConversationJob(job: Pick<ScheduleJobRecord, "plugin_id" | "capability_id">): boolean {
  return job.plugin_id === SCHEDULE_PLUGIN_ID && job.capability_id === SCHEDULE_TASK_WAKEUP_CAPABILITY;
}

export function ownedScheduleJobs(jobs: readonly ScheduleJobRecord[]): ScheduleJobRecord[] {
  return jobs.filter((job) => !isScheduleConversationJob(job));
}

export async function handleScheduleTaskWakeup(
  db: ScheduleTaskDatabase,
  objectRef: string,
  runner: ScheduledTaskRunner,
  now = () => new Date(),
  control?: ScheduleWakeupControl,
): Promise<{ detail?: string }> {
  const task = getScheduleConversationTask(db, objectRef);
  if (!task || !task.enabled || task.archived) return { detail: "任务已停" };
  const history = task.turns.map((turn) => ({ kind: turn.kind, text: turn.text }));
  const assertCurrent = () => {
    control?.beforeEffect();
    const current = getScheduleConversationTask(db, objectRef);
    // Marking the conversation read changes updated_at but does not invalidate the work.
    if (!current || !current.enabled || current.archived || current.title !== task.title || current.instructions !== task.instructions
      || current.hour !== task.hour || current.minute !== task.minute || current.notify_important !== task.notify_important) {
      throw new Error("定时任务已暂停或改变，本轮结果未保存");
    }
  };
  try {
    assertCurrent();
    const raw = await runner.run({
      title: task.title,
      instructions: task.instructions,
      history,
    }, control);
    const parsed = parseScheduledAgentReply(raw.text);
    const text = parsed.text || "这一轮没有写出正文。";
    const important = parsed.marked ? parsed.important : raw.important;
    db.transaction(() => {
      assertCurrent();
      appendScheduleConversationTurn(db, {
        task_id: task.task_id,
        kind: "assistant",
        text,
        important,
        mark_unread: important && task.notify_important,
      }, now);
    }).immediate();
    return { detail: important ? "important" : "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.transaction(() => {
      assertCurrent();
      appendScheduleConversationTurn(db, {
        task_id: task.task_id,
        kind: "system",
        text: `到点了，但这一轮没跑成：${message}`,
        error: message,
      }, now);
    }).immediate();
    throw error;
  }
}

export async function rescheduleEnabledConversationTasks(
  db: ScheduleTaskDatabase,
  schedule: ScheduleJobPort,
  now = () => new Date(),
): Promise<void> {
  for (const task of listScheduleConversationTasks(db)) {
    if (!task.enabled) continue;
    const job = task.job_id ? schedule.get(task.job_id) : null;
    if (job && (job.enabled || schedule.isExecuting?.(job.job_id))) continue;
    const registered = registerConversationJob(schedule, task, now());
    if (job?.job_id !== registered.job_id) bindScheduleConversationJob(db, task.task_id, registered.job_id, now);
  }
}

export function registerConversationJob(
  schedule: ScheduleJobPort,
  task: Pick<ScheduleConversationTaskRecord, "task_id" | "title" | "hour" | "minute">,
  from: Date,
): ScheduleJobRecord {
  return schedule.register({
    plugin_id: SCHEDULE_PLUGIN_ID,
    capability_id: SCHEDULE_TASK_WAKEUP_CAPABILITY,
    object_ref: task.task_id,
    title: task.title,
    due_at: nextDailyLocalDue(task.hour, task.minute, from).toISOString(),
    recurrence: { kind: "once" },
  });
}

export function pauseOrResumeConversationTask(
  db: ScheduleTaskDatabase,
  schedule: ScheduleJobPort,
  taskId: string,
  enabled: boolean,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = setScheduleConversationTaskEnabled(db, taskId, enabled, now);
  if (!enabled) {
    if (task.job_id) {
      try {
        schedule.setEnabled(task.job_id, false);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code !== "schedule_job_not_found") throw error;
      }
    }
    return getScheduleConversationTask(db, task.task_id) ?? task;
  }
  const registered = registerConversationJob(schedule, task, now());
  return bindScheduleConversationJob(db, task.task_id, registered.job_id, now);
}
