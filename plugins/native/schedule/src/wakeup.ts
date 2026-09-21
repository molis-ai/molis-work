import type { ScheduleJobRecord, ScheduleRegisterInput } from "@molis-ai/molis-work-contracts/services/scheduler";

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
  }): Promise<{ text: string; important: boolean }>;
}

export interface ScheduleJobPort {
  list(): readonly ScheduleJobRecord[];
  get(jobId: string): ScheduleJobRecord | null;
  setEnabled(jobId: string, enabled: boolean): ScheduleJobRecord;
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
): Promise<{ detail?: string }> {
  const task = getScheduleConversationTask(db, objectRef);
  if (!task || !task.enabled) return { detail: "任务已停" };
  const history = task.turns.map((turn) => ({ kind: turn.kind, text: turn.text }));
  try {
    const raw = await runner.run({
      title: task.title,
      instructions: task.instructions,
      history,
    });
    const parsed = parseScheduledAgentReply(raw.text);
    const text = parsed.text || "这一轮没有写出正文。";
    const important = parsed.marked ? parsed.important : raw.important;
    appendScheduleConversationTurn(db, {
      task_id: task.task_id,
      kind: "assistant",
      text,
      important,
      mark_unread: important && task.notify_important,
    }, now);
    return { detail: important ? "important" : "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendScheduleConversationTurn(db, {
      task_id: task.task_id,
      kind: "system",
      text: `到点了，但这一轮没跑成：${message}`,
      error: message,
    }, now);
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
    if (job?.enabled) continue;
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
