import { randomUUID } from "node:crypto";

import type {
  GoalArchiveResult,
  GoalRecord,
  GoalTrashResult,
  GoalsActorWrite,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext, requestHash } from "./command-support.js";
import type { GoalArchiveHooks } from "./lifecycle-ports.js";
import { rowText } from "./repository.js";

type Row = Record<string, unknown>;

export class GoalArchiveCommands {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly hooks: GoalArchiveHooks,
  ) {}

  setArchived(
    boardId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalArchiveResult {
    const hash = requestHash({ board_id: boardId, ...input });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<GoalArchiveResult, "replayed">>(
        boardId,
        write.actor_id,
        "set_goal_archived",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.context.requireGoal(boardId, input.goal_id);
      if (goal.trashed_at) {
        throw this.context.error("goal.trashed", "回收站中的 Goal 需要先恢复，才能变更归档状态");
      }
      if (input.archived && goal.fulfillment_state !== "satisfied") {
        throw this.context.error("goal.not_satisfied", "只有已完成的 Goal 可以归档");
      }
      if (Boolean(goal.archived_at) === input.archived) {
        throw this.context.error(
          "goal.archive_state_unchanged",
          input.archived ? "Goal 已经归档" : "Goal 当前未归档",
        );
      }
      const now = this.context.now().toISOString();
      this.context.repository.db
        .prepare("UPDATE goals SET archived_at = ?, archived_by = ?, updated_at = ? WHERE goal_id = ?")
        .run(input.archived ? now : null, input.archived ? write.actor_id : null, now, input.goal_id);
      const activeGoalCleared = input.archived
        ? this.context.repository.clearActiveGoalIfMatches(boardId, input.goal_id, now)
        : false;
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: input.archived ? "goal.archived" : "goal.restored",
        objectType: "goal",
        objectId: input.goal_id,
        reason: input.reason,
        payload: { active_goal_cleared: activeGoalCleared },
        at: now,
      });
      const outcome = {
        goal: this.context.requireGoal(boardId, input.goal_id),
        active_goal_cleared: activeGoalCleared,
        observed_event_cursor: cursor,
      };
      this.context.remember(
        boardId,
        write.actor_id,
        "set_goal_archived",
        write.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  setTrashed(
    boardId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalTrashResult & { replayed: boolean; observed_event_cursor: number } {
    const reasonText = input.reason.trim();
    if (!reasonText) {
      throw this.context.error("goal.trash_reason_required", "移入或恢复回收站时必须说明原因");
    }
    const hash = requestHash({ board_id: boardId, ...input, reason: reasonText });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<GoalTrashResult & { observed_event_cursor: number }>(
        boardId,
        write.actor_id,
        "set_goal_trashed",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const goal = this.context.requireGoal(boardId, input.goal_id);
      const emptyResult = (status: GoalTrashResult["status"]): GoalTrashResult => ({
        status,
        goal,
        active_goal_cleared: false,
        deactivated_relation_ids: [],
        restored_relation_ids: [],
        pending_relation_ids: [],
        blocking_claim_ids: [],
        blocking_run_ids: [],
      });
      if (input.trashed && goal.trashed_at) {
        const at = this.context.now().toISOString();
        const outcome = {
          ...emptyResult("already_trashed"),
          observed_event_cursor: this.context.repository.eventCursor(boardId),
        };
        this.context.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, at);
        return { ...outcome, replayed: false };
      }
      if (!input.trashed && !goal.trashed_at) {
        const at = this.context.now().toISOString();
        const outcome = {
          ...emptyResult("already_active"),
          observed_event_cursor: this.context.repository.eventCursor(boardId),
        };
        this.context.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, at);
        return { ...outcome, replayed: false };
      }

      const now = this.context.now().toISOString();
      if (input.trashed) {
        const blocking = this.hooks.blockingWork?.(boardId, input.goal_id, now) ?? {
          claim_ids: [],
          run_ids: [],
        };
        if (blocking.claim_ids.length > 0 || blocking.run_ids.length > 0) {
          const outcome = {
            ...emptyResult("blocked"),
            blocking_claim_ids: blocking.claim_ids,
            blocking_run_ids: blocking.run_ids,
            observed_event_cursor: this.context.repository.eventCursor(boardId),
          };
          this.context.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
          return { ...outcome, replayed: false };
        }
        const activeRelations = this.context.repository.db.prepare(`
          SELECT relation_id FROM goal_relations
          WHERE board_id = ? AND state = 'active'
            AND (from_goal_id = ? OR to_goal_id = ?)
          ORDER BY relation_id
        `).all(boardId, input.goal_id, input.goal_id) as Row[];
        const trashRecordId = `trash-${randomUUID()}`;
        this.context.repository.db.prepare(`
          INSERT INTO goal_trash_records (
            trash_record_id, board_id, goal_id, trashed_at, trashed_by, trash_reason,
            restored_at, restored_by, restore_reason
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
        `).run(trashRecordId, boardId, input.goal_id, now, write.actor_id, reasonText);
        this.context.repository.db.prepare(`
          UPDATE goals SET trashed_at = ?, trashed_by = ?, updated_at = ?
          WHERE board_id = ? AND goal_id = ?
        `).run(now, write.actor_id, now, boardId, input.goal_id);
        const deactivatedRelationIds: string[] = [];
        for (const relation of activeRelations) {
          const relationId = rowText(relation.relation_id);
          this.context.repository.db
            .prepare("UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?")
            .run(now, relationId);
          this.context.repository.db.prepare(`
            INSERT INTO goal_trash_relation_records (
              trash_record_id, relation_id, prior_state, deactivated_at, restored_at
            ) VALUES (?, ?, 'active', ?, NULL)
          `).run(trashRecordId, relationId, now);
          deactivatedRelationIds.push(relationId);
        }
        const activeGoalCleared = this.context.repository.clearActiveGoalIfMatches(boardId, input.goal_id, now);
        const cursor = this.context.repository.appendEvent({
          eventId: randomUUID(),
          boardId,
          actorId: write.actor_id,
          type: "goal.trashed",
          objectType: "goal",
          objectId: input.goal_id,
          reason: reasonText,
          payload: {
            trash_record_id: trashRecordId,
            deactivated_relation_ids: deactivatedRelationIds,
            active_goal_cleared: activeGoalCleared,
          },
          at: now,
        });
        const outcome = {
          status: "trashed" as const,
          goal: this.context.requireGoal(boardId, input.goal_id),
          active_goal_cleared: activeGoalCleared,
          deactivated_relation_ids: deactivatedRelationIds,
          restored_relation_ids: [],
          pending_relation_ids: [],
          blocking_claim_ids: [],
          blocking_run_ids: [],
          observed_event_cursor: cursor,
        };
        this.context.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
        return { ...outcome, replayed: false };
      }

      const trashRecord = this.context.repository.db.prepare(`
        SELECT trash_record_id FROM goal_trash_records
        WHERE board_id = ? AND goal_id = ? AND restored_at IS NULL
        ORDER BY trashed_at DESC, trash_record_id DESC LIMIT 1
      `).get(boardId, input.goal_id) as Row | undefined;
      if (!trashRecord) {
        throw this.context.error("goal.trash_record_missing", "回收站 Goal 缺少可恢复的删除记录");
      }
      this.context.repository.db.prepare(`
        UPDATE goals SET trashed_at = NULL, trashed_by = NULL, updated_at = ?
        WHERE board_id = ? AND goal_id = ?
      `).run(now, boardId, input.goal_id);
      this.context.repository.db.prepare(`
        UPDATE goal_trash_records
        SET restored_at = ?, restored_by = ?, restore_reason = ?
        WHERE trash_record_id = ?
      `).run(now, write.actor_id, reasonText, rowText(trashRecord.trash_record_id));
      const recoverableRelations = this.context.repository.db.prepare(`
        SELECT DISTINCT relation.relation_id, relation.from_goal_id, relation.to_goal_id
        FROM goal_relations relation
        JOIN goal_trash_relation_records record ON record.relation_id = relation.relation_id
        WHERE relation.board_id = ?
          AND (relation.from_goal_id = ? OR relation.to_goal_id = ?)
          AND relation.state = 'inactive'
          AND record.prior_state = 'active'
          AND record.restored_at IS NULL
        ORDER BY relation.relation_id
      `).all(boardId, input.goal_id, input.goal_id) as Row[];
      const restoredRelationIds: string[] = [];
      const pendingRelationIds: string[] = [];
      for (const relation of recoverableRelations) {
        const relationId = rowText(relation.relation_id);
        const availableEndpoints = this.context.repository.db.prepare(`
          SELECT goal_id FROM goals
          WHERE board_id = ? AND goal_id IN (?, ?) AND trashed_at IS NULL
        `).all(boardId, rowText(relation.from_goal_id), rowText(relation.to_goal_id)) as Row[];
        if (availableEndpoints.length !== 2) {
          pendingRelationIds.push(relationId);
          continue;
        }
        this.context.repository.db
          .prepare("UPDATE goal_relations SET state = 'active', deactivated_at = NULL WHERE relation_id = ?")
          .run(relationId);
        this.context.repository.db
          .prepare("UPDATE goal_trash_relation_records SET restored_at = ? WHERE relation_id = ? AND restored_at IS NULL")
          .run(now, relationId);
        restoredRelationIds.push(relationId);
      }
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId,
        actorId: write.actor_id,
        type: "goal.restored_from_trash",
        objectType: "goal",
        objectId: input.goal_id,
        reason: reasonText,
        payload: {
          trash_record_id: rowText(trashRecord.trash_record_id),
          restored_relation_ids: restoredRelationIds,
          pending_relation_ids: pendingRelationIds,
        },
        at: now,
      });
      const outcome = {
        status: "restored" as const,
        goal: this.context.requireGoal(boardId, input.goal_id),
        active_goal_cleared: false,
        deactivated_relation_ids: [],
        restored_relation_ids: restoredRelationIds,
        pending_relation_ids: pendingRelationIds,
        blocking_claim_ids: [],
        blocking_run_ids: [],
        observed_event_cursor: cursor,
      };
      this.context.remember(boardId, write.actor_id, "set_goal_trashed", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }

  listTrashed(boardId: string): GoalRecord[] {
    this.context.requireBoard(boardId);
    return this.context.repository.listGoals(boardId).filter((goal) => goal.trashed_at !== null);
  }

}

