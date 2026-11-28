import { libraryPartition } from "./library-partition.js";
import type {
  GoalDependencyFact,
  GoalReplacementFact,
  GoalWorkEventLinkRecord,
} from "../contract/goals.js";
import { rowText, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** Goal-owned relations and event links consumed by the Runtime work gates. */
export class GoalQueryFactsRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  listProjectIds(): string[] {
    return this.db.prepare("SELECT 1 AS found FROM boards").get() ? [libraryPartition(this.db)] : [];
  }

  listWorkEventGoalLinks(_projectId: string): GoalWorkEventLinkRecord[] {
    return (this.db.prepare("SELECT event_id, goal_id FROM goal_work_events ORDER BY journal_seq")
      .all() as Row[]).map(row => ({ goal_id: rowText(row.goal_id), event_id: rowText(row.event_id) }));
  }

  listDependencies(_projectId: string, goalId: string): GoalDependencyFact[] {
    return (this.db.prepare(`
      SELECT g.goal_id, g.title, g.fulfillment_state, g.validity_state
      FROM goal_relations r JOIN goals g ON g.goal_id = r.to_goal_id
      WHERE r.from_goal_id = ?
        AND r.type = 'depends_on' AND r.state = 'active'
      ORDER BY g.goal_id
    `).all(goalId) as Row[]).map(row => ({
      goal_id: rowText(row.goal_id), title: rowText(row.title),
      fulfillment_state: rowText(row.fulfillment_state) as GoalDependencyFact["fulfillment_state"],
      validity_state: rowText(row.validity_state) as GoalDependencyFact["validity_state"],
    }));
  }

  activeReplacement(_projectId: string, goalId: string): GoalReplacementFact | null {
    const row = this.db.prepare(`
      SELECT relation.relation_id, replacement.goal_id AS replacement_goal_id,
        replacement.title AS replacement_goal_title
      FROM goal_relations relation JOIN goals replacement
        ON replacement.goal_id = relation.from_goal_id
      WHERE relation.to_goal_id = ?
        AND relation.type = 'replaces' AND relation.state = 'active'
      ORDER BY relation.created_at DESC, relation.relation_id DESC LIMIT 1
    `).get(goalId) as Row | undefined;
    return row ? { relation_id: rowText(row.relation_id),
      replacement_goal_id: rowText(row.replacement_goal_id), replacement_goal_title: rowText(row.replacement_goal_title) } : null;
  }
}
