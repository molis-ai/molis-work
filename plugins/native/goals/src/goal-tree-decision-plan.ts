import type { GoalsQueryApi, GoalsPlanningApi, GoalRecord, PlanningGraphIssue } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord, GoalTreeProposalItemRecord, GoalTreeProposalDecideInput, GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { goalTreeProposalItemValidationIssues, goalTreeRiskDescription } from "./proposal-item-validation.js";
import type { GoalTreeQueryApplication } from "./goal-tree-query.js";
import type { GoalTreeInputReader } from "./goal-tree-inputs.js";
import type { GoalTreeDecisionNormalizer } from "./goal-tree-decision-inputs.js";
import type { GoalTreeMaterializationConflicts } from "./goal-tree-materialization-conflicts.js";
import type { GoalTreeMaterializationApplication } from "./goal-tree-materialization.js";

/** Validate the exact user decision against current owner facts before any materialization. */
export class GoalTreeDecisionPlan {
  constructor(private readonly ports: {
    goals: { query: Pick<GoalsQueryApi, "getGoal" | "snapshot">; planning: Pick<GoalsPlanningApi, "effectiveMethods" | "projectComposition" | "proposalGraphIssues"> };
    query: GoalTreeQueryApplication; inputs: GoalTreeInputReader; normalizer: GoalTreeDecisionNormalizer;
    conflicts: GoalTreeMaterializationConflicts; materialization: GoalTreeMaterializationApplication;
    errorFactory: (code: string, message: string, details?: Record<string, unknown>) => Error;
  }) {}
  abortWholeConfirmation(
    item: GoalTreeProposalItemRecord,
    conflict: Record<string, unknown>,
  ): never {
    const detail = String(conflict.message ?? conflict.code ?? "当前事实与提案不一致");
    const recovery = String(conflict.recovery ?? this.ports.materialization.recovery(conflict));
    throw this.ports.errorFactory(
      "goal_tree_proposal.whole_confirmation_conflict",
      `整份提案中的条目「${item.item_id}」暂时不能采用：${detail}。本次整份确认没有写入任何变更；${recovery}`,
      {
        item_id: item.item_id,
        original_code: conflict.code ?? null,
        conflict,
        next_action: "check_and_revise",
      },
    );
  }

