import { randomUUID } from "node:crypto";

import { assertClockTime, formatClockTime } from "./calendar.js";
import { ScheduleTaskError } from "./task-error.js";

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

export type ScheduleConversationTurnKind = "user" | "assistant" | "system";

export interface ScheduleConversationTurnRecord {
  turn_id: string;
  task_id: string;
  kind: ScheduleConversationTurnKind;
  text: string;
  important: boolean;
  created_at: string;
}

export interface ScheduleConversationTaskRecord {
  task_id: string;
  title: string;
  instructions: string;
  hour: number;
  minute: number;
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

export function migrateScheduleConversationTasks(db: ScheduleTaskDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_conversation_tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      notify_important INTEGER NOT NULL CHECK (notify_important IN (0, 1)),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      unread INTEGER NOT NULL CHECK (unread IN (0, 1)),
      job_id TEXT,
      last_run_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedule_conversation_tasks_enabled_idx
      ON schedule_conversation_tasks(enabled, updated_at);
    CREATE TABLE IF NOT EXISTS schedule_conversation_turns (
      turn_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('user', 'assistant', 'system')),
      text TEXT NOT NULL,
      important INTEGER NOT NULL CHECK (important IN (0, 1)),
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES schedule_conversation_tasks(task_id)
    );
    CREATE INDEX IF NOT EXISTS schedule_conversation_turns_task_idx
      ON schedule_conversation_turns(task_id, created_at);
  `);
  const columns = db.prepare("PRAGMA table_info(schedule_conversation_tasks)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "archived")) {
    db.exec("ALTER TABLE schedule_conversation_tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))");
  }
}

export function scheduleConversationFingerprint(db: ScheduleTaskDatabase): string {
  migrateScheduleConversationTasks(db);
  const tasks = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS updated FROM schedule_conversation_tasks",
  ).get() as { n: number; updated: string };
  const turns = db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(MAX(created_at), '') AS updated FROM schedule_conversation_turns",
  ).get() as { n: number; updated: string };
  return JSON.stringify({ tasks, turns });
}

export function listScheduleConversationTasks(db: ScheduleTaskDatabase): ScheduleConversationTaskRecord[] {
  migrateScheduleConversationTasks(db);
  const rows = db.prepare(
    "SELECT * FROM schedule_conversation_tasks WHERE archived = 0 ORDER BY enabled DESC, updated_at DESC",
  ).all() as TaskRow[];
  return rows.map((row) => toRecord(db, row));
}

export function getScheduleConversationTask(
  db: ScheduleTaskDatabase,
  taskId: string,
): ScheduleConversationTaskRecord | null {
  migrateScheduleConversationTasks(db);
  const row = db.prepare("SELECT * FROM schedule_conversation_tasks WHERE task_id = ?").get(taskId) as TaskRow | undefined;
  return row ? toRecord(db, row) : null;
}

export function createScheduleConversationTask(
  db: ScheduleTaskDatabase,
  input: {
    title: string;
    instructions: string;
    hour: number;
    minute: number;
    notify_important: boolean;
  },
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  migrateScheduleConversationTasks(db);
  const title = normalizeTitle(input.title);
  const instructions = normalizeInstructions(input.instructions);
  assertClockTime(input.hour, input.minute);
  const clock = now().toISOString();
  const taskId = `sct_${randomUUID()}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO schedule_conversation_tasks (
        task_id, title, instructions, hour, minute, notify_important, enabled, unread,
        job_id, last_run_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL, NULL, ?, ?)
    `).run(
      taskId, title, instructions, input.hour, input.minute, input.notify_important ? 1 : 0, clock, clock,
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
  if (task.archived) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
  db.prepare("UPDATE schedule_conversation_tasks SET enabled = ?, updated_at = ? WHERE task_id = ?")
    .run(enabled ? 1 : 0, now().toISOString(), task.task_id);
  return mustGet(db, task.task_id);
}

export function updateScheduleConversationTask(
  db: ScheduleTaskDatabase,
  taskId: string,
  input: { title: string; instructions: string; hour: number; minute: number; notify_important: boolean },
  now = () => new Date(),
): ScheduleConversationTaskRecord {
  const task = mustGet(db, taskId);
  if (task.archived) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
  const title = normalizeTitle(input.title);
  const instructions = normalizeInstructions(input.instructions);
  assertClockTime(input.hour, input.minute);
  db.prepare(`UPDATE schedule_conversation_tasks
    SET title = ?, instructions = ?, hour = ?, minute = ?, notify_important = ?, updated_at = ?
    WHERE task_id = ?`).run(title, instructions, input.hour, input.minute, input.notify_important ? 1 : 0, now().toISOString(), taskId);
  return mustGet(db, taskId);
}

export function archiveScheduleConversationTask(db: ScheduleTaskDatabase, taskId: string, now = () => new Date()): void {
  const task = mustGet(db, taskId);
  if (task.archived) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
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
  if (!text) throw new ScheduleTaskError("schedule_task_invalid", "对话内容不能为空");
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
  if (!task) throw new ScheduleTaskError("schedule_task_not_found", "定时任务不存在");
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
  if (!trimmed || trimmed.length > 80) {
    throw new ScheduleTaskError("schedule_task_invalid", "请填写 1 到 80 字的标题");
  }
  return trimmed;
}

function normalizeInstructions(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 8_000) {
    throw new ScheduleTaskError("schedule_task_invalid", "请填写 Agent 到点要做的说明");
  }
  return trimmed;
}
