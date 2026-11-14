import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDecisionHistory, ProjectTrustedDecision, TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

type Person = Pick<ProjectTrustedDecision, "actor_id" | "source">;
type DecisionRow = { readonly record_json: string };
type DecisionHistory = ProjectTrustedDecision | ProjectDecisionHistory;

function fingerprint(input: TrustedReviewCommand, actorId: string, frozenChoice: unknown) {
  return createHash("sha256").update(canonicalJsonText([input.reference, input.choice_id, input.note ?? null, actorId, frozenChoice], "null")).digest("hex");
}

/** The platform owns the immutable record. A business caller commits it inside the existing owner transaction. */
export function projectReviewDecisions(db: SqliteDatabase, projectId: string) {
  const from = (row: DecisionRow | undefined) => row ? JSON.parse(row.record_json) as DecisionHistory : null;
  function sameRequest(input: TrustedReviewCommand, actorId: string, frozenChoice: unknown): ProjectTrustedDecision | null {
    if (input.reference.owner.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "原决定请求属于其他项目");
    const rows = db.prepare<[string, string, string], DecisionRow>(`
      SELECT record_json FROM project_review_decisions WHERE project_id = ? AND (request_id = ? OR request_key = ?)
    `).all(projectId, input.reference.id, input.request_key);
    if (!rows.length) return null;
    const record = from(rows[0])!;
    if (rows.length !== 1 || !("request_key" in record) || record.request_key !== input.request_key
      || record.choice_fingerprint !== fingerprint(input, actorId, frozenChoice)) {
      throw new ActionError("actions.conflict", "这份决定请求已经处理，或操作编号已被使用");
    }
    return record;
  }
  return {
    read(id: string): DecisionHistory | null {
      return from(db.prepare<[string, string], DecisionRow>(`
        SELECT record_json FROM project_review_decisions WHERE project_id = ? AND decision_id = ?
      `).get(projectId, id));
    },
    sameRequest,
    commit(input: TrustedReviewCommand, person: Person, frozenChoice: unknown, at: string, assertCurrent: () => void) {
      if (!db.inTransaction || person.source.kind !== "person" || person.actor_id !== person.source.actor_id
        || !person.actor_id.trim() || !person.source.entry.conversation_ref.trim() || !person.source.entry.message_ref.trim()
        || !["web", "management"].includes(person.source.entry.source)) {
        throw new ActionError("actions.forbidden", "需要原用户决定和正在提交的项目事务");
      }
      requireSynchronous(assertCurrent());
      const previous = sameRequest(input, person.actor_id, frozenChoice);
      if (previous) return { record: previous, replayed: true };
      const record: ProjectTrustedDecision = {
        decision_id: randomUUID(), reference: input.reference, decision: input.choice_id, note: input.note ?? null,
        decided_at: at, actor_id: person.actor_id, source: person.source, request_key: input.request_key,
        choice_fingerprint: fingerprint(input, person.actor_id, frozenChoice),
      };
      db.prepare(`INSERT INTO project_review_decisions
        (decision_id, project_id, request_id, request_key, record_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)
      `).run(record.decision_id, projectId, input.reference.id, input.request_key, canonicalJsonText(record, "null"), at);
      requireSynchronous(assertCurrent());
      return { record, replayed: false };
    },
  };
}
