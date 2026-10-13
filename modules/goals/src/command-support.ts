import { createHash } from "node:crypto";

import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandError, type GoalsErrorFactory } from "./errors.js";
import { GoalsRepository } from "./repository.js";

export interface GoalsCommandContextOptions {
  now?: () => Date;
  errorFactory?: GoalsErrorFactory;
}

export class GoalsCommandContext {
  readonly now: () => Date;
  private readonly errorFactory: GoalsErrorFactory;

  constructor(
    readonly repository: GoalsRepository,
    options: GoalsCommandContextOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.errorFactory = options.errorFactory ?? ((code, message, details) =>
      new GoalsCommandError(code, message, details));
  }

  error(code: string, message: string, details?: Record<string, unknown>): Error {
    return this.errorFactory(code, message, details);
  }

  requireBoard(projectId: string): void {
    if (!this.repository.boardExists(projectId)) {
      throw this.error("board.not_found", `这个项目还没有初始化目标资料库: ${projectId}`);
    }
  }

  requireGoal(projectId: string, goalId: string): GoalRecord {
    const goal = this.repository.getGoal(goalId);
    if (!goal || goal.project_id !== projectId) {
      throw this.error("goal.not_found", `Goal 不存在: ${goalId}`);
    }
    return goal;
  }

  requireNonTrashedGoal(projectId: string, goalId: string): GoalRecord {
    const goal = this.requireGoal(projectId, goalId);
    if (goal.trashed_at) {
      throw this.error("goal.trashed", "不能建立或激活指向回收站 Goal 的关系");
    }
    return goal;
  }

  replay<T>(
    projectId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
  ): T | null {
    const existing = this.repository.getIdempotency(projectId, actorId, operation, key);
    if (!existing) return null;
    if (existing.request_hash !== hash) {
      throw this.error(
        "request.idempotency_key_reused",
        `幂等键 ${key} 已被不同请求使用`,
      );
    }
    return existing.outcome as T;
  }

  remember(
    projectId: string,
    actorId: string,
    operation: string,
    key: string,
    hash: string,
    outcome: unknown,
    at: string,
  ): void {
    this.repository.putIdempotency({
      projectId,
      actorId,
      operation,
      key,
      requestHash: hash,
      outcome,
      at,
    });
  }
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}
