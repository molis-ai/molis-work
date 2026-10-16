import { syncError } from './sync-errors.js';
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica,
  initializeReplica,
  namespacedReplicaDatabase,
  readDatabaseSpace,
  replicaMarkSql,
  replicaTransaction,
  queueReplicaChange,
  type ReplicaDatabase,
} from "@molis-ai/molis-work-storage";
import { SCHEDULE_TASKS_SCHEMA_SQL } from "./tasks.js";

const TASK_COLUMNS = [
  "task_id", "title", "instructions", "hour", "minute", "notify_important",
  "enabled", "archived", "unread", "last_run_at", "last_error", "created_at", "updated_at",
] as const;
const TURN_COLUMNS = ["turn_id", "task_id", "kind", "text", "important", "created_at"] as const;
type Row = Record<string, unknown>;

function invalid(): never {
  throw syncError("invalid", "定时任务同步数据不合法");
}
function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function exact(value: Row, fields: readonly string[]): void {
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) invalid();
}
function str(value: unknown, max: number, nullable = false): boolean {
  return nullable && value === null || typeof value === "string" && value.length <= max;
}
function date(value: unknown, nullable = false): boolean {
  return nullable && value === null || typeof value === "string" && Number.isFinite(Date.parse(value));
}
function size(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024) {
    throw syncError("limit", "定时任务超过当前同步上限（512 KiB）");
  }
}
function validateTask(value: unknown, taskId: string): Row {
  const row = record(value);
  exact(row, TASK_COLUMNS);
  if (row.task_id !== taskId || !str(row.title, 80) || !String(row.title).trim()
    || !str(row.instructions, 8_000) || !String(row.instructions).trim()
    || !Number.isInteger(row.hour) || Number(row.hour) < 0 || Number(row.hour) > 23
    || !Number.isInteger(row.minute) || Number(row.minute) < 0 || Number(row.minute) > 59
    || !["notify_important", "enabled", "archived", "unread"].every(key => row[key] === 0 || row[key] === 1)
    || !date(row.last_run_at, true) || !str(row.last_error, 10_000, true)
    || !date(row.created_at) || !date(row.updated_at)) invalid();
  return row;
}
function validateTurns(value: unknown, taskId: string): Row[] {
  if (!Array.isArray(value) || value.length > 1_000) invalid();
  const ids = new Set<string>();
  return value.map(input => {
    const turn = record(input);
    exact(turn, TURN_COLUMNS);
    if (!str(turn.turn_id, 100) || !String(turn.turn_id) || ids.has(String(turn.turn_id))
      || turn.task_id !== taskId || !["user", "assistant", "system"].includes(String(turn.kind))
      || !str(turn.text, 100_000) || !String(turn.text).trim()
      || (turn.important !== 0 && turn.important !== 1) || !date(turn.created_at)) invalid();
    ids.add(String(turn.turn_id));
    return turn;
  });
}

/** Install in the project DB when the personal project opens, before any task mutation. */
export function installScheduleReplication(db: ReplicaDatabase, projectId: string): void {
  if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(projectId)) invalid();
  db.exec(SCHEDULE_TASKS_SCHEMA_SQL);
  const ledger = namespacedReplicaDatabase(db, "schedule");
  const key = (row: string) => `json_array('${projectId}','schedule_task',${row}.task_id)`;
  const mark = (expression: string) => replicaMarkSql(expression).replace(/\breplica_/gu, "schedule_replica_");
  replicaTransaction(db, () => {
    initializeReplica(ledger);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='schedule_task_sync_insert'").get()) return;
    for(const row of db.prepare('SELECT task_id FROM schedule_conversation_tasks ORDER BY task_id').all())queueReplicaChange(ledger,JSON.stringify([projectId,'schedule_task',row.task_id]));
    for (const [event, row] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]]) {
      db.exec(`CREATE TRIGGER schedule_task_sync_${event.toLowerCase()} AFTER ${event} ON schedule_conversation_tasks BEGIN ${mark(key(row))} END`);
    }
    for (const [event, row] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]]) {
      const task = `(SELECT json_array('${projectId}','schedule_task',task_id) FROM schedule_conversation_tasks WHERE task_id=${row}.task_id)`;
      db.exec(`CREATE TRIGGER schedule_turn_sync_${event.toLowerCase()} AFTER ${event} ON schedule_conversation_turns BEGIN ${mark(task)} END`);
    }
  });
}

