import type {
  GoalEventConcernStatus,
  GoalEventConcernView,
  GoalEventScope,
} from "../contract/goals.js";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";
import { EMPTY_SCOPE } from "./event-state-scope.js";

type Row = Record<string, unknown>;

/** `goal_event_concerns`: the concerns raised on a Goal. */
export class GoalEventConcernRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertConcern(input: {
    concernId: string;
    projectId: string;
    goalId: string;
    eventId: string;
    title: string;
    statement: string;
    scope: GoalEventScope;
    blocksClosure: boolean;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_concerns (
        concern_id, project_id, goal_id, event_id, title, statement, scope_json,
        blocks_closure, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      input.concernId, input.projectId, input.goalId, input.eventId, input.title, input.statement,
      sqliteJson(input.scope), input.blocksClosure ? 1 : 0, input.at, input.at,
    );
  }

  getConcern(projectId: string, goalId: string, concernId: string): GoalEventConcernView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_concerns WHERE concern_id = ? AND project_id = ? AND goal_id = ?",
    ).get(concernId, projectId, goalId) as Row | undefined;
    return row ? mapConcern(row) : null;
  }

  updateConcern(input: {
    concernId: string;
    status: GoalEventConcernStatus;
    previousStatus: GoalEventConcernStatus;
    reason: string;
    resolutionEventId: string;
    citedDecisionId: string | null;
    at: string;
  }): void {
    this.db.prepare(`
      UPDATE goal_event_concerns SET
        status = ?, previous_status = ?, resolution_reason = ?,
        resolution_event_id = ?, cited_decision_id = ?, updated_at = ?
      WHERE concern_id = ?
    `).run(
      input.status, input.previousStatus, input.reason, input.resolutionEventId,
      input.citedDecisionId, input.at, input.concernId,
    );
  }

  listConcerns(projectId: string, goalId: string): GoalEventConcernView[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_concerns WHERE project_id = ? AND goal_id = ?
      ORDER BY created_at ASC, concern_id ASC
    `).all(projectId, goalId) as Row[]).map(mapConcern);
  }

  openBlockingConcerns(projectId: string, goalId: string): GoalEventConcernView[] {
    return this.listConcerns(projectId, goalId).filter((concern) =>
      concern.status === "open" && concern.blocks_closure);
  }
}

function mapConcern(row: Row): GoalEventConcernView {
  return {
    concern_id: rowText(row.concern_id),
    event_id: rowText(row.event_id),
    title: rowText(row.title),
    statement: rowText(row.statement),
    scope: rowJson(row.scope_json, EMPTY_SCOPE),
    blocks_closure: Number(row.blocks_closure) === 1,
    status: rowText(row.status) as GoalEventConcernStatus,
    resolution_reason: row.resolution_reason == null ? null : rowText(row.resolution_reason),
    resolution_event_id: row.resolution_event_id == null ? null : rowText(row.resolution_event_id),
    cited_decision_id: row.cited_decision_id == null ? null : rowText(row.cited_decision_id),
    previous_status: row.previous_status == null ? null : rowText(row.previous_status) as GoalEventConcernStatus,
    created_at: rowText(row.created_at),
    updated_at: rowText(row.updated_at),
  };
}
