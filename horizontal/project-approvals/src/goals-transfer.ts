import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRuleScope, ProjectDecisionHistory } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteBaselineDatabase } from "@molis-ai/molis-work-storage";

type PluginOwner = Extract<ApprovalRuleOwner, { kind: "plugin" }>;
type StoredDecision = Record<string, string | number | null> & { project_id: string; decision_id: string };
type OriginalRule = {
  policy_binding_id: string; project_id: string; scope: ProjectApprovalRuleScope; requires_person: boolean | null;
  state: "active" | "replaced" | "withdrawn"; created_by: string; created_at: string; reason: string;
};

type OriginalDecision = { subject: ProjectDecisionHistory["subject"]; recorded_at: string; row: StoredDecision };

export interface GoalsApprovalTransfer {
  readonly rules: readonly OriginalRule[];
  readonly decisions: readonly OriginalDecision[];
}

const corrupt = () => new ActionError("actions.input_invalid", "旧项目审批记录有不符的对象、出处或规则，项目库已保留");

/** Called by explicit project-library maintenance with the facts exported by the verified old owner. */
export function transferGoalsApprovalRecords(db: SqliteBaselineDatabase, projectId: string, owner: PluginOwner, facts: GoalsApprovalTransfer): void {
  transferDecisions(db, projectId, owner, facts.decisions);
  transferRules(db, projectId, facts.rules);
}

function transferDecisions(db: SqliteBaselineDatabase, projectId: string, owner: PluginOwner, decisions: readonly OriginalDecision[]) {
  const insert = db.prepare(`
    INSERT INTO project_review_decisions(decision_id, project_id, record_json, recorded_at) VALUES (?, ?, ?, ?)
  `);
  const read = db.prepare("SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?");
  for (const { row: original, subject, recorded_at } of decisions) {
    if (original.project_id !== projectId || !original.decision_id || !recorded_at
      || !original.actor_id || !original.conversation_ref || !original.message_ref) throw corrupt();
    const record: ProjectDecisionHistory = { kind: "history", decision_id: original.decision_id, project_id: projectId, owner, subject, recorded_at, original };
    const body = canonicalJsonText(record, "null");
    insert.run(record.decision_id, projectId, body, recorded_at);
    const saved = read.get(projectId, record.decision_id) as { record_json: string } | undefined;
    if (saved?.record_json !== body) throw corrupt();
  }
}

function transferRules(db: SqliteBaselineDatabase, projectId: string, rows: readonly OriginalRule[]) {
  const insert = db.prepare(`
    INSERT INTO project_approval_rules(id, project_id, scope_json, rule_order, requires_person, revision, state, created_by, created_at, reason)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);
  const read = db.prepare(`
    SELECT scope_json, rule_order, requires_person, state, created_by, created_at, reason
      FROM project_approval_rules WHERE project_id = ? AND id = ?
  `);
  for (const [index, row] of rows.entries()) {
    if (row.project_id !== projectId || !row.policy_binding_id) throw corrupt();
    const human = row.requires_person;
    const key = canonicalJsonText(row.scope, "null"), required = human === null ? null : Number(human);
    insert.run(row.policy_binding_id, projectId, key, index + 1, required, row.state, row.created_by, row.created_at, row.reason);
    const actual = read.get(projectId, row.policy_binding_id);
    if (canonicalJsonText(actual) !== canonicalJsonText({ scope_json: key, rule_order: index + 1, requires_person: required,
      state: row.state, created_by: row.created_by, created_at: row.created_at, reason: row.reason })) throw corrupt();
  }
}
