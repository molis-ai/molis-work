import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectTrustedDecision, TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertFrozenProjectReview, assertProjectReviewCoverage } from "./coverage.js";

type Person = Pick<ProjectTrustedDecision, "actor_id" | "source">;
type DecisionRow = { readonly record_json: string };
type LocatedDecisionRow = DecisionRow & { readonly row_ref: string };
type Owner = Extract<ApprovalRuleOwner, { kind: "plugin" }>;

export function decisionOwnerMatches(record: ProjectTrustedDecision, owner: Owner): boolean {
  return "plugin_id" in record.reference.owner && record.reference.owner.plugin_id === owner.plugin_id && record.publisher_signature === owner.publisher_signature;
}

function fingerprint(input: TrustedReviewCommand, actorId: string, frozenChoice: unknown) {
  return createHash("sha256").update(canonicalJsonText([input.reference, input.choice_id, input.note ?? null, actorId, frozenChoice], "null")).digest("hex");
}

function unreadableDecision(row: LocatedDecisionRow) {
  return new ActionError("actions.execution_failed", "项目审批记录无法读取", { kind: "internal",
    details: { storage: { table: "project_review_decisions", column: "record_json", row_ref: row.row_ref } } });
}

function readLocatedDecision(row: LocatedDecisionRow): ProjectTrustedDecision {
  try {
    const record = JSON.parse(row.record_json) as ProjectTrustedDecision;
    if (!record || typeof record !== "object" || Array.isArray(record) || !("request_key" in record)) throw unreadableDecision(row);
    return record;
  } catch {
    throw unreadableDecision(row);
  }
}

/** The platform owns the immutable record. A business caller commits it inside the existing owner transaction. */
export function projectReviewDecisions(db: SqliteDatabase, projectId: string) {
  const from = (row: DecisionRow | undefined) => row ? JSON.parse(row.record_json) as ProjectTrustedDecision : null;
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
    freezeOutcome(record: ProjectTrustedDecision, digest: string): void {
      if (!db.inTransaction || record.reference.owner.project_id !== projectId || !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
        throw new ActionError("actions.conflict", "目标结果需要在原决定事务中确认");
      }
      const saved = db.prepare(`UPDATE project_review_decisions SET record_json = ?
        WHERE project_id = ? AND decision_id = ? AND request_id = ? AND record_json = ? AND json_type(record_json, '$.outcome_digest') IS NULL`)
        .run(canonicalJsonText({ ...record, outcome_digest: digest }), projectId, record.decision_id, record.reference.id, canonicalJsonText(record));
      if (Number(saved.changes) !== 1) throw new ActionError("actions.conflict", "原决定的业务结果已经确认或已失效");
    },
    read: (id: string, owner?: Owner) => readProjectReviewDecision(db, projectId, id, owner),
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
    recent(limit: number): ProjectTrustedDecision[] {
      return db.prepare<[string, number], LocatedDecisionRow>(`
        SELECT record_json, CAST(rowid AS TEXT) AS row_ref FROM project_review_decisions WHERE project_id = ?
        ORDER BY recorded_at DESC, decision_id DESC LIMIT ?
      `).all(projectId, limit).map(readLocatedDecision);
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
    /** A durable recovery applies the exact record the acceptance side committed, without re-running the business action. */
    restore(record: ProjectTrustedDecision) {
      if (!db.inTransaction || record.reference.owner.project_id !== projectId || !record.reference.id.trim() || !record.decision_id.trim() || !record.request_key.trim()
        || !record.actor_id.trim() || !record.decided_at.trim() || record.source.kind !== "person" || record.source.actor_id !== record.actor_id
        || !record.source.entry.conversation_ref.trim() || !record.source.entry.message_ref.trim()
        || !["web", "management"].includes(record.source.entry.source) || !record.publisher_signature.trim()) {
        throw new ActionError("actions.forbidden", "恢复的项目决定缺少原项目、本人或入口凭据");
      }
      const coverage = assertProjectReviewCoverage(record.review, record.reference.owner);
      assertFrozenProjectReview(record.presentation, coverage, record.decision, record.actor_id);
      const body = canonicalJsonText(record, "null");
      const byId = db.prepare<[string, string], DecisionRow>("SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?")
        .get(projectId, record.decision_id);
      if (byId) {
        if (byId.record_json !== body) throw new ActionError("actions.conflict", "原决定编号已有不同内容");
        return { record: JSON.parse(byId.record_json) as ProjectTrustedDecision, replayed: true };
      }
      const byRequest = db.prepare<[string, string, string], DecisionRow>(`SELECT record_json FROM project_review_decisions
        WHERE project_id = ? AND (request_id = ? OR request_key = ?)`).all(projectId, record.reference.id, record.request_key);
      if (byRequest.length) throw new ActionError("actions.conflict", "原决定请求已经有另一条记录");
      db.prepare(`INSERT INTO project_review_decisions
        (decision_id, project_id, request_id, request_key, record_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.decision_id, projectId, record.reference.id, record.request_key, body, record.decided_at);
      return { record, replayed: false };
    },
  };
}

export function readProjectReviewDecision(db: { prepare(sql: string): { get(...params: string[]): unknown } }, projectId: string, id: string, owner?: Owner): ProjectTrustedDecision | null {
  const filter = owner ? `AND json_extract(record_json, '$.reference.owner.plugin_id') = ?
    AND json_extract(record_json, '$.publisher_signature') = ?` : "";
  const row = db.prepare(`SELECT record_json, CAST(rowid AS TEXT) AS row_ref
    FROM project_review_decisions WHERE project_id = ? AND decision_id = ? ${filter}`)
    .get(projectId, id, ...(owner ? [owner.plugin_id, owner.publisher_signature] : [])) as LocatedDecisionRow | undefined;
  return row ? readLocatedDecision(row) : null;
}
