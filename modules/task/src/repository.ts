import type { TaskFrame, TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";
import { defaultTaskErrorFactory, type TaskErrorFactory } from "./errors.js";

type Row = Record<string, unknown>;

export interface TaskSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
}

export interface TaskSqliteDatabase {
  prepare(sql: string): TaskSqliteStatement;
  exec(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export const EMPTY_TASK_FRAME: TaskFrame = {
  camera: { x: 0, y: 0, z: 1 },
  blocks: [],
  expanded: "",
};

export const TASKS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS tasks (
    task_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
    frame_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tasks_board_idx
    ON tasks(board_id, updated_at DESC, task_id);
  CREATE UNIQUE INDEX IF NOT EXISTS tasks_goal_unique
    ON tasks(board_id, goal_id) WHERE goal_id IS NOT NULL;
`;

export function createTasksSchema(db: TaskSqliteDatabase): void {
  db.exec(TASKS_SCHEMA_SQL);
}

export class TaskRepository {
  constructor(
    readonly db: TaskSqliteDatabase,
    private readonly error: TaskErrorFactory = defaultTaskErrorFactory,
  ) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  insert(record: TaskRecord): void {
    this.db.prepare(`
      INSERT INTO tasks (task_id, board_id, title, goal_id, frame_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.task_id,
      record.board_id,
      record.title,
      record.goal_id,
      JSON.stringify(record.frame),
      record.created_at,
      record.updated_at,
    );
  }

  update(record: TaskRecord): void {
    const changed = Number(this.db.prepare(`
      UPDATE tasks
      SET title = ?, goal_id = ?, frame_json = ?, updated_at = ?
      WHERE board_id = ? AND task_id = ?
    `).run(
      record.title,
      record.goal_id,
      JSON.stringify(record.frame),
      record.updated_at,
      record.board_id,
      record.task_id,
    ).changes);
    if (!changed) throw this.error("task_not_found", "找不到这条 Task");
  }

  get(boardId: string, taskId: string): TaskRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM tasks WHERE board_id = ? AND task_id = ?",
    ).get(boardId, taskId) as Row | undefined;
    return row ? mapTask(row, this.error) : null;
  }

  findByGoal(boardId: string, goalId: string): TaskRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM tasks WHERE board_id = ? AND goal_id = ?",
    ).get(boardId, goalId) as Row | undefined;
    return row ? mapTask(row, this.error) : null;
  }

  list(boardId: string): TaskRecord[] {
    return (this.db.prepare(
      "SELECT * FROM tasks WHERE board_id = ? ORDER BY updated_at DESC, task_id",
    ).all(boardId) as Row[]).map((row) => mapTask(row, this.error));
  }
}

function mapTask(row: Row, error: TaskErrorFactory): TaskRecord {
  return {
    board_id: text(row.board_id),
    task_id: text(row.task_id),
    title: text(row.title),
    goal_id: nullableText(row.goal_id),
    frame: parseFrame(row.frame_json, error),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function parseFrame(value: unknown, error: TaskErrorFactory): TaskFrame {
  if (typeof value !== "string" || !value) return { ...EMPTY_TASK_FRAME, blocks: [] };
  try {
    const parsed = JSON.parse(value) as Partial<TaskFrame>;
    const camera = parsed.camera ?? EMPTY_TASK_FRAME.camera;
    return {
      camera: {
        x: Number(camera.x) || 0,
        y: Number(camera.y) || 0,
        z: Number(camera.z) > 0 ? Number(camera.z) : 1,
      },
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      expanded: typeof parsed.expanded === "string" ? parsed.expanded : "",
    };
  } catch {
    throw error("task_frame_invalid", "Task 构图无法读取");
  }
}

function text(value: unknown): string {
  return String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}
