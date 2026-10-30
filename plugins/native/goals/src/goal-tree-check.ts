import { canonicalJsonValue as canonicalize } from "@molis-ai/molis-work-plugin-sdk";
import { treeErrors, type TreeErrorCode } from "./goal-tree-errors.js";
import { createHash } from "node:crypto";
import type { GoalsQueryApi, GoalsPlanningApi } from "./contract/goals.js";
import type { GovernanceApplicationApi, GoalTreeProposalCheckInput, GoalTreeProposalCheckResult } from "./contract/governance-collaboration.js";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { GoalTreeQueryApplication } from "./goal-tree-query.js";
import { GoalTreeMaterializationApplication } from "./goal-tree-materialization.js";

export class GoalTreeCheckApplication implements Pick<GoalTreeApplicationApi, "checkGoalTreeProposal"> {
  constructor(private readonly ports: {
    goals: { query: Pick<GoalsQueryApi, "getGoal">; planning: Pick<GoalsPlanningApi, "proposalGraphIssues"> };
    governance: Pick<GovernanceApplicationApi, "records" | "query">;
    query: GoalTreeQueryApplication;
    materialization: GoalTreeMaterializationApplication;
    clock: () => Date;
  }) {}

  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult {
    const actorId = this.requiredText(
      input.actor_id,
      "goals.goal_tree_proposal.actor_required",
      "检查 Goal Tree 提案需要当前 Runtime 的 actor_id",
    );
    const proposalId = this.requiredText(
      input.proposal_id,
      "goals.goal_tree_proposal.id_required",
      "需要指定要检查的 Goal Tree proposal_id",
    );
    const proposalView = this.ports.query.listGoalTreeProposals({
      project_id: input.project_id,
      proposal_id: proposalId,
    }).proposals[0];
    if (!proposalView) {
      throw treeErrors["goals.goal_tree_proposal.not_found"](`找不到 Goal Tree 提案: ${proposalId}`);
    }
    const canonicalProposalId = proposalView.proposal_id;
    const hash = requestHash({ project_id: input.project_id, proposal_id: canonicalProposalId, actor_id: actorId });
    return this.ports.governance.records.executeGoalTreeCheck({
      project_id: input.project_id, actor_id: actorId, idempotency_key: input.idempotency_key, request_hash: hash,
    }, () => {
      const proposal = this.ports.query.readNative(input.project_id, canonicalProposalId);
      const now = this.ports.clock().toISOString();
      const conflictItemIdSet = new Set<string>();
      for (const item of proposal.items) {
        if (item.state !== "pending" && item.state !== "conflict") continue;
        const baselineConflicts = item.baseline_versions.flatMap((baseline) => {
          const current = this.ports.query.baselines.objectVersion(input.project_id, baseline);
          return baseline.exists === current.exists && baseline.version === current.version
            ? []
            : [{ object: { object_type: baseline.object_type, object_id: baseline.object_id }, baseline, current }];
        });
        const conflict = baselineConflicts.length > 0 ? { objects: baselineConflicts } : null;
        if (conflict) conflictItemIdSet.add(item.item_id);
        this.ports.governance.records.setGoalTreeItemCheck(
          canonicalProposalId,
          item.item_id,
          conflict ? "conflict" : "pending",
          conflict,
          now,
        );
      }
      const checkedItems = this.ports.query.readNative(input.project_id, canonicalProposalId).items;
      const materializationConflicts = this.ports.materialization.preflight(
        input.project_id,
        checkedItems.filter((item) => item.state === "pending"),
        actorId,
        now,
      );
      for (const item of checkedItems) {
        const conflict = materializationConflicts.get(item.item_id);
        if (!conflict) continue;
        conflictItemIdSet.add(item.item_id);
        this.ports.governance.records.setGoalTreeItemCheck(
          canonicalProposalId,
          item.item_id,
          "conflict",
          conflict,
          now,
        );
      }
      const conflictItemIds = proposal.items
        .filter((item) => conflictItemIdSet.has(item.item_id))
        .map((item) => item.item_id);
      const planningIssues = this.ports.goals.planning.proposalGraphIssues(input.project_id, proposal.items);
      const cursor = this.ports.governance.records.recordGoalTreeCheck({
        project_id: input.project_id, proposal_id: canonicalProposalId, actor_id: actorId,
        conflict_item_ids: conflictItemIds, planning_issue_codes: planningIssues.map(issue => issue.code), at: now,
      });
      const outcome: GoalTreeProposalCheckResult = {
        proposal: this.ports.query.readNative(input.project_id, canonicalProposalId),
        conflict_item_ids: conflictItemIds,
        planning_issues: planningIssues,
        observed_event_cursor: cursor,
      };
      return { value: outcome, at: now };
    });
  }

  private requiredText(value: string, code: TreeErrorCode, message: string): string {
    const text = value.trim();
    if (!text) throw treeErrors[code](message);
    return text;
  }
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
