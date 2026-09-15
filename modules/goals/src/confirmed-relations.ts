import { randomUUID } from "node:crypto";
import type { ConfirmedRelationBatch } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";

/** Relation facts for an already-authorized proposal batch. */
export class ConfirmedRelationCommands {
  constructor(private readonly context: GoalsCommandContext) {}

  applyConfirmedRelations(input: ConfirmedRelationBatch): Array<{ relation_id: string }> {
    return this.context.repository.immediate(() => {
      const { board_id: boardId, actor_id: actorId, at } = input;
      const repository = this.context.repository;
      const materialized: Array<{ relation_id: string }> = [];
      for (const relation of input.relations) {
        const reason = relation.reason || input.reason;
        if (relation.action === "deactivate") {
          const current = (relation.relation_id
            ? repository.db.prepare("SELECT relation_id FROM goal_relations WHERE board_id = ? AND relation_id = ? AND state = 'active'").get(boardId, relation.relation_id)
            : repository.db.prepare(`SELECT relation_id FROM goal_relations
                WHERE board_id = ? AND from_goal_id = ? AND to_goal_id = ? AND type = ? AND state = 'active'
                ORDER BY relation_id LIMIT 1`).get(boardId, relation.from_goal_id, relation.to_goal_id, relation.type)) as { relation_id: string } | undefined;
          if (!current) throw this.context.error("goal_tree_proposal.relation_not_active", "要停用的关系已不存在或不再生效，请重新决定这项提案");
          const relationId = current.relation_id;
          repository.db.prepare("UPDATE goal_relations SET state = 'inactive', deactivated_at = ? WHERE relation_id = ?").run(at, relationId);
          repository.appendEvent({ eventId: randomUUID(), boardId, actorId, at, reason,
            type: "relation.deactivated_from_tree_proposal", objectType: "relation", objectId: relationId,
            payload: { proposal_item_id: input.source_item_id } });
          materialized.push({ relation_id: relationId });
          continue;
        }
        if (!relation.type) throw this.context.error("goal_tree_proposal.relation_type_invalid", "新增关系缺少有效类型");
        this.context.requireNonTrashedGoal(boardId, relation.from_goal_id);
        this.context.requireNonTrashedGoal(boardId, relation.to_goal_id);
        const relationId = `relation-${randomUUID()}`;
        repository.db.prepare(`INSERT INTO goal_relations (
          relation_id, board_id, from_goal_id, to_goal_id, type, state, reason, created_by, created_at, deactivated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)`).run(
          relationId, boardId, relation.from_goal_id, relation.to_goal_id, relation.type, reason, actorId, at);
        repository.appendEvent({ eventId: randomUUID(), boardId, actorId, at, reason,
          type: "relation.added_from_tree_proposal", objectType: "relation", objectId: relationId,
          payload: { proposal_item_id: input.source_item_id, from_goal_id: relation.from_goal_id,
            to_goal_id: relation.to_goal_id, type: relation.type } });
        materialized.push({ relation_id: relationId });
      }
      return materialized;
    });
  }
}
