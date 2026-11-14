import { randomUUID } from "node:crypto";

import { assertClockTime, formatClockTime } from "./calendar.js";
import { scheduleErrors } from "./error.js";

type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};

export interface ScheduleTaskDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

type ScheduleConversationTurnKind = "user" | "assistant" | "system";

export interface ScheduleConversationTurnRecord {
  turn_id: string;
  task_id: string;
  kind: ScheduleConversationTurnKind;
  text: string;
  important: boolean;
  created_at: string;
}

/** `daily` runs every day at `hour:minute`; `none` runs once at `run_at` and then stops (specs/risk-plugin/implementation.md §4.5). */
export type ScheduleTaskRepeat = "daily" | "none";
/** The object a task is about (a risk it reviews): named in the round's words, never a grant to read it. */
export interface ScheduleTaskSubject { kind: string; id: string }

export interface ScheduleConversationTaskRecord {
  task_id: string;
  title: string;
  instructions: string;
  /** For a one-off task, the local hour and minute of `run_at`, for the list. */
  hour: number;
  minute: number;
  repeat: ScheduleTaskRepeat;
  run_at: string | null;
  subject: ScheduleTaskSubject | null;
  notify_important: boolean;
  enabled: boolean;
  archived: boolean;
  unread: boolean;
  job_id: string | null;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  turns: readonly ScheduleConversationTurnRecord[];
}

export interface ScheduleConversationTaskView extends ScheduleConversationTaskRecord {
  clock_label: string;
  next_due_at: string | null;
}

interface TaskRow {
  task_id: string;
  title: string;
  instructions: string;
  hour: number;
  minute: number;
  repeat: string;
  run_at: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  notify_important: number;
  enabled: number;
  archived: number;
  unread: number;
  job_id: string | null;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  turn_id: string;
  task_id: string;
  kind: string;
  text: string;
  important: number;
  created_at: string;
}

export function listScheduleConversationTasks(db: ScheduleTaskDatabase, subject?: ScheduleTaskSubject): ScheduleConversationTaskRecord[] {
  const rows = (subject
    ? db.prepare("SELECT * FROM schedule_conversation_tasks WHERE archived = 0 AND subject_kind = ? AND subject_id = ? ORDER BY enabled DESC, updated_at DESC")
      .all(subject.kind, subject.id)
    : db.prepare("SELECT * FROM schedule_conversation_tasks WHERE archived = 0 ORDER BY enabled DESC, updated_at DESC").all()) as TaskRow[];
  return rows.map((row) => toRecord(db, row));
}

export function getScheduleConversationTask(
  db: ScheduleTaskDatabase,
  taskId: string,
): ScheduleConversationTaskRecord | null {
  const row = db.prepare("SELECT * FROM schedule_conversation_tasks WHERE task_id = ?").get(taskId) as TaskRow | undefined;
  return row ? toRecord(db, row) : null;
}

/** What a person sets on a task; a one-off task's `hour` and `minute` are taken from `run_at`. */
export interface ScheduleTaskFields {
  title: string;
  instructions: string;
  hour: number;
  minute: number;
  notify_important: boolean;
  repeat?: ScheduleTaskRepeat;
  run_at?: string | null;
  subject?: ScheduleTaskSubject | null;
}

