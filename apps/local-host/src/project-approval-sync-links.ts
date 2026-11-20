import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginApprovalOutcomesBinding } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { PluginSyncIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { decisionOwnerMatches, projectReviewDecisions, readProjectReviewDecision } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase, SqliteDatabase } from "@molis-ai/molis-work-storage";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

type Collection = PluginSyncIdentity & { readonly collection_id: string; readonly schema_version: number };
const errors = defineErrorCodes("host", { approval_dependency_missing: "conflict" });
const incompatible = () => new ActionError("actions.conflict", "同步的插件结果与原平台决定不一致");
const pendingApproval = (): never => { throw errors.approval_dependency_missing("原审批记录还在同步，原插件数据已保留", { sync_waiting: true }); };

function findApprovalOutcomesOwner(identity: PluginSyncIdentity): { readonly manifest: PluginManifest; readonly binding: PluginApprovalOutcomesBinding } | null {
  for (const registration of PLATFORM_PLUGIN_REGISTRATIONS) {
    if (!registration.approval_outcomes) continue;
    const { manifest } = registration;
    if (identity.plugin_id === manifest.plugin_id
      && identity.publisher_signature === manifest.publisher.signature
      && identity.publisher_id === manifest.publisher.publisher_id) {
      return { manifest, binding: registration.approval_outcomes };
    }
  }
  return null;
}

export function isPluginApprovalCollection(identity: Collection): boolean {
  const owner = findApprovalOutcomesOwner(identity);
  if (!owner) return false;
  const collection = owner.manifest.sync?.collections.find(row => row.id === owner.binding.collection_id);
  return identity.collection_id === collection?.id && identity.schema_version === collection.schema_version;
}

/** The same owner that produced the outcome reads it from the still-open original transaction. */
export function freezePluginApprovalOutcome(db: SqliteDatabase, manifest: PluginManifest, record: ProjectTrustedDecision): void {
  const owner = findApprovalOutcomesOwner({
    plugin_id: manifest.plugin_id,
    publisher_id: manifest.publisher.publisher_id,
    publisher_signature: manifest.publisher.signature,
  });
  if (!owner) return;
  const project = record.reference.owner.project_id;
  const { kind, id } = record.review.target.subject;
  if (!owner.binding.subject_kinds.includes(kind)) throw incompatible();
  const outcome = owner.binding.readOutcome(db, project, record.decision_id, kind);
  if (!outcome || outcome.id !== id) throw incompatible();
  projectReviewDecisions(db, project).freezeOutcome(record, outcome.digest);
}

export function verifyPluginApprovalLinks(db: ReplicaDatabase, project: string, owner: Collection, facts: Readonly<Record<string, ProjectReplicaRows>>,
  previous?: Readonly<Record<string, ProjectReplicaRows>>): void {
  const binding = findApprovalOutcomesOwner(owner)?.binding;
  if (!binding) throw incompatible();
  const originalOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  const outcomes = binding.outcomesFromFacts(facts);
  const previousOutcomes = previous ? binding.outcomesFromFacts(previous) : null;
  if (previousOutcomes) binding.assertHistory(previousOutcomes, outcomes, facts);
  for (const [id, outcome] of outcomes) {
    const record = readProjectReviewDecision(db, project, id);
    if (!record) return pendingApproval();
    if (!decisionOwnerMatches(record, originalOwner) || record.outcome_digest !== outcome.digest) throw incompatible();
    const subject = record.review.target.subject;
    if (subject.kind !== outcome.kind || subject.id !== outcome.id) throw incompatible();
  }
}
