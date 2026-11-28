import type {
  GoalEventRequirementBinding,
  GoalEventRequirementSource,
  GoalRequirementLink,
} from "../contract/goals.js";
import { storedJson } from "../stored-json.js";
import { rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/**
 * `goal_requirement_links` and `goal_event_requirement_bindings`: which requirements Goals hung on a Goal's platform acceptance, where
 * each came from, and the event types bound to it. What a requirement says and whether it is met are the platform's (§10.3).
 */
export class GoalEventRequirementRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertLink(input: { project_id: string; goal_id: string; requirement_id: string; origin: GoalEventRequirementSource | null; created_in_config_version: number; created_at: string }): void {
    this.db.prepare(`
      INSERT INTO goal_requirement_links (goal_id, requirement_id, origin_json, created_in_config_version, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.goal_id, input.requirement_id, input.origin == null ? null : sqliteJson(input.origin), input.created_in_config_version, input.created_at);
  }

  /** The Goal a requirement id is hung on in this project, or null; a requirement id names one requirement of one Goal. */
  linkedGoal(_projectId: string, requirementId: string): string | null {
    const row = this.db.prepare("SELECT goal_id FROM goal_requirement_links WHERE requirement_id = ?").get(requirementId) as Row | undefined;
    return row ? rowText(row.goal_id) : null;
  }

  listLinks(projectId: string, goalId: string): GoalRequirementLink[] {
    const bindings = this.listBindings(projectId, goalId);
    return (this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_requirement_links WHERE goal_id = ? ORDER BY created_at, rowid
    `).all(goalId) as Row[]).map((row) => {
      const id = rowText(row.requirement_id);
      return {
        requirement_id: id,
        origin: storedJson<GoalEventRequirementSource | null>(row, "goal_requirement_links", "origin_json", null),
        bound_type_ids: bindings.filter((binding) => binding.requirement_id === id).map((binding) => binding.type_id),
        created_in_config_version: Number(row.created_in_config_version),
        created_at: rowText(row.created_at),
      };
    });
  }

  insertBinding(input: GoalEventRequirementBinding & {
    project_id: string;
    goal_id: string;
    created_in_config_version: number;
    created_at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_requirement_bindings (
        goal_id, type_id, requirement_id, created_in_config_version, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      input.goal_id,
      input.type_id,
      input.requirement_id,
      input.created_in_config_version,
      input.created_at,
    );
  }

  bindingExists(_projectId: string, goalId: string, typeId: string, requirementId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_event_requirement_bindings
      WHERE goal_id = ? AND type_id = ? AND requirement_id = ?
    `).get(goalId, typeId, requirementId));
  }

  listBindings(_projectId: string, goalId: string): GoalEventRequirementBinding[] {
    return (this.db.prepare(`
      SELECT type_id, requirement_id FROM goal_event_requirement_bindings
      WHERE goal_id = ? ORDER BY type_id, requirement_id
    `).all(goalId) as Row[]).map((row) => ({
      type_id: rowText(row.type_id),
      requirement_id: rowText(row.requirement_id),
    }));
  }
}
