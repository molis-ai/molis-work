import { syncError } from './sync-errors.js';
import type { PluginSyncCollectionDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";

const TASK_COLUMNS = [
  "task_id", "title", "instructions", "hour", "minute", "notify_important",
  "enabled", "archived", "unread", "last_run_at", "last_error", "created_at", "updated_at",
  "repeat", "run_at", "subject_kind", "subject_id",
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
  if (Buffer.byteLength(JSON.stringify(value)) > 100000000) {
    throw syncError("limit", "定时任务超过账号容量上限（100 MB）");
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
    || !date(row.created_at) || !date(row.updated_at)
    || !(row.repeat === "daily" && row.run_at === null || row.repeat === "none" && date(row.run_at))
    || !str(row.subject_kind, 100, true) || !str(row.subject_id, 400, true)
    || (row.subject_kind === null) !== (row.subject_id === null)) invalid();
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

/** Copies task content and history, never a scheduler lease or runnable job binding. */
export function scheduleCollection(projectId: string): PluginSyncCollectionDefinition {
 return {tracking:scheduleTracking,create(db, context) {


  const keyId = (key: string): string => {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== projectId
      || parts[1] !== "schedule_task" || !str(parts[2], 100) || !parts[2]) invalid();
    return String(parts[2]);
  };
  return {
    authorizeKey(key){keyId(key);context.project(projectId);},
    canUpload(key){keyId(key);return context.canUploadProject(projectId);},
    belongsToProject(key, target) { keyId(key); return projectId === target; },
    read(key) {
      const id = keyId(key);
      const source = db.prepare("SELECT * FROM schedule_conversation_tasks WHERE task_id=?").get(id) as Row | undefined;
      if (!source) return null;
      const task = Object.fromEntries(TASK_COLUMNS.map(column => [column, source[column]]));
      const turns = db.prepare("SELECT * FROM schedule_conversation_turns WHERE task_id=? ORDER BY created_at,turn_id").all(id)
        .map(row => Object.fromEntries(TURN_COLUMNS.map(column => [column, row[column]])));
      validateTask(task, id);
      validateTurns(turns, id);
      const value = { format: /* @version format.schedule.portable */ 1, spaceId: context.spaceId, project: { id: projectId, title: context.project(projectId).title }, task, turns };
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
      if (wire.format !== /* @version format.schedule.portable */ 1 || wire.spaceId !== context.spaceId || project.id !== projectId
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
  };
 }};
}

export const scheduleTracking: PluginSyncCollectionDefinition["tracking"] = [
   {table:"schedule_conversation_tasks",key:[{scope:'projectId'},{literal:"schedule_task"},{column:"task_id"}]},
   {table:"schedule_conversation_turns",key:[{scope:'projectId'},{literal:"schedule_task"},{column:"task_id"}]},
];
