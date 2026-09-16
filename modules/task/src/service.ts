import { randomUUID } from "node:crypto";

import type {
  CreateTaskInput,
  OpenTaskForGoalInput,
  SaveTaskFrameInput,
  TaskCommandApi,
  TaskFrame,
  TaskQueryApi,
  TaskRecord,
  UpdateTaskInput,
} from "@molis-ai/molis-work-contracts/modules/task";

import { defaultTaskErrorFactory, type TaskErrorFactory } from "./errors.js";
import { EMPTY_TASK_FRAME, TaskRepository } from "./repository.js";

export interface TaskServiceOptions {
  now?: () => string;
  id?: () => string;
  errorFactory?: TaskErrorFactory;
}

export class TaskService implements TaskQueryApi, TaskCommandApi {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly error: TaskErrorFactory;

  constructor(
    readonly repository: TaskRepository,
    options: TaskServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? (() => `task_${randomUUID()}`);
    this.error = options.errorFactory ?? defaultTaskErrorFactory;
  }

  getTask(boardId: string, taskId: string): TaskRecord | null {
    return this.repository.get(requiredText(boardId, "board_id", this.error), requiredText(taskId, "task_id", this.error));
  }

  listTasks(boardId: string): TaskRecord[] {
    return this.repository.list(requiredText(boardId, "board_id", this.error));
  }

  findTaskByGoal(boardId: string, goalId: string): TaskRecord | null {
    return this.repository.findByGoal(
      requiredText(boardId, "board_id", this.error),
      requiredText(goalId, "goal_id", this.error),
    );
  }

  createTask(input: CreateTaskInput): TaskRecord {
    const boardId = requiredText(input.board_id, "board_id", this.error);
    const title = requiredTitle(input.title, this.error);
    const goalId = optionalGoalId(input.goal_id);
    if (goalId && this.repository.findByGoal(boardId, goalId)) {
      throw this.error("task_goal_conflict", "这个 Goal 已经有一条 Task");
    }
    const at = this.now();
    const record: TaskRecord = {
      board_id: boardId,
      task_id: this.id(),
      title,
      goal_id: goalId,
      frame: cloneFrame(input.frame),
      created_at: at,
      updated_at: at,
    };
    this.repository.immediate(() => this.repository.insert(record));
    return record;
  }

  openTaskForGoal(input: OpenTaskForGoalInput): TaskRecord {
    const boardId = requiredText(input.board_id, "board_id", this.error);
    const goalId = requiredText(input.goal_id, "goal_id", this.error);
    const existing = this.repository.findByGoal(boardId, goalId);
    if (existing) return existing;
    return this.createTask({
      board_id: boardId,
      title: input.title,
      goal_id: goalId,
      frame: input.frame,
    });
  }

  updateTask(input: UpdateTaskInput): TaskRecord {
    const current = this.require(input.board_id, input.task_id);
    const title = input.title === undefined ? current.title : requiredTitle(input.title, this.error);
    const goalId = input.goal_id === undefined ? current.goal_id : optionalGoalId(input.goal_id);
    if (goalId && goalId !== current.goal_id) {
      const occupied = this.repository.findByGoal(current.board_id, goalId);
      if (occupied && occupied.task_id !== current.task_id) {
        throw this.error("task_goal_conflict", "这个 Goal 已经有一条 Task");
      }
    }
    const next: TaskRecord = {
      ...current,
      title,
      goal_id: goalId,
      updated_at: this.now(),
    };
    this.repository.immediate(() => this.repository.update(next));
    return next;
  }

  saveTaskFrame(input: SaveTaskFrameInput): TaskRecord {
    const current = this.require(input.board_id, input.task_id);
    const next: TaskRecord = {
      ...current,
      frame: cloneFrame(input.frame),
      updated_at: this.now(),
    };
    this.repository.immediate(() => this.repository.update(next));
    return next;
  }

  private require(boardId: string, taskId: string): TaskRecord {
    const record = this.getTask(boardId, taskId);
    if (!record) throw this.error("task_not_found", "找不到这条 Task");
    return record;
  }
}

function requiredText(value: string, field: string, error: TaskErrorFactory): string {
  const text = value.trim();
  if (!text) throw error("task_invalid", `${field} 不能为空`);
  return text;
}

function requiredTitle(value: string, error: TaskErrorFactory): string {
  const title = value.trim();
  if (!title) throw error("task_title_required", "先给这条 Task 起个名字");
  if (title.length > 200) throw error("task_title_required", "Task 标题太长");
  return title;
}

function optionalGoalId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const goalId = value.trim();
  return goalId || null;
}

function cloneFrame(frame: TaskFrame | undefined): TaskFrame {
  const source = frame ?? EMPTY_TASK_FRAME;
  return {
    camera: {
      x: Number(source.camera?.x) || 0,
      y: Number(source.camera?.y) || 0,
      z: Number(source.camera?.z) > 0 ? Number(source.camera?.z) : 1,
    },
    blocks: Array.isArray(source.blocks) ? source.blocks.map((block) => ({ ...block })) : [],
    expanded: typeof source.expanded === "string" ? source.expanded : "",
  };
}
