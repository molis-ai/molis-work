import type {
  GoalEventAdoptedPlanningRef,
  GoalEventTypeDefinition,
} from "../contract/goals.js";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export interface GoalEventConfigRow {
  project_id: string;
  goal_id: string;
  current_version: number;
  updated_at: string;
  updated_by: string;
}

/** `goal_event_configs`, `goal_event_config_versions` and `goal_event_types`: a Goal's event configuration and its event types. */
export class GoalEventConfigRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  getConfig(projectId: string, goalId: string): GoalEventConfigRow | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_configs WHERE project_id = ? AND goal_id = ?",
    ).get(projectId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      project_id: rowText(row.project_id),
      goal_id: rowText(row.goal_id),
      current_version: Number(row.current_version),
      updated_at: rowText(row.updated_at),
      updated_by: rowText(row.updated_by),
    };
  }

  upsertConfig(row: GoalEventConfigRow): void {
    this.db.prepare(`
      INSERT INTO goal_event_configs (project_id, goal_id, current_version, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, goal_id) DO UPDATE SET
        current_version = excluded.current_version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(row.project_id, row.goal_id, row.current_version, row.updated_at, row.updated_by);
  }

  insertConfigVersion(input: {
    projectId: string;
    goalId: string;
    version: number;
    actorId: string;
    adoptedPlanning: GoalEventAdoptedPlanningRef[];
    createdAt: string;
    configEventId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_config_versions (
        project_id, goal_id, version, actor_id, adopted_planning_json, created_at, config_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId,
      input.goalId,
      input.version,
      input.actorId,
      sqliteJson(input.adoptedPlanning),
      input.createdAt,
      input.configEventId,
    );
  }

  listAdoptedPlanning(projectId: string, goalId: string, version: number): GoalEventAdoptedPlanningRef[] {
    const row = this.db.prepare(`
      SELECT adopted_planning_json FROM goal_event_config_versions
      WHERE project_id = ? AND goal_id = ? AND version = ?
    `).get(projectId, goalId, version) as Row | undefined;
    return row ? rowJson(row.adopted_planning_json, []) : [];
  }

  insertType(input: {
    projectId: string;
    goalId: string;
    type: GoalEventTypeDefinition;
    createdAt: string;
    configVersion: number;
    actorId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_types (
        project_id, goal_id, type_id, type_version, name, purpose, semantic_family,
        source_json, fields_json, created_at, created_in_config_version, actor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId,
      input.goalId,
      input.type.type_id,
      input.type.version,
      input.type.name,
      input.type.purpose,
      input.type.semantic_family ?? null,
      sqliteJson(input.type.source),
      sqliteJson(input.type.fields),
      input.createdAt,
      input.configVersion,
      input.actorId,
    );
  }

  getType(projectId: string, goalId: string, typeId: string, version: number): GoalEventTypeDefinition | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_types
      WHERE project_id = ? AND goal_id = ? AND type_id = ? AND type_version = ?
    `).get(projectId, goalId, typeId, version) as Row | undefined;
    return row ? mapType(row) : null;
  }

  latestType(projectId: string, goalId: string, typeId: string): GoalEventTypeDefinition | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_types
      WHERE project_id = ? AND goal_id = ? AND type_id = ?
      ORDER BY type_version DESC LIMIT 1
    `).get(projectId, goalId, typeId) as Row | undefined;
    return row ? mapType(row) : null;
  }

  listLatestTypes(projectId: string, goalId: string): GoalEventTypeDefinition[] {
    const rows = this.db.prepare(`
      SELECT t.* FROM goal_event_types t
      JOIN (
        SELECT type_id, MAX(type_version) AS type_version
        FROM goal_event_types
        WHERE project_id = ? AND goal_id = ?
        GROUP BY type_id
      ) latest ON latest.type_id = t.type_id AND latest.type_version = t.type_version
      WHERE t.project_id = ? AND t.goal_id = ?
      ORDER BY t.type_id
    `).all(projectId, goalId, projectId, goalId) as Row[];
    return rows.map(mapType);
  }

  typeExistsOnGoal(projectId: string, goalId: string, typeId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_event_types WHERE project_id = ? AND goal_id = ? AND type_id = ? LIMIT 1
    `).get(projectId, goalId, typeId));
  }
}

function mapType(row: Row): GoalEventTypeDefinition {
  return {
    type_id: rowText(row.type_id),
    version: Number(row.type_version),
    name: rowText(row.name),
    purpose: rowText(row.purpose),
    semantic_family: row.semantic_family == null
      ? undefined
      : rowText(row.semantic_family) as GoalEventTypeDefinition["semantic_family"],
    source: rowJson(row.source_json, { kind: "local" as const }),
    fields: rowJson(row.fields_json, []),
  };
}
