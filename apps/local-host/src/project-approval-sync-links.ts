import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginSyncIdentity } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import type { ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { decisionOwnerMatches, readProjectReviewDecision } from "@molis-ai/molis-work-service-project-approvals";
import type { ReplicaDatabase } from "@molis-ai/molis-work-storage";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { builtinPluginByProjectKey } from "./plugin-registry.js";

type Collection = PluginSyncIdentity & { readonly collection_id: string; readonly schema_version: number };
const errors = defineErrorCodes("host", { approval_dependency_missing: "conflict" });
const incompatible = () => new ActionError("actions.conflict", "同步的目标结果与原平台决定不一致");

export function isGoalsApprovalCollection(identity: Collection): boolean {
  const goals = builtinPluginByProjectKey("goals")?.manifest;
  return identity.collection_id === "project_goals" && identity.schema_version === 2 && identity.plugin_id === goals?.plugin_id
    && identity.publisher_signature === goals.publisher.signature && identity.publisher_id === goals.publisher.publisher_id;
}

export function verifyGoalsApprovalLinks(db: ReplicaDatabase, project: string, owner: Collection, facts: Readonly<Record<string, ProjectReplicaRows>>): void {
  const read = (id: unknown) => {
    if (typeof id !== "string" || !id.trim()) throw incompatible();
    const record = readProjectReviewDecision(db, project, id);
    if (!record) throw errors.approval_dependency_missing("原审批记录还在同步，原目标数据已保留", { sync_waiting: true });
    if (!decisionOwnerMatches(record, { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature })) throw incompatible();
    return record;
  };
  for (const row of facts.goals!.goal_event_applied_decisions!) {
    const source = read(row.governance_decision_id);
    if ("kind" in source) {
      const original = source.original;
      const equal = ["goal_id", "actor_id", "authority_source", "conclusion", "accepts_requirements", "scope_json", "request_id", "selected_option_id"];
      if (source.subject !== "event" || equal.some(key => original[key] !== row[key])) throw incompatible();
    } else {
      if (source.review.target.subject.kind !== "goal" || source.review.target.subject.id !== row.goal_id || source.actor_id !== row.actor_id
        || source.source.entry.source !== row.authority_source) throw incompatible();
      const accepted = source.review.requirements.filter(row => row.disposition === "accepted").map(row => row.id).sort();
      const scope = JSON.parse(String(row.scope_json)) as { requirement_ids?: string[] };
      if (accepted.length && canonicalJsonText(accepted) !== canonicalJsonText([...(scope.requirement_ids ?? [])].sort())) throw incompatible();
    }
  }
  for (const row of facts.governance!.goal_tree_item_effects!) {
    const source = read(row.approval_id);
    if ("kind" in source || source.review.target.subject.kind !== "goal-tree-proposal" || source.review.target.subject.id !== row.proposal_id) throw incompatible();
  }
}