/** Copies task content and history, never a scheduler lease or runnable job binding. */
export function createScheduleTaskReplica(db: ReplicaDatabase, context: {
  spaceId: string; projectId: string; title: string; authorize(): void;
}): SyncReplicaAdapter {
  const binding = readDatabaseSpace(db);
  if (binding?.kind !== "personal" || binding.spaceId !== context.spaceId) {
    throw syncError("scope", "只允许同步当前个人空间的定时任务");
  }
  const keyId = (key: string): string => {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== context.projectId
      || parts[1] !== "schedule_task" || !str(parts[2], 100) || !parts[2]) invalid();
    return String(parts[2]);
  };
  const ledger = namespacedReplicaDatabase(db, "schedule");
  return createSqliteReplica(ledger, {
    authorize: context.authorize,
    read(key) {
      const id = keyId(key);
      const source = db.prepare("SELECT * FROM schedule_conversation_tasks WHERE task_id=?").get(id) as Row | undefined;
      if (!source) return null;
      const task = Object.fromEntries(TASK_COLUMNS.map(column => [column, source[column]]));
      const turns = db.prepare("SELECT * FROM schedule_conversation_turns WHERE task_id=? ORDER BY created_at,turn_id").all(id)
        .map(row => Object.fromEntries(TURN_COLUMNS.map(column => [column, row[column]])));
      validateTask(task, id);
      validateTurns(turns, id);
      const value = { format: 1, spaceId: context.spaceId, project: { id: context.projectId, title: context.title }, task, turns };
      size(value);
      return value;
    },
    apply(key, value) {
      const id = keyId(key);
      const current = db.prepare("SELECT enabled,job_id FROM schedule_conversation_tasks WHERE task_id=?").get(id) as Row | undefined;
      if (current?.enabled === 1 && current.job_id) {
        throw syncError("busy", "本机定时任务正在启用，不能被远端记录覆盖");
      }
      if (value === null) {
        db.prepare("DELETE FROM schedule_conversation_turns WHERE task_id=?").run(id);
        db.prepare("DELETE FROM schedule_conversation_tasks WHERE task_id=?").run(id);
        return;
      }
      size(value);
      const wire = record(value);
      exact(wire, ["format", "spaceId", "project", "task", "turns"]);
      const project = record(wire.project);
      exact(project, ["id", "title"]);
      if (wire.format !== 1 || wire.spaceId !== context.spaceId || project.id !== context.projectId
        || !str(project.title, 120) || !String(project.title).trim()) invalid();
      const task = validateTask(wire.task, id);
      const turns = validateTurns(wire.turns, id);
      const foreign = db.prepare(`SELECT turn_id FROM schedule_conversation_turns WHERE turn_id IN (${turns.map(() => "?").join(",") || "NULL"}) AND task_id<>?`)
        .all(...turns.map(turn => String(turn.turn_id)), id);
      if (foreign.length) throw syncError("scope", "对话记录标识已属于其他任务");
      const columns = [...TASK_COLUMNS, "job_id"];
      const values = [...TASK_COLUMNS.map(column => column === "enabled" ? 0 : task[column] as string|number|null), null];
      db.prepare(`INSERT INTO schedule_conversation_tasks (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})
        ON CONFLICT(task_id) DO UPDATE SET ${columns.filter(column => column !== "task_id").map(column => `${column}=excluded.${column}`).join(",")}`)
        .run(...values);
      db.prepare("DELETE FROM schedule_conversation_turns WHERE task_id=?").run(id);
      for (const turn of turns) db.prepare(`INSERT INTO schedule_conversation_turns (${TURN_COLUMNS.join(",")})
        VALUES (${TURN_COLUMNS.map(() => "?").join(",")})`).run(...TURN_COLUMNS.map(column => turn[column] as string|number|null));
      context.authorize();
    },
  });
}
