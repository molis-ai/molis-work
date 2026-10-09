import type {
  GoalDependencyFact,
  GoalPolicyHistoryRecord,
  GoalReplacementFact,
  GoalWorkEventLinkRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { rowJson, rowText, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** Goal-owned reads consumed by the Web rule history and Runtime work gates. */
export class GoalQueryFactsRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  listProjectIds(): string[] {
    return (this.db.prepare("SELECT project_id FROM boards ORDER BY project_id").all() as Array<{ project_id: string }>).map(row => row.project_id);
  }

  listPolicyHistory(projectId: string): GoalPolicyHistoryRecord[] {
    return (this.db.prepare("SELECT * FROM policy_bindings WHERE project_id = ? ORDER BY created_at, policy_binding_id")
      .all(projectId) as Row[]).map(row => ({
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

  listWorkEventGoalLinks(projectId: string): GoalWorkEventLinkRecord[] {
    return (this.db.prepare("SELECT event_id, goal_id FROM goal_work_events WHERE project_id = ? ORDER BY journal_seq")
      .all(projectId) as Row[]).map(row => ({ goal_id: rowText(row.goal_id), event_id: rowText(row.event_id) }));
  }

  listDependencies(projectId: string, goalId: string): GoalDependencyFact[] {
    return (this.db.prepare(`
      SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
      FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id
      WHERE r.project_id = ? AND r.from_goal_id = ?
        AND r.type = 'depends_on' AND r.state = 'active'
      ORDER BY g.goal_id
    `).all(projectId, goalId) as Row[]).map(row => ({
      goal_id: rowText(row.goal_id), title: rowText(row.title),
      fulfillment_state: rowText(row.fulfillment_state) as GoalDependencyFact["fulfillment_state"],
      validity_state: rowText(row.validity_state) as GoalDependencyFact["validity_state"],
    }));
  }

  activeReplacement(projectId: string, goalId: string): GoalReplacementFact | null {
    const row = this.db.prepare(`
      SELECT relation.relation_id, replacement.goal_id AS replacement_goal_id,
        replacement.title AS replacement_goal_title
      FROM goal_relations relation JOIN goals replacement
        ON replacement.project_id = relation.project_id AND replacement.goal_id = relation.from_goal_id
      WHERE relation.project_id = ? AND relation.to_goal_id = ?
        AND relation.type = 'replaces' AND relation.state = 'active'
      ORDER BY relation.created_at DESC, relation.relation_id DESC LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    return row ? { relation_id: rowText(row.relation_id),
      replacement_goal_id: rowText(row.replacement_goal_id), replacement_goal_title: rowText(row.replacement_goal_title) } : null;
  }
}
