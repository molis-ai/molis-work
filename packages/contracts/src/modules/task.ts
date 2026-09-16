import type { ContractDescriptor } from "../platform/package.js";

export const modulesTaskContract = {
  contractId: "io.molis.work.module.task.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/task.md",
} as const satisfies ContractDescriptor;

export interface TaskFrameCamera {
  x: number;
  y: number;
  z: number;
}

export interface TaskFrameBlock {
  id: string;
  kind: string;
  itemId: string;
  itemRef?: string;
  entryId?: string;
  title: string;
  caption: string;
  x: number;
  y: number;
  reading?: Readonly<Record<string, string>> | null;
}

export interface TaskFrame {
  camera: TaskFrameCamera;
  blocks: readonly TaskFrameBlock[];
  expanded: string;
}

export interface TaskRecord {
  board_id: string;
  task_id: string;
  title: string;
  goal_id: string | null;
  frame: TaskFrame;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  board_id: string;
  title: string;
  goal_id?: string | null;
  frame?: TaskFrame;
}

export interface OpenTaskForGoalInput {
  board_id: string;
  goal_id: string;
  title: string;
  frame?: TaskFrame;
}

export interface UpdateTaskInput {
  board_id: string;
  task_id: string;
  title?: string;
  goal_id?: string | null;
}

export interface SaveTaskFrameInput {
  board_id: string;
  task_id: string;
  frame: TaskFrame;
}

export interface TaskQueryApi {
  getTask(boardId: string, taskId: string): TaskRecord | null;
  listTasks(boardId: string): TaskRecord[];
  findTaskByGoal(boardId: string, goalId: string): TaskRecord | null;
}

export interface TaskCommandApi {
  createTask(input: CreateTaskInput): TaskRecord;
  openTaskForGoal(input: OpenTaskForGoalInput): TaskRecord;
  updateTask(input: UpdateTaskInput): TaskRecord;
  saveTaskFrame(input: SaveTaskFrameInput): TaskRecord;
}

export interface TaskApplicationApi {
  query: TaskQueryApi;
  commands: TaskCommandApi;
}
