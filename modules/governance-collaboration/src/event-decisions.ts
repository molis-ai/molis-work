import { randomUUID } from "node:crypto";
import type {
  GoalEventAgreementChange,
  GoalEventTrustedAuthority,
  GoalEventTrustedDecisionRecord,
  RecordGoalUserDecisionInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceEventDecisionApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GovernanceProvenance } from "./provenance.js";
import { json, parseJson } from "./mappers.js";
import type { GovernanceSqliteDatabase } from "./repository.js";
import { GovernanceError, type GovernanceErrorFactory } from "./errors.js";

type Row = Record<string, unknown>;

export const GOAL_EVENT_TRUSTED_DECISIONS_SQL = `
  CREATE TABLE IF NOT EXISTS goal_event_trusted_decisions (
    decision_id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind = 'user'),
    authority_source TEXT NOT NULL CHECK (authority_source IN ('web', 'management')),
    conversation_ref TEXT NOT NULL,
    message_ref TEXT NOT NULL,
    request_id TEXT,
    selected_option_id TEXT,
    conclusion TEXT NOT NULL,
    accepts_requirements INTEGER NOT NULL CHECK (accepts_requirements IN (0, 1)),
    scope_json TEXT NOT NULL,
    change_json TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS goal_event_trusted_decisions_goal_idx
    ON goal_event_trusted_decisions(board_id, goal_id, recorded_at);
`;

export function migrateGoalEventTrustedDecisions(db: GovernanceSqliteDatabase): void {
  db.exec(GOAL_EVENT_TRUSTED_DECISIONS_SQL);
  const columns = db.prepare("PRAGMA table_info(goal_event_trusted_decisions)").all() as Array<{ name: string }>;
  if (columns.length && !columns.some((column) => column.name === "change_json")) {
    db.exec("ALTER TABLE goal_event_trusted_decisions ADD COLUMN change_json TEXT");
  }
}

export class GovernanceEventDecisions implements GovernanceEventDecisionApi {
  private readonly provenance: GovernanceProvenance;

  constructor(
    private readonly db: GovernanceSqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly error: GovernanceErrorFactory = (code, message, details) =>
      new GovernanceError(code, message, details),
  ) {
    this.provenance = new GovernanceProvenance(this.error);
  }

  record(input: RecordGoalUserDecisionInput & { authority: GoalEventTrustedAuthority }): GoalEventTrustedDecisionRecord {
    const authority = this.provenance.validateEventDecisionAuthority(input.authority);
    const conclusion = input.conclusion?.trim();
    if (!conclusion) throw this.error("event_decision.conclusion_required", "用户决定需要结论");
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
        decision_id, board_id, goal_id, actor_id, actor_kind, authority_source,
        conversation_ref, message_ref, request_id, selected_option_id, conclusion,
        accepts_requirements, scope_json, change_json, recorded_at
      ) VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decisionId,
      input.board_id,
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
    return this.read(input.board_id, decisionId)!;
  }

  read(boardId: string, decisionId: string): GoalEventTrustedDecisionRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_trusted_decisions WHERE decision_id = ? AND board_id = ?",
    ).get(decisionId, boardId) as Row | undefined;
    if (!row) return null;
    return {
      decision_id: String(row.decision_id),
      board_id: String(row.board_id),
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
