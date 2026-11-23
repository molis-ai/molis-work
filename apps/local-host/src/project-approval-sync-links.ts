import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSyncCollection, PluginSyncIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { approvalOutcomeCollection, approvalOutcomesFromFacts, assertApprovalOutcomeHistory, decisionOwnerMatches, projectReviewDecisions,
  readApprovalOutcome, readProjectReviewDecision } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase, SqliteDatabase } from "@molis-ai/molis-work-storage";

const errors = defineErrorCodes("host", { approval_dependency_missing: "conflict" });
const incompatible = () => new ActionError("actions.conflict", "同步的插件结果与原平台决定不一致");
const pendingApproval = (): never => { throw errors.approval_dependency_missing("原审批记录还在同步，原插件数据已保留", { sync_waiting: true }); };

/** A collection whose Manifest says where approved decisions leave their results syncs together with the platform's decision records. */
export function hasApprovalOutcomes(collection: PluginSyncCollection): boolean {
  return Boolean(collection.approval_outcomes?.length);
}

/**
 * The platform reads the decision's result where the owner's Manifest declares it, in the still-open original transaction, and freezes its
 * digest on the decision record (44B: no plugin code runs). An owner that declares no results has none to freeze.
 */
export function freezePluginApprovalOutcome(db: SqliteDatabase, manifest: PluginManifest, record: ProjectTrustedDecision): void {
  const collection = approvalOutcomeCollection(manifest.sync?.collections);
  if (!collection) return;
  const project = record.reference.owner.project_id;
  const outcome = readApprovalOutcome(db, collection, project, record.decision_id, record.review.target.subject);
  if (!outcome) throw incompatible();
  projectReviewDecisions(db, project).freezeOutcome(record, outcome.digest);
}

/** Synced results match the platform's frozen decision records: the same owner, subject and digest, and no decision dropped while its subject stays. */
export function verifyPluginApprovalLinks(db: ReplicaDatabase, project: string, owner: PluginSyncIdentity, collection: PluginSyncCollection,
  facts: Readonly<Record<string, ProjectReplicaRows>>, previous?: Readonly<Record<string, ProjectReplicaRows>>): void {
  if (!hasApprovalOutcomes(collection)) throw incompatible();
  const originalOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  const outcomes = approvalOutcomesFromFacts(collection, facts);
  if (previous) assertApprovalOutcomeHistory(collection, approvalOutcomesFromFacts(collection, previous), outcomes, facts);
  for (const [id, outcome] of outcomes) {
    const record = readProjectReviewDecision(db, project, id);
    if (!record) return pendingApproval();
    if (!decisionOwnerMatches(record, originalOwner) || record.outcome_digest !== outcome.digest) throw incompatible();
    const subject = record.review.target.subject;
    if (subject.kind !== outcome.kind || subject.id !== outcome.id) throw incompatible();
  }
}
