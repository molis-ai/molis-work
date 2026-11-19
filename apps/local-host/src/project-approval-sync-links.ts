import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { decisionOwnerMatches, projectReviewDecisions, readProjectReviewDecision } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase, SqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertGoalApprovalHistory, goalApprovalOutcomes, readGoalApprovalOutcome, verifyTreeItemDecisionHistory } from "./project-library-v5-handover.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";

type Collection = PluginSyncIdentity & { readonly collection_id: string; readonly schema_version: number };
const errors = defineErrorCodes("host", { approval_dependency_missing: "conflict" });
const incompatible = () => new ActionError("actions.conflict", "同步的目标结果与原平台决定不一致");
const pendingApproval = (): never => { throw errors.approval_dependency_missing("原审批记录还在同步，原目标数据已保留", { sync_waiting: true }); };

function currentGoalsOwner(identity: PluginSyncIdentity): boolean {
  const goals = builtinPluginByProjectKey("goals")?.manifest;
  return identity.plugin_id === goals?.plugin_id && identity.publisher_signature === goals.publisher.signature
    && identity.publisher_id === goals.publisher.publisher_id;
}

export function isGoalsApprovalCollection(identity: Collection): boolean {
  const collection = builtinPluginByProjectKey("goals")?.manifest.sync?.collections.find(row => row.id === "project_goals");
  return identity.collection_id === collection?.id && identity.schema_version === collection.schema_version && currentGoalsOwner(identity);
}

/** The same owner that produced the outcome reads it from the still-open original transaction. */
export function freezeGoalApprovalOutcome(db: SqliteDatabase, manifest: PluginManifest, record: ProjectTrustedDecision): void {
  if (!currentGoalsOwner({ plugin_id: manifest.plugin_id, publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature })) return;
  const project = record.reference.owner.project_id;
  const { kind, id } = record.review.target.subject;
  if (kind !== "goal" && kind !== "goal-tree-proposal") throw incompatible();
  const outcome = readGoalApprovalOutcome(db, project, record.decision_id, kind);
  if (!outcome || outcome.id !== id) throw incompatible();
  projectReviewDecisions(db, project).freezeOutcome(record, outcome.digest);
}

export function verifyGoalsApprovalLinks(db: ReplicaDatabase, project: string, owner: Collection, facts: Readonly<Record<string, ProjectReplicaRows>>,
  previous?: Readonly<Record<string, ProjectReplicaRows>>): void {
  const originalOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  const outcomes = goalApprovalOutcomes(facts);
  const previousOutcomes = previous ? goalApprovalOutcomes(previous) : null;
  if (previousOutcomes) assertGoalApprovalHistory(previousOutcomes, outcomes, facts);
  for (const [id, outcome] of outcomes) {
    const record = readProjectReviewDecision(db, project, id);
    if (!record) return pendingApproval();
    if (!decisionOwnerMatches(record, originalOwner) || record.outcome_digest !== outcome.digest) throw incompatible();
    if ("kind" in record) {
      if (record.subject !== "event" || outcome.kind !== "goal" || record.original.goal_id !== outcome.id) throw incompatible();
    } else {
      const subject = record.review.target.subject;
      if (subject.kind !== outcome.kind || subject.id !== outcome.id) throw incompatible();
    }
  }
  const history = projectReviewDecisions(db as SqliteDatabase, project).transferred(originalOwner, "proposal-item");
  verifyTreeItemDecisionHistory(facts.governance!, history, pendingApproval);
}
