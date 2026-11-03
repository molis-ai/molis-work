import { decisionErrors } from "./errors.js";
import { randomUUID } from "node:crypto";
import type {
  GoalEventAgreementChange,
  GoalEventTrustedAuthority,
  GoalEventTrustedDecisionRecord,
  RecordGoalUserDecisionInput,
} from "../contract/goals.js";
import type { GovernanceEventDecisionApi } from "../contract/governance-collaboration.js";
import { GovernanceProvenance } from "./provenance.js";
import { json, parseJson } from "./mappers.js";
import type { GovernanceSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export class GovernanceEventDecisions implements GovernanceEventDecisionApi {
  private readonly provenance: GovernanceProvenance;

  constructor(
    private readonly db: GovernanceSqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.provenance = new GovernanceProvenance();
  }

  record(input: RecordGoalUserDecisionInput & { authority: GoalEventTrustedAuthority }): GoalEventTrustedDecisionRecord {
    const authority = this.provenance.validateEventDecisionAuthority(input.authority);
    const conclusion = input.conclusion?.trim();
    if (!conclusion) throw decisionErrors.conclusion_required("用户决定需要结论");
    const at = this.now();
    const decisionId = `gedec-${randomUUID()}`;
    const scope = {
      requirement_ids: unique(input.scope?.requirement_ids),
      event_ids: unique(input.scope?.event_ids),
      concern_ids: unique(input.scope?.concern_ids),
      action: input.scope?.action?.trim() || null,
    };
    this.db.prepare(`
      INSERT INTO goal_event_trusted_decisions (
        decision_id, project_id, goal_id, actor_id, actor_kind, authority_source,
        conversation_ref, message_ref, request_id, selected_option_id, conclusion,
        accepts_requirements, scope_json, change_json, recorded_at
      ) VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decisionId,
      input.project_id,
      input.goal_id,
      authority.actor_id,
      authority.authority_source,
      authority.conversation_ref,
      authority.message_ref,
      input.request_id ?? null,
      input.selected_option_id ?? null,
      conclusion,
      input.accepts_requirements ? 1 : 0,
      json(scope),
      input.authorized_change == null ? null : json(input.authorized_change),
      at,
    );
    return this.read(input.project_id, decisionId)!;
  }

  read(projectId: string, decisionId: string): GoalEventTrustedDecisionRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_trusted_decisions WHERE decision_id = ? AND project_id = ?",
    ).get(decisionId, projectId) as Row | undefined;
    if (!row) return null;
    return {
      decision_id: String(row.decision_id),
      project_id: String(row.project_id),
      goal_id: String(row.goal_id),
      actor_id: String(row.actor_id),
      actor_kind: "user",
      authority_source: row.authority_source as GoalEventTrustedDecisionRecord["authority_source"],
      conversation_ref: String(row.conversation_ref),
      message_ref: String(row.message_ref),
      request_id: row.request_id == null ? null : String(row.request_id),
      selected_option_id: row.selected_option_id == null ? null : String(row.selected_option_id),
      conclusion: String(row.conclusion),
      accepts_requirements: Number(row.accepts_requirements) === 1,
      scope: parseJson(row.scope_json, {
        requirement_ids: [],
        event_ids: [],
        concern_ids: [],
        action: null,
      }),
      authorized_change: row.change_json == null ? null : parseJson<GoalEventAgreementChange | null>(row.change_json, null),
      recorded_at: String(row.recorded_at),
    };
  }
}

function unique(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