  prepare(input: GoalTreeProposalDecideInput, proposal: GoalTreeProposalRecord, authority: GoalTreeProposalDecisionAuthority) {
    const wholeConfirmation = input.confirm_all_pending === true;
    let decisions = this.ports.normalizer.normalizeDecisions(input.decisions, input.reason);
    if (wholeConfirmation) {
      if (decisions.length > 0) {
        throw this.ports.errorFactory(
          "goal_tree_proposal.whole_confirmation_mixed",
          "整份确认不能同时携带逐项决定；请二选一",
        );
      }
      if (proposal.state !== "pending") {
        throw this.ports.errorFactory(
          "goal_tree_proposal.whole_confirmation_requires_pristine_proposal",
          "这份提案已经有条目落地，不能再作为一份完整变更原子确认；请基于当前 Goal Tree 生成只包含未落地内容的修订提案",
          {
            proposal_id: proposal.proposal_id,
            state: proposal.state,
            next_action: "create_revision_from_current_tree",
          },
        );
      }
      if (
        authority.whole_confirmation_prompted !== true ||
        (authority.authority_source === "runtime_dialogue" &&
          authority.prompted_proposal_id !== proposal.proposal_id)
      ) {
        throw this.ports.errorFactory(
          "goal_tree_proposal.whole_confirmation_ambiguous",
          "简短确认只有在上一问明确点名这一整份提案时才能生效；请绑定准确的 Proposal ID，或逐项说明决定",
          {
            proposal_id: proposal.proposal_id,
            whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
            prompted_proposal_id: authority.prompted_proposal_id ?? null,
            next_action: "bind_confirmation_to_exact_proposal_or_decide_items",
          },
        );
      }
      const existingConflict = proposal.items.find((item) => item.state === "conflict");
      if (existingConflict) {
        this.abortWholeConfirmation(existingConflict, existingConflict.conflict ?? {
          code: "goal_tree_proposal.item_conflict",
          message: "条目与当前 Molis Work 事实不一致",
        });
      }
      const sharedReason = this.requiredText(
        input.reason ?? "",
        "goal_tree_proposal.decision_reason_required",
        "整份确认需要记录用户的确认理由或原始表达",
      );
      decisions = proposal.items
        .filter((item) => item.state === "pending")
        .map((item) => ({ item_id: item.item_id, decision: "confirm" as const, reason: sharedReason, revised_item: null }));
    }
    if (decisions.length === 0) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.decisions_required",
        "请至少决定一个 Goal Tree 条目，或在明确上下文中确认整份提案",
      );
    }

    const itemsById = new Map(proposal.items.map((item) => [item.item_id, item]));
    for (const decision of decisions) {
      const item = itemsById.get(decision.item_id);
      if (!item) {
        throw this.ports.errorFactory(
          "goal_tree_proposal.decision_item_not_found",
          `提案中不存在条目: ${decision.item_id}`,
        );
      }
      if (item.state !== "pending" && item.state !== "conflict") {
        throw this.ports.errorFactory(
          "goal_tree_proposal.decision_item_closed",
          `条目「${decision.item_id}」已经处理，不能再次决定`,
        );
      }
    }

    for (const decision of decisions) {
      if (decision.decision !== "confirm") continue;
      const item = itemsById.get(decision.item_id)!;
      const issue = goalTreeProposalItemValidationIssues(item)[0];
      if (issue) {
        throw this.ports.errorFactory(
          issue.code,
          `方案中的风险「${goalTreeRiskDescription(item)}」暂时不能采用：${issue.message}${issue.recovery}当前 Goal Tree 没有改变。`,
        );
      }
    }

    const confirmedItems = decisions
      .filter((decision) => decision.decision === "confirm")
      .map((decision) => itemsById.get(decision.item_id)!);
    if (proposal.root_goal_id) {
      const rootGoal = this.requireGoalOnBoard(input.board_id, proposal.root_goal_id);
      const companionContract = this.ports.inputs.requireDraftRiskLifecycleContract(
        input.board_id,
        rootGoal,
        confirmedItems,
      );
      if (companionContract) {
        const dependentItems = [
          companionContract,
          ...confirmedItems.filter((item) => this.ports.inputs.isRiskLifecycleChange(input.board_id, item)),
        ];
        for (const item of dependentItems) {
          const baselineConflicts = this.ports.query.baselines.itemConflicts(input.board_id, item);
          const materializationConflict = this.ports.conflicts.read(input.board_id, item);
          if (baselineConflicts.length > 0 || materializationConflict) {
            throw this.ports.errorFactory(
              "goal_tree_proposal.risk_goal_atomic_conflict",
              "Risk 生命周期变更和承载它的 Goal Contract 必须一起成功；当前事实已经变化，请先刷新并修订整份提案",
            );
          }
        }
      }
    } else if (confirmedItems.some((item) => this.ports.inputs.isRiskLifecycleChange(input.board_id, item))) {
      throw this.ports.errorFactory(
        "goal_tree_proposal.risk_goal_root_required",
        "Risk 生命周期变更必须归属于一条明确的 Goal；请重新提交带 root_goal_id 的提案",
      );
    }

    const planningIssues = this.ports.goals.planning.proposalGraphIssues(
      input.board_id,
      decisions
        .filter((decision) => decision.decision === "confirm")
        .map((decision) => itemsById.get(decision.item_id)!),
    );
    const planningConflicts = new Map<string, PlanningGraphIssue>();
    for (const issue of planningIssues) {
      for (const item of itemsById.values()) {
        if (issue.relation_ids.some((relationId) => relationId.startsWith(`proposal:${item.item_id}:`))) {
          planningConflicts.set(item.item_id, issue);
        }
      }
    }

    return { decisions, itemsById, planningConflicts };
  }
  private requireGoalOnBoard(boardId: string, goalId: string): GoalRecord {
    const goal = this.ports.goals.query.getGoal(boardId, goalId);
    if (!goal) throw this.ports.errorFactory("goal.not_found", `Goal 不存在: ${goalId}`);
    return goal;
  }
  private requiredText(value: string, code: string, message: string): string {
    const text = value.trim();
    if (!text) throw this.ports.errorFactory(code, message);
    return text;
  }
}
