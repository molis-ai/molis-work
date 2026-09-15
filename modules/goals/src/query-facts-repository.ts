import type {
  GoalDependencyFact,
  GoalPolicyHistoryRecord,
  GoalReplacementFact,
  RiskRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { mapRisk, rowJson, rowText, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** Goal-owned reads consumed by the Web rule history and Runtime work gates. */
export class GoalQueryFactsRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  listBoardIds(): string[] {
    return (this.db.prepare("SELECT board_id FROM boards ORDER BY board_id").all() as Array<{ board_id: string }>).map(row => row.board_id);
  }

  listPolicyHistory(boardId: string): GoalPolicyHistoryRecord[] {
    return (this.db.prepare("SELECT * FROM policy_bindings WHERE board_id = ? ORDER BY created_at, policy_binding_id")
      .all(boardId) as Row[]).map(row => ({
      policy_binding_id: rowText(row.policy_binding_id),
      goal_id: row.goal_id == null ? null : rowText(row.goal_id),
      scope: rowText(row.scope) as GoalPolicyHistoryRecord["scope"],
      policy: rowJson(row.policy_json, {}),
      state: rowText(row.state) as GoalPolicyHistoryRecord["state"],
      created_by: rowText(row.created_by),
      reason: rowText(row.reason),
      created_at: rowText(row.created_at),
    }));
  }

  listDependencies(boardId: string, goalId: string): GoalDependencyFact[] {
    return (this.db.prepare(`
      SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
      FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id
      WHERE r.board_id = ? AND r.from_goal_id = ?
        AND r.type = 'depends_on' AND r.state = 'active'
      ORDER BY g.goal_id
    `).all(boardId, goalId) as Row[]).map(row => ({
      goal_id: rowText(row.goal_id), title: rowText(row.title),
      fulfillment_state: rowText(row.fulfillment_state) as GoalDependencyFact["fulfillment_state"],
      validity_state: rowText(row.validity_state) as GoalDependencyFact["validity_state"],
    }));
  }

  listOpenGoalRisks(boardId: string, goalId: string): RiskRecord[] {
    return (this.db.prepare(`
      SELECT r.* FROM risks r
      JOIN goal_risks gr ON gr.risk_id = r.risk_id
      JOIN goals g ON g.goal_id = gr.goal_id
      WHERE g.board_id = ? AND gr.goal_id = ? AND r.state IN ('open', 'triggered')
      ORDER BY r.risk_id
    `).all(boardId, goalId) as Row[]).map(mapRisk);
  }

  activeReplacement(boardId: string, goalId: string): GoalReplacementFact | null {
    const row = this.db.prepare(`
      SELECT relation.relation_id, replacement.goal_id AS replacement_goal_id,
        replacement.title AS replacement_goal_title
      FROM goal_relations relation JOIN goals replacement
        ON replacement.board_id = relation.board_id AND replacement.goal_id = relation.from_goal_id
      WHERE relation.board_id = ? AND relation.to_goal_id = ?
        AND relation.type = 'replaces' AND relation.state = 'active'
      ORDER BY relation.created_at DESC, relation.relation_id DESC LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    return row ? { relation_id: rowText(row.relation_id),
      replacement_goal_id: rowText(row.replacement_goal_id), replacement_goal_title: rowText(row.replacement_goal_title) } : null;
  }
}
