import { createHash } from "node:crypto";
import type { GoalsQueryApi, GoalsPlanningApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi, GoalTreeProposalCheckInput, GoalTreeProposalCheckResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { goalTreeProposalItemValidationIssues } from "./proposal-item-validation.js";
import { GoalTreeQueryApplication } from "./goal-tree-query.js";
import { GoalTreeMaterializationApplication } from "./goal-tree-materialization.js";

interface CheckError extends Error { code: string; details?: Record<string, unknown> }
export class GoalTreeCheckApplication implements Pick<GoalTreeApplicationApi, "checkGoalTreeProposal"> {
  constructor(private readonly ports: {
    goals: { query: Pick<GoalsQueryApi, "getGoal">; planning: Pick<GoalsPlanningApi, "proposalGraphIssues"> };
    governance: Pick<GovernanceApplicationApi, "records" | "query">;
    query: GoalTreeQueryApplication;
    materialization: GoalTreeMaterializationApplication;
    clock: () => Date;
    errorFactory: (code: string, message: string, details?: Record<string, unknown>) => Error;
    isDomainError: (error: unknown) => error is CheckError;
  }) {}

  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult {
    const actorId = this.requiredText(
      input.actor_id,
      "goal_tree_proposal.actor_required",
      "检查 Goal Tree 提案需要当前 Runtime 的 actor_id",
    );
    const proposalId = this.requiredText(
      input.proposal_id,
      "goal_tree_proposal.id_required",
      "需要指定要检查的 Goal Tree proposal_id",
    );
    const proposalView = this.ports.query.listGoalTreeProposals({
      board_id: input.board_id,
      proposal_id: proposalId,
      include_legacy: true,
    }).proposals[0];
    if (!proposalView) {
      throw this.ports.errorFactory("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    }
    if (proposalView.origin !== "native") {
      throw this.ports.errorFactory(
        "goal_tree_proposal.kind_retired",
        "历史提案不能从新 check 落地；请读取历史后提交新的 Goal/关系提案",
        { proposal_id: proposalView.proposal_id },
      );
    }
    const canonicalProposalId = proposalView.proposal_id;
    const hash = requestHash({ board_id: input.board_id, proposal_id: canonicalProposalId, actor_id: actorId });
    return this.ports.governance.records.executeGoalTreeCheck({
      board_id: input.board_id, actor_id: actorId, idempotency_key: input.idempotency_key, request_hash: hash,
    }, () => {
      const proposal = this.ports.query.readNative(input.board_id, canonicalProposalId);
      const now = this.ports.clock().toISOString();
      const conflictItemIdSet = new Set<string>();
      for (const item of proposal.items) {
        if (item.state !== "pending" && item.state !== "conflict") continue;
        const validationIssue = goalTreeProposalItemValidationIssues(item)[0];
        const baselineConflicts = item.baseline_versions.flatMap((baseline) => {
          const current = this.ports.query.baselines.forBaseline(input.board_id, baseline, item);
          return baseline.exists === current.exists && baseline.version === current.version
            ? []
            : [{ object: { object_type: baseline.object_type, object_id: baseline.object_id }, baseline, current }];
        });
        const conflict = validationIssue
          ? {
              code: validationIssue.code,
              field: validationIssue.field,
              message: validationIssue.message,
              recovery: validationIssue.recovery,
            }
          : baselineConflicts.length > 0
            ? { objects: baselineConflicts }
            : null;
        if (conflict) conflictItemIdSet.add(item.item_id);
        this.ports.governance.records.setGoalTreeItemCheck(
          canonicalProposalId,
          item.item_id,
          conflict ? "conflict" : "pending",
          conflict,
          now,
        );
      }
      const checkedItems = this.ports.query.readNative(input.board_id, canonicalProposalId).items;
      const materializationConflicts = this.ports.materialization.preflight(
        input.board_id,
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
      const planningIssues = this.ports.goals.planning.proposalGraphIssues(input.board_id, proposal.items);
      const cursor = this.ports.governance.records.recordGoalTreeCheck({
        board_id: input.board_id, proposal_id: canonicalProposalId, actor_id: actorId,
        conflict_item_ids: conflictItemIds, planning_issue_codes: planningIssues.map(issue => issue.code), at: now,
        origin: "native",
      });
      const outcome: GoalTreeProposalCheckResult = {
        proposal: this.ports.query.readNative(input.board_id, canonicalProposalId),
        conflict_item_ids: conflictItemIds,
        planning_issues: planningIssues,
        observed_event_cursor: cursor,
      };
      return { value: outcome, at: now };
    });
  }


  private requiredText(value: string, code: string, message: string): string {
    const text = value.trim();
    if (!text) throw this.ports.errorFactory(code, message);
    return text;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
