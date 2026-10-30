import type {
  GoalEventExtraRequirement,
  GoalEventRequirementBinding,
  GoalEventRequirementSource,
} from "../contract/goals.js";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** `goal_event_requirements` and `goal_event_requirement_bindings`: the extra requirements of a Goal and what they bind to. */
export class GoalEventRequirementRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertRequirement(input: GoalEventExtraRequirement & { project_id: string; goal_id: string; created_at: string }): void {
    this.db.prepare(`
      INSERT INTO goal_event_requirements (
        requirement_id, project_id, goal_id, statement, bound_type_id,
        created_at, created_in_config_version, actor_id, source_json,
        human_decision_required, current_status, revision, support_valid_after_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.requirement_id,
      input.project_id,
      input.goal_id,
      input.statement,
      input.bound_type_id ?? null,
      input.created_at,
      input.created_in_config_version,
      input.actor_id,
      input.source == null ? null : sqliteJson(input.source),
      input.human_decision_required ? 1 : 0,
      input.current_status,
      input.revision,
      input.support_valid_after_seq,
    );
  }

  updateRequirementCurrent(input: {
    requirementId: string;
    statement: string;
    humanDecisionRequired: boolean;
    currentStatus: GoalEventExtraRequirement["current_status"];
    revision: number;
    supportValidAfterSeq: number;
  }): void {
    this.db.prepare(`
      UPDATE goal_event_requirements
      SET statement = ?, human_decision_required = ?, current_status = ?, revision = ?, support_valid_after_seq = ?
      WHERE requirement_id = ?
    `).run(
      input.statement,
      input.humanDecisionRequired ? 1 : 0,
      input.currentStatus,
      input.revision,
      input.supportValidAfterSeq,
      input.requirementId,
    );
  }

  getExtraRequirement(requirementId: string): (GoalEventExtraRequirement & { project_id: string; goal_id: string }) | null {
    const row = this.db.prepare("SELECT * FROM goal_event_requirements WHERE requirement_id = ?")
      .get(requirementId) as Row | undefined;
    return row ? { ...mapRequirement(row), project_id: rowText(row.project_id), goal_id: rowText(row.goal_id) } : null;
  }

  listExtraRequirements(projectId: string, goalId: string): GoalEventExtraRequirement[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_requirements WHERE project_id = ? AND goal_id = ? ORDER BY requirement_id
    `).all(projectId, goalId) as Row[]).map(mapRequirement);
  }

  insertBinding(input: GoalEventRequirementBinding & {
    project_id: string;
    goal_id: string;
    created_in_config_version: number;
    created_at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_requirement_bindings (
        project_id, goal_id, type_id, requirement_id, created_in_config_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.project_id,
      input.goal_id,
      input.type_id,
      input.requirement_id,
      input.created_in_config_version,
      input.created_at,
    );
  }

  bindingExists(projectId: string, goalId: string, typeId: string, requirementId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_event_requirement_bindings
      WHERE project_id = ? AND goal_id = ? AND type_id = ? AND requirement_id = ?
    `).get(projectId, goalId, typeId, requirementId));
  }

  listBindings(projectId: string, goalId: string): GoalEventRequirementBinding[] {
    return (this.db.prepare(`
      SELECT type_id, requirement_id FROM goal_event_requirement_bindings
      WHERE project_id = ? AND goal_id = ? ORDER BY type_id, requirement_id
    `).all(projectId, goalId) as Row[]).map((row) => ({
      type_id: rowText(row.type_id),
      requirement_id: rowText(row.requirement_id),
    }));
  }
}

function mapRequirement(row: Row): GoalEventExtraRequirement {
  const source = row.source_json == null ? null : rowJson<GoalEventRequirementSource | null>(row.source_json, null);
  return {
    requirement_id: rowText(row.requirement_id),
    statement: rowText(row.statement),
    bound_type_id: row.bound_type_id == null ? undefined : rowText(row.bound_type_id),
    created_in_config_version: Number(row.created_in_config_version),
    actor_id: rowText(row.actor_id),
    human_decision_required: Number(row.human_decision_required) === 1,
    current_status: rowText(row.current_status || "active") as GoalEventExtraRequirement["current_status"],
    revision: Number(row.revision ?? 1),
    support_valid_after_seq: Number(row.support_valid_after_seq ?? 0),
    ...(source ? { source } : {}),
  };
}
