import { canonicalJsonValue as canonicalize } from "@molis-ai/molis-work-plugin-sdk";
import { goalErrors } from "./errors.js";
import { createHash } from "node:crypto";
import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsRepository } from "./repository.js";

export interface GoalsCommandContextOptions {
  now?: () => Date;
}

export class GoalsCommandContext {
  readonly now: () => Date;

  constructor(
    readonly repository: GoalsRepository,
    options: GoalsCommandContextOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  requireBoard(projectId: string): void {
    if (!this.repository.boardExists(projectId)) {
      throw goalErrors["goals.board.not_found"](`这个项目还没有初始化目标资料库: ${projectId}`);
    }
  }

  requireGoal(projectId: string, goalId: string): GoalRecord {
    const goal = this.repository.getGoal(goalId);
    if (!goal || goal.project_id !== projectId) {
      throw goalErrors["goals.not_found"](`Goal 不存在: ${goalId}`);
    }
    return goal;
  }

  requireNonTrashedGoal(projectId: string, goalId: string): GoalRecord {
    const goal = this.requireGoal(projectId, goalId);
    if (goal.trashed_at) {
      throw goalErrors["goals.goal.trashed"]("不能建立或激活指向回收站 Goal 的关系");
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
      throw goalErrors["goals.request.idempotency_key_reused"](`幂等键 ${key} 已被不同请求使用`);
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
