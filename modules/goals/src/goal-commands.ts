import { randomUUID } from "node:crypto";

import type {
  AddGoalRelationInput,
  CreateGoalInput,
  GoalRecord,
  GoalRelationRecord,
  GoalsActorWrite,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext, requestHash } from "./command-support.js";
import { insertInitialGoalContract } from "./goal-contract-records.js";

export interface GoalRelationGraphIssue {
  code: string;
  message: string;
}

export interface GoalsCommandLifecycleHooks {
  validateRelationGraph?(boardId: string, input: AddGoalRelationInput): GoalRelationGraphIssue | null;
}

export class GoalCommands {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly lifecycle: GoalsCommandLifecycleHooks,
  ) {}

  createGoal(
    boardId: string,
    input: CreateGoalInput,
    write: GoalsActorWrite,
  ): { goal: GoalRecord; replayed: boolean; observed_event_cursor: number } {
    this.validateGoalInput(input);
    const hash = requestHash({ board_id: boardId, goal: input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{ goal: GoalRecord; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "create_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      this.context.requireBoard(boardId);
      const goalId = input.goal_id?.trim() || `goal-${randomUUID()}`;
      if (repository.getGoal(goalId)) {
        throw this.context.error("goal.exists", `Goal 已存在: ${goalId}`);
      }
      const at = this.context.now().toISOString();
      const definitionState = input.definition_state ?? "draft";
      const decompositionState = input.decomposition_state ?? "abstract";
      insertInitialGoalContract(this.context, {
        board_id: boardId, goal_id: goalId, goal: input, actor_id: write.actor_id, at,
        source_proposal_id: null, revision_reason: "创建 Goal Contract revision 1",
      });
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "goal.created",
        objectType: "goal",
        objectId: goalId,
        reason: write.reason ?? "创建新 Goal",
        payload: { definition_state: definitionState, decomposition_state: decompositionState },
        at,
      });
      const goal = repository.getGoal(goalId);
      if (!goal) throw new Error("Goal 写入后无法读取");
      const outcome = { goal, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "create_goal",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  addRelation(
    boardId: string,
    input: AddGoalRelationInput,
    write: GoalsActorWrite,
  ): { relation_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ board_id: boardId, ...input });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{ relation_id: string; observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "add_relation",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireNonTrashedGoal(boardId, input.from_goal_id);
      this.context.requireNonTrashedGoal(boardId, input.to_goal_id);
      if (input.from_goal_id === input.to_goal_id) {
        throw this.context.error("relation.self_reference", "Goal 不能关联到自身");
      }
      if ((input.state ?? "active") === "active" && ["part_of", "depends_on"].includes(input.type)) {
        const issue = this.lifecycle.validateRelationGraph?.(boardId, input);
        if (issue) throw this.context.error(issue.code, issue.message);
      }
      const relationReason = input.reason.trim();
      if (!relationReason) {
        throw this.context.error("relation.reason_required", "关系必须说明建立原因");
      }
      const alreadyActive = repository.db.prepare(`
        SELECT relation_id FROM goal_relations
        WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ?
          AND type = ? AND state = ? LIMIT 1
      `).get(
        boardId,
        input.from_goal_id,
        input.to_goal_id,
        input.type,
        input.state ?? "active",
      );
      if (alreadyActive) {
        throw this.context.error(
          "relation.already_exists",
          input.state === "proposed" ? "这条待确认关系已经存在" : "这条关系已经生效",
        );
      }
      const relationId = `relation-${randomUUID()}`;
      const at = this.context.now().toISOString();
      repository.db.prepare(`
        INSERT INTO goal_relations (
          relation_id, board_id, from_goal_id, to_goal_id, type, state,
          reason, created_by, created_at, deactivated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        relationId,
        boardId,
        input.from_goal_id,
        input.to_goal_id,
        input.type,
        input.state ?? "active",
        relationReason,
        write.actor_id,
        at,
      );
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.added",
        objectType: "relation",
        objectId: relationId,
        reason: relationReason,
        payload: { ...input, reason: relationReason },
        at,
      });
      const outcome = { relation_id: relationId, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "add_relation",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  deactivateRelation(
    boardId: string,
    input: { relation_id: string; reason: string },
    write: GoalsActorWrite,
  ): { relation: GoalRelationRecord; replayed: boolean; observed_event_cursor: number } {
    const reasonText = input.reason.trim();
    if (!reasonText) {
      throw this.context.error(
        "relation.deactivation_reason_required",
        "解除关系时必须说明原因",
      );
    }
    const hash = requestHash({ board_id: boardId, relation_id: input.relation_id, reason: reasonText });
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<{
        relation: GoalRelationRecord;
        observed_event_cursor: number;
      }>(boardId, write.actor_id, "deactivate_relation", write.idempotency_key, hash);
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(boardId);
      const relation = repository.getRelation(boardId, input.relation_id);
      if (!relation) {
        throw this.context.error("relation.not_found", `找不到关系: ${input.relation_id}`);
      }
      if (relation.state !== "active") {
        throw this.context.error("relation.not_active", "只有正在生效的关系可以解除");
      }
      const at = this.context.now().toISOString();
      repository.db.prepare(`
        UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?
      `).run(at, input.relation_id);
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "relation.deactivated",
        objectType: "relation",
        objectId: input.relation_id,
        reason: reasonText,
        payload: {
          from_goal_id: relation.from_goal_id,
          to_goal_id: relation.to_goal_id,
          type: relation.type,
        },
        at,
      });
      const updated = repository.getRelation(boardId, input.relation_id);
      if (!updated) throw new Error("关系停用后无法读取");
      const outcome = { relation: updated, observed_event_cursor: cursor };
      this.context.remember(
        boardId,
        write.actor_id,
        "deactivate_relation",
        write.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  validateGoalInput(input: CreateGoalInput): void {
    if (!input.title?.trim()) {
      throw this.context.error("goal.title_required", "Goal 必须有名称");
    }
    for (const criterion of input.acceptance_criteria) {
      if (!criterion.statement.trim() || !criterion.pass_condition.trim()) {
        throw this.context.error(
          "goal.acceptance_invalid",
          "每条验收条件都要说明检查什么和怎样算通过",
        );
      }
    }
  }
}
