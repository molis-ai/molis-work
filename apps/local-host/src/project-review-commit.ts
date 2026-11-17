import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ProjectReviewCommit } from "./project-review-effect.js";

/** Both writers join the immutable platform record to the transaction applying the owner's change. */
export function commitProjectReview(db: SqliteDatabase, held: ProjectReviewCommit, check: () => void): ProjectTrustedDecision {
  const { project_id } = held.command.reference.owner;
  const { actor_id, entry } = held;
  if (projectApprovalRules(db, project_id).read(false).revision !== held.rulesRevision) {
    throw new ActionError("actions.conflict", "项目审批规则已变化，请重新查看原决定请求");
  }
  const { record, replayed } = projectReviewDecisions(db, project_id).commit(held.command, { actor_id,
    source: { kind: "person", actor_id, entry } }, held.frozenChoice, held.review, new Date().toISOString(), check, held.decisionId);
  if (replayed) throw new ActionError("actions.conflict", "原决定已经提交");
  return record;
}
