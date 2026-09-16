import type { TaskApplicationApi, TaskCommandApi, TaskQueryApi } from "@molis-ai/molis-work-contracts/modules/task";

import { TaskError, defaultTaskErrorFactory, type TaskErrorFactory } from "./errors.js";
import { migrateTasksSchema, TASKS_MIGRATION_ID } from "./migrations.js";
import {
  createTasksSchema,
  EMPTY_TASK_FRAME,
  TASKS_SCHEMA_SQL,
  TaskRepository,
  type TaskSqliteDatabase,
} from "./repository.js";
import { TaskService, type TaskServiceOptions } from "./service.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-task",
  packagePath: "modules/task",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/task",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["task.query.v1", "task.command.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface TaskModuleOptions extends TaskServiceOptions {
  db: TaskSqliteDatabase;
}

export class TaskModule implements TaskApplicationApi {
  readonly repository: TaskRepository;
  readonly service: TaskService;
  readonly query: TaskQueryApi;
  readonly commands: TaskCommandApi;

  constructor(options: TaskModuleOptions) {
    this.repository = new TaskRepository(options.db, options.errorFactory ?? defaultTaskErrorFactory);
    this.service = new TaskService(this.repository, options);
    this.query = this.service;
    this.commands = this.service;
  }
}

export {
  TaskError,
  defaultTaskErrorFactory,
  type TaskErrorFactory,
};
export {
  createTasksSchema,
  EMPTY_TASK_FRAME,
  TASKS_SCHEMA_SQL,
  TaskRepository,
  type TaskSqliteDatabase,
};
export { migrateTasksSchema, TASKS_MIGRATION_ID };
export { TaskService, type TaskServiceOptions };
