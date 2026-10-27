import type {
  GoalEventClosureView,
  GoalEventProgressSummaryView,
  GoalEventUnmetReason,
  GoalEventUserConclusion,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

/** `goal_event_progress`, `goal_event_conclusions` and `goal_event_closures`: what a Goal's work has produced and how it was closed. */
export class GoalEventOutcomeRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertProgress(input: {
    summaryId: string;
    projectId: string;
    goalId: string;
    eventId: string;
    summary: string;
    basedOnCursor: number;
    nextStep: string | null;
    nextActor: string | null;
    actorId: string;
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_progress_summaries (
        summary_id, project_id, goal_id, event_id, summary_text, based_on_cursor,
        next_step, next_actor, actor_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.summaryId, input.projectId, input.goalId, input.eventId, input.summary,
      input.basedOnCursor, input.nextStep, input.nextActor, input.actorId, input.at,
    );
  }

  latestProgress(projectId: string, goalId: string): Omit<GoalEventProgressSummaryView, "stale" | "stale_because_cursor"> | null {
    const row = this.db.prepare(`
      SELECT s.* FROM goal_event_progress_summaries s
      JOIN goal_work_events e ON e.event_id = s.event_id AND e.project_id = s.project_id AND e.goal_id = s.goal_id
      WHERE s.project_id = ? AND s.goal_id = ?
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      summary_id: rowText(row.summary_id),
      event_id: rowText(row.event_id),
      summary: rowText(row.summary_text),
      based_on_cursor: Number(row.based_on_cursor),
      next_step: row.next_step == null ? null : rowText(row.next_step),
      next_actor: row.next_actor == null ? null : rowText(row.next_actor),
      recorded_at: rowText(row.recorded_at),
      actor_id: rowText(row.actor_id),
    };
  }

  insertConclusions(input: {
    projectId: string;
    goalId: string;
    requirementIds: string[];
    decisionId: string;
    actorId: string;
    verdict: "accepted" | "rejected";
    at: string;
    journalSeq: number;
  }): void {
    const insert = this.db.prepare(`
      INSERT INTO goal_event_requirement_conclusions (
        project_id, goal_id, requirement_id, decision_id, actor_id, verdict, received_at, journal_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const requirementId of input.requirementIds) {
      insert.run(
        input.projectId, input.goalId, requirementId, input.decisionId,
        input.actorId, input.verdict, input.at, input.journalSeq,
      );
    }
  }

  latestConclusions(projectId: string, goalId: string): Map<string, GoalEventUserConclusion> {
    const rows = this.db.prepare(`
      SELECT * FROM goal_event_requirement_conclusions
      WHERE project_id = ? AND goal_id = ?
      ORDER BY journal_seq DESC, decision_id DESC
    `).all(projectId, goalId) as Row[];
    const latest = new Map<string, GoalEventUserConclusion>();
    for (const row of rows) {
      const requirementId = rowText(row.requirement_id);
      if (latest.has(requirementId)) continue;
      latest.set(requirementId, {
        decision_id: rowText(row.decision_id),
        actor_id: rowText(row.actor_id),
        verdict: rowText(row.verdict) as GoalEventUserConclusion["verdict"],
        received_at: rowText(row.received_at),
        journal_seq: Number(row.journal_seq),
      });
    }
    return latest;
  }

  insertClosure(input: {
    closureId: string;
    projectId: string;
    goalId: string;
    eventId: string;
    kind: "complete" | "cancel";
    result: string | null;
    reason: string;
    completionApplied: boolean;
    expectedConfigVersion: number;
    expectedAgreementVersion: number;
    configVersion: number | null;
    agreementVersion: number | null;
    unmetReasons: GoalEventUnmetReason[];
    at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_closures (
        closure_id, project_id, goal_id, event_id, kind, result, reason, completion_applied,
        expected_config_version, expected_agreement_version, config_version, agreement_version,
        unmet_reasons_json, superseded, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      input.closureId, input.projectId, input.goalId, input.eventId, input.kind, input.result,
      input.reason, input.completionApplied ? 1 : 0, input.expectedConfigVersion,
      input.expectedAgreementVersion, input.configVersion, input.agreementVersion,
      sqliteJson(input.unmetReasons), input.at,
    );
  }

  latestClosure(projectId: string, goalId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT c.* FROM goal_event_closures c
      JOIN goal_work_events e ON e.event_id = c.event_id AND e.project_id = c.project_id AND e.goal_id = c.goal_id
      WHERE c.project_id = ? AND c.goal_id = ?
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  currentAppliedClosure(projectId: string, goalId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT c.* FROM goal_event_closures c
      JOIN goal_work_events e ON e.event_id = c.event_id AND e.project_id = c.project_id AND e.goal_id = c.goal_id
      WHERE c.project_id = ? AND c.goal_id = ?
        AND c.completion_applied = 1 AND c.superseded = 0
      ORDER BY e.journal_seq DESC LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  closureByEventId(projectId: string, goalId: string, eventId: string): GoalEventClosureView | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_closures WHERE event_id = ? AND project_id = ? AND goal_id = ?
    `).get(eventId, projectId, goalId) as Row | undefined;
    return row ? mapClosure(row) : null;
  }

  supersedeAppliedClosures(projectId: string, goalId: string, reason: string): void {
    this.db.prepare(`
      UPDATE goal_event_closures SET superseded = 1, superseded_reason = ?
      WHERE project_id = ? AND goal_id = ? AND completion_applied = 1 AND superseded = 0
    `).run(reason, projectId, goalId);
  }

  setFulfillment(goalId: string, state: "unmet" | "satisfied", at: string): void {
    this.db.prepare("UPDATE goals SET fulfillment_state = ?, updated_at = ? WHERE goal_id = ?")
      .run(state, at, goalId);
  }
}

function mapClosure(row: Row): GoalEventClosureView {
  return {
    closure_id: rowText(row.closure_id),
    event_id: rowText(row.event_id),
    kind: rowText(row.kind) as GoalEventClosureView["kind"],
    result: row.result == null ? null : rowText(row.result),
    reason: rowText(row.reason),
    recorded: true,
    completion_applied: Number(row.completion_applied) === 1,
    expected_config_version: Number(row.expected_config_version),
    expected_agreement_version: Number(row.expected_agreement_version ?? 0),
    config_version: row.config_version == null ? null : Number(row.config_version),
    agreement_version: row.agreement_version == null ? null : Number(row.agreement_version),
    unmet_reasons: rowJson(row.unmet_reasons_json, []),
    superseded: Number(row.superseded) === 1,
    superseded_reason: row.superseded_reason == null ? null : rowText(row.superseded_reason),
    recorded_at: rowText(row.recorded_at),
  };
}
