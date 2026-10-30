import type {
  GoalEventAgreementView,
  GoalEventStateOwnerView,
  GoalEventWorkStatus,
} from "../contract/goals.js";
import { rowText, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export function goalHasEventStateOwner(db: GoalsSqliteDatabase, projectId: string, goalId: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM goal_event_state_owners WHERE project_id = ? AND goal_id = ? LIMIT 1",
  ).get(projectId, goalId));
}

/** `goal_event_state_owners`, `goal_event_work_status` and `goal_event_agreements`: who owns a Goal's event state, its work status and its agreement. */
export class GoalEventOwnerRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  isOwner(projectId: string, goalId: string): boolean {
    return goalHasEventStateOwner(this.db, projectId, goalId);
  }

  readOwner(projectId: string, goalId: string): GoalEventStateOwnerView | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_state_owners WHERE project_id = ? AND goal_id = ?",
    ).get(projectId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      kind: "event_work",
      adopted_at: rowText(row.adopted_at),
      adopted_by: rowText(row.adopted_by),
      source: rowText(row.source) as GoalEventStateOwnerView["source"],
    };
  }

  adoptOwner(input: {
    projectId: string;
    goalId: string;
    actorId: string;
    source: "intent" | "configuration" | "continue";
    at: string;
  }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO goal_event_state_owners (
        project_id, goal_id, owner, source, adopted_at, adopted_by
      ) VALUES (?, ?, 'event_work', ?, ?, ?)
    `).run(input.projectId, input.goalId, input.source, input.at, input.actorId);
    this.db.prepare(`
      INSERT OR IGNORE INTO goal_event_work_status (project_id, goal_id, work_status, updated_at)
      VALUES (?, ?, 'open', ?)
    `).run(input.projectId, input.goalId, input.at);
  }

  workStatus(projectId: string, goalId: string): GoalEventWorkStatus {
    const row = this.db.prepare(
      "SELECT work_status FROM goal_event_work_status WHERE project_id = ? AND goal_id = ?",
    ).get(projectId, goalId) as Row | undefined;
    return row ? rowText(row.work_status) as GoalEventWorkStatus : "open";
  }

  setWorkStatus(projectId: string, goalId: string, status: GoalEventWorkStatus, at: string): void {
    this.db.prepare(`
      INSERT INTO goal_event_work_status (project_id, goal_id, work_status, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(goal_id) DO UPDATE SET work_status = excluded.work_status, updated_at = excluded.updated_at
    `).run(projectId, goalId, status, at);
  }

  latestAgreement(projectId: string, goalId: string): { version: number; outcome: string; actor_id: string; created_at: string } | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_agreements
      WHERE project_id = ? AND goal_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      version: Number(row.version),
      outcome: rowText(row.outcome),
      actor_id: rowText(row.actor_id),
      created_at: rowText(row.created_at),
    };
  }

  insertAgreement(input: {
    projectId: string;
    goalId: string;
    version: number;
    outcome: string;
    actorId: string;
    at: string;
    eventId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_agreements (
        project_id, goal_id, version, outcome, actor_id, created_at, event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.projectId, input.goalId, input.version, input.outcome, input.actorId, input.at, input.eventId);
  }
}

export function agreementView(
  agreement: { version: number; outcome: string; actor_id: string; created_at: string } | null,
  requirementCount: number,
  goalOutcome: string,
): GoalEventAgreementView {
  const outcome = agreement?.outcome?.trim() || goalOutcome.trim();
  const missing: string[] = [];
  if (!outcome) missing.push("具体结果约定");
  if (requirementCount < 1) missing.push("至少一项有效结果要求");
  return {
    version: agreement?.version ?? 0,
    outcome,
    has_minimum_result_agreement: missing.length === 0,
    missing,
    updated_at: agreement?.created_at ?? null,
    updated_by: agreement?.actor_id ?? null,
  };
}
