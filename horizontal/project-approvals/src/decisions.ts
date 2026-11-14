import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectDecisionHistory, ProjectTrustedDecision, TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertFrozenProjectReview, assertProjectReviewCoverage } from "./coverage.js";

type Person = Pick<ProjectTrustedDecision, "actor_id" | "source">;
type DecisionRow = { readonly record_json: string };
type DecisionHistory = ProjectTrustedDecision | ProjectDecisionHistory;
type Owner = Extract<ApprovalRuleOwner, { kind: "plugin" }>;

export function decisionOwnerMatches(record: DecisionHistory, owner: Owner): boolean {
  return "kind" in record ? record.owner.plugin_id === owner.plugin_id && record.owner.publisher_signature === owner.publisher_signature
    : record.reference.owner.plugin_id === owner.plugin_id && record.publisher_signature === owner.publisher_signature;
}

function fingerprint(input: TrustedReviewCommand, actorId: string, frozenChoice: unknown) {
  return createHash("sha256").update(canonicalJsonText([input.reference, input.choice_id, input.note ?? null, actorId, frozenChoice], "null")).digest("hex");
}

/** The platform owns the immutable record. A business caller commits it inside the existing owner transaction. */
export function projectReviewDecisions(db: SqliteDatabase, projectId: string) {
  const from = (row: DecisionRow | undefined) => row ? JSON.parse(row.record_json) as DecisionHistory : null;
  function sameRequest(input: TrustedReviewCommand, actorId: string, frozenChoice?: unknown): ProjectTrustedDecision | null {
    if (input.reference.owner.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "原决定请求属于其他项目");
    const rows = db.prepare<[string, string, string], DecisionRow>(`
      SELECT record_json FROM project_review_decisions WHERE project_id = ? AND (request_id = ? OR request_key = ?)
    `).all(projectId, input.reference.id, input.request_key);
    if (!rows.length) return null;
    const record = from(rows[0])!;
    if (rows.length !== 1 || !("request_key" in record) || record.request_key !== input.request_key || record.actor_id !== actorId
      || canonicalJsonText(record.reference) !== canonicalJsonText(input.reference) || record.decision !== input.choice_id
      || record.note !== (input.note ?? null) || frozenChoice !== undefined && record.choice_fingerprint !== fingerprint(input, actorId, frozenChoice)) {
      throw new ActionError("actions.conflict", "这份决定请求已经处理，或操作编号已被使用");
    }
    return record;
  }
  return {
    read: (id: string) => readProjectReviewDecision(db, projectId, id),
    transferred(owner: Owner, subject: ProjectDecisionHistory["subject"]): ProjectDecisionHistory[] {
      const rows = db.prepare<[string, string, string, string], DecisionRow>(`
        SELECT record_json FROM project_review_decisions WHERE project_id = ? AND request_id IS NULL
          AND json_extract(record_json, '$.owner.plugin_id') = ? AND json_extract(record_json, '$.owner.publisher_signature') = ?
          AND json_extract(record_json, '$.subject') = ? ORDER BY recorded_at, decision_id
      `).all(projectId, owner.plugin_id, owner.publisher_signature, subject);
      return rows.map(row => JSON.parse(row.record_json) as ProjectDecisionHistory);
    },
    forRequest(id: string): ProjectTrustedDecision | null {
      const record = from(db.prepare<[string, string], DecisionRow>(`
        SELECT record_json FROM project_review_decisions WHERE project_id = ? AND request_id = ?
      `).get(projectId, id));
      return record && "request_key" in record ? record : null;
    },
    findCommitted(id: string): ProjectTrustedDecision | null {
      const record = from(db.prepare<[string, string], DecisionRow>(`
        SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ? AND request_id IS NOT NULL
      `).get(projectId, id));
      return record && "request_key" in record ? record : null;
    },
    recent(limit: number): DecisionHistory[] {
      return db.prepare<[string, number], DecisionRow>(`
        SELECT record_json FROM project_review_decisions WHERE project_id = ?
        ORDER BY recorded_at DESC, decision_id DESC LIMIT ?
      `).all(projectId, limit).map(row => JSON.parse(row.record_json) as DecisionHistory);
    },
    count(): number {
      return db.prepare<[string], { count: number }>("SELECT count(*) AS count FROM project_review_decisions WHERE project_id = ?").get(projectId)?.count ?? 0;
    },
    sameRequest,
    commit(input: TrustedReviewCommand, person: Person, frozenChoice: unknown, review: Pick<ProjectTrustedDecision, "publisher_signature" | "review" | "presentation">,
      at: string, assertCurrent: () => void, originalId: string = randomUUID()) {
      if (!db.inTransaction || person.source.kind !== "person" || person.actor_id !== person.source.actor_id
        || !person.actor_id.trim() || !person.source.entry.conversation_ref.trim() || !person.source.entry.message_ref.trim()
        || !["web", "management"].includes(person.source.entry.source)) {
        throw new ActionError("actions.forbidden", "需要原用户决定和正在提交的项目事务");
      }
      if (!review.publisher_signature.trim()) throw new ActionError("actions.input_invalid", "原决定缺少提供方身份");
      const coverage = assertProjectReviewCoverage(review.review, input.reference.owner);
      assertFrozenProjectReview(review.presentation, coverage, input.choice_id, person.actor_id);
      requireSynchronous(assertCurrent());
      const previous = sameRequest(input, person.actor_id, frozenChoice);
      if (previous) return { record: previous, replayed: true };
      const record: ProjectTrustedDecision = {
        decision_id: originalId, reference: input.reference, decision: input.choice_id, note: input.note ?? null,
        decided_at: at, actor_id: person.actor_id, source: person.source, request_key: input.request_key,
        choice_fingerprint: fingerprint(input, person.actor_id, frozenChoice), publisher_signature: review.publisher_signature, review: review.review,
        ...(review.presentation ? { presentation: review.presentation } : {}),
      };
      db.prepare(`INSERT INTO project_review_decisions
        (decision_id, project_id, request_id, request_key, record_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.decision_id, projectId, input.reference.id, input.request_key, canonicalJsonText(record, "null"), at);
      requireSynchronous(assertCurrent());
      return { record, replayed: false };
    },
  };
}

export function readProjectReviewDecision(db: { prepare(sql: string): { get(...params: string[]): unknown } }, projectId: string, id: string): DecisionHistory | null {
  const row = db.prepare("SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?").get(projectId, id) as DecisionRow | undefined;
  return row ? JSON.parse(row.record_json) as DecisionHistory : null;
}