export function createScheduleConversationTask(
  db: ScheduleTaskDatabase,
  input: ScheduleTaskFields,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const title = normalizeTitle(input.title);
  const instructions = normalizeInstructions(input.instructions);
  const timing = normalizeTiming(input);
  const subject = normalizeSubject(input.subject);
  const clock = now().toISOString();
  const taskId = `sct_${randomUUID()}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO schedule_conversation_tasks (
        task_id, title, instructions, hour, minute, notify_important, enabled, unread,
        job_id, last_run_at, last_error, created_at, updated_at, repeat, run_at, subject_kind, subject_id
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId, title, instructions, timing.hour, timing.minute, input.notify_important ? 1 : 0, clock, clock,
      timing.repeat, timing.run_at, subject?.kind ?? null, subject?.id ?? null,
    );
    db.prepare(`
      INSERT INTO schedule_conversation_turns (turn_id, task_id, kind, text, important, created_at)
      VALUES (?, ?, 'user', ?, 0, ?)
    `).run(`scturn_${randomUUID()}`, taskId, instructions, clock);
  }).immediate();
  return mustGet(db, taskId);
}

export function bindScheduleConversationJob(
  db: ScheduleTaskDatabase,
  taskId: string,
  jobId: string,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = mustGet(db, taskId);
  db.prepare("UPDATE schedule_conversation_tasks SET job_id = ?, updated_at = ? WHERE task_id = ?")
    .run(jobId, now().toISOString(), task.task_id);
  return mustGet(db, task.task_id);
}

export function setScheduleConversationTaskEnabled(
  db: ScheduleTaskDatabase,
  taskId: string,
  enabled: boolean,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = mustGet(db, taskId);
  if (task.archived) throw scheduleErrors.task_not_found("定时任务不存在");
  // A one-off task whose time has passed has nothing left to run; it is given a new time instead (`tasks.update`).
  if (enabled && !task.enabled && task.repeat === "none" && Date.parse(task.run_at ?? "") <= now().getTime()) {
    throw scheduleErrors.task_invalid("这次的时间已经过了，请改一个新的时间");
  }
  db.prepare("UPDATE schedule_conversation_tasks SET enabled = ?, updated_at = ? WHERE task_id = ?")
    .run(enabled ? 1 : 0, now().toISOString(), task.task_id);
  return mustGet(db, task.task_id);
}

/** Changes what the person set. A one-off task given a new time runs again then, so it is switched back on. The subject is kept unless given. */
export function updateScheduleConversationTask(
  db: ScheduleTaskDatabase,
  taskId: string,
  input: ScheduleTaskFields,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = mustGet(db, taskId);
  if (task.archived) throw scheduleErrors.task_not_found("定时任务不存在");
  const title = normalizeTitle(input.title);
  const instructions = normalizeInstructions(input.instructions);
  const timing = normalizeTiming(input);
  const subject = input.subject === undefined ? task.subject : normalizeSubject(input.subject);
  const rescheduled = timing.repeat === "none" && timing.run_at !== task.run_at;
  db.prepare(`UPDATE schedule_conversation_tasks
    SET title = ?, instructions = ?, hour = ?, minute = ?, notify_important = ?, repeat = ?, run_at = ?, subject_kind = ?, subject_id = ?,
      enabled = CASE WHEN ? = 1 THEN 1 ELSE enabled END, updated_at = ?
    WHERE task_id = ?`).run(title, instructions, timing.hour, timing.minute, input.notify_important ? 1 : 0, timing.repeat, timing.run_at,
    subject?.kind ?? null, subject?.id ?? null, rescheduled ? 1 : 0, now().toISOString(), taskId);
  return mustGet(db, taskId);
}

export function archiveScheduleConversationTask(db: ScheduleTaskDatabase, taskId: string, now = () => new Date()): void {
  const task = mustGet(db, taskId);
  if (task.archived) throw scheduleErrors.task_not_found("定时任务不存在");
  db.prepare("UPDATE schedule_conversation_tasks SET archived = 1, enabled = 0, updated_at = ? WHERE task_id = ?")
    .run(now().toISOString(), taskId);
}

export function openScheduleConversationTask(
  db: ScheduleTaskDatabase,
  taskId: string,
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = mustGet(db, taskId);
  db.prepare("UPDATE schedule_conversation_tasks SET unread = 0, updated_at = ? WHERE task_id = ?")
    .run(now().toISOString(), task.task_id);
  return mustGet(db, task.task_id);
}

export function appendScheduleConversationTurn(
  db: ScheduleTaskDatabase,
  input: {
    task_id: string;
    kind: ScheduleConversationTurnKind;
    text: string;
    important?: boolean;
    error?: string | null;
    mark_unread?: boolean;
  },
  now = () => new Date(),
): ScheduleConversationTurnRecord {
  const task = mustGet(db, input.task_id);
  const clock = now().toISOString();
  const text = input.text.trim();
  if (!text) throw scheduleErrors.task_invalid("对话内容不能为空");
  const turnId = `scturn_${randomUUID()}`;
  const important = input.important === true ? 1 : 0;
  const unread = input.mark_unread === true ? 1 : 0;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO schedule_conversation_turns (turn_id, task_id, kind, text, important, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(turnId, task.task_id, input.kind, text, important, clock);
    db.prepare(`
      UPDATE schedule_conversation_tasks
      SET unread = CASE WHEN ? = 1 THEN 1 ELSE unread END,
          last_run_at = ?,
          last_error = ?,
          updated_at = ?
      WHERE task_id = ?
    `).run(unread, clock, input.error ?? null, clock, task.task_id);
  }).immediate();
  const row = db.prepare("SELECT * FROM schedule_conversation_turns WHERE turn_id = ?").get(turnId) as TurnRow;
  return toTurn(row);
}

export function toScheduleConversationTaskView(
  task: ScheduleConversationTaskRecord,
  nextDueAt: string | null,
): ScheduleConversationTaskView {
  return {
    ...task,
    clock_label: formatClockTime(task.hour, task.minute),
    next_due_at: nextDueAt,
  };
}

function mustGet(db: ScheduleTaskDatabase, taskId: string): ScheduleConversationTaskRecord {
  const task = getScheduleConversationTask(db, taskId);
  if (!task) throw scheduleErrors.task_not_found("定时任务不存在");
  return task;
}

function toRecord(db: ScheduleTaskDatabase, row: TaskRow): ScheduleConversationTaskRecord {
  const turns = db.prepare(
    "SELECT * FROM schedule_conversation_turns WHERE task_id = ? ORDER BY created_at ASC, turn_id ASC",
  ).all(row.task_id) as TurnRow[];
  return {
    task_id: row.task_id,
    title: row.title,
    instructions: row.instructions,
    hour: row.hour,
    minute: row.minute,
    repeat: row.repeat === "none" ? "none" : "daily",
    run_at: row.run_at,
    subject: row.subject_kind !== null && row.subject_id !== null ? { kind: row.subject_kind, id: row.subject_id } : null,
    notify_important: row.notify_important === 1,
    enabled: row.enabled === 1,
    archived: row.archived === 1,
    unread: row.unread === 1,
    job_id: row.job_id,
    last_run_at: row.last_run_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    turns: turns.map(toTurn),
  };
}

function toTurn(row: TurnRow): ScheduleConversationTurnRecord {
  return {
    turn_id: row.turn_id,
    task_id: row.task_id,
    kind: row.kind as ScheduleConversationTurnKind,
    text: row.text,
    important: row.important === 1,
    created_at: row.created_at,
  };
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > 80) {
    throw scheduleErrors.task_invalid("请填写 1 到 80 字的标题");
  }
  return trimmed;
}

function normalizeInstructions(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > 8_000) {
    throw scheduleErrors.task_invalid("请填写 Agent 到点要做的说明");
  }
  return trimmed;
}

/** A daily task keeps its clock time; a one-off one runs at `run_at` (an exact instant) and shows its local hour and minute. */
function normalizeTiming(input: Pick<ScheduleTaskFields, "hour" | "minute" | "repeat" | "run_at">): { repeat: ScheduleTaskRepeat; run_at: string | null; hour: number; minute: number } {
  if ((input.repeat ?? "daily") === "daily") {
    assertClockTime(input.hour, input.minute);
    return { repeat: "daily", run_at: null, hour: input.hour, minute: input.minute };
  }
  const at = input.run_at ? new Date(input.run_at) : null;
  if (!at || !Number.isFinite(at.getTime())) throw scheduleErrors.task_invalid("一次性任务要写运行的时间");
  return { repeat: "none", run_at: at.toISOString(), hour: at.getHours(), minute: at.getMinutes() };
}

function normalizeSubject(subject: ScheduleTaskSubject | null | undefined): ScheduleTaskSubject | null {
  if (!subject) return null;
  const kind = subject.kind.trim(), id = subject.id.trim();
  if (!kind || !id || kind.length > 100 || id.length > 400) throw scheduleErrors.task_invalid("任务关心的对象要有种类和 id");
  return { kind, id };
}
