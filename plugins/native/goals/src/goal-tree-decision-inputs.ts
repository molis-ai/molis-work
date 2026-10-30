import { treeErrors, type TreeErrorCode } from "./goal-tree-errors.js";
import type { GoalTreeProposalDecisionAuthority, GoalTreeProposalItemDecisionInput, GovernanceProvenanceApi } from "./contract/governance-collaboration.js";
import { GoalTreeProposalNormalizer, type NormalizedGoalTreeProposalItem } from "./proposal-normalizer.js";

export interface NormalizedGoalTreeProposalDecision {
  item_id: string;
  decision: GoalTreeProposalItemDecisionInput["decision"];
  reason: string;
  revised_item: NormalizedGoalTreeProposalItem | null;
}

/** Trusted decision wire validation; no decision or owner facts are written. */
export class GoalTreeDecisionNormalizer {
  private readonly items: GoalTreeProposalNormalizer;
  constructor(provenance: GovernanceProvenanceApi) {
    this.items = new GoalTreeProposalNormalizer(provenance);
  }
  private requiredText(value: string, code: TreeErrorCode, message: string): string {
    const text = value.trim();
    if (!text) throw treeErrors[code](message);
    return text;
  }
  normalizeAuthority(
    authority: GoalTreeProposalDecisionAuthority,
  ): GoalTreeProposalDecisionAuthority {
    if (!authority || authority.actor_kind !== "user") {
      throw treeErrors["goals.goal_tree_proposal.user_authority_required"]("只有受信用户决定可以物化 Goal Tree 提案");
    }
    if (![
      "runtime_dialogue",
      "web",
      "management",
    ].includes(authority.authority_source)) {
      throw treeErrors["goals.goal_tree_proposal.authority_source_invalid"]("Goal Tree 决定必须标明可审计的用户确认入口");
    }
    return {
      actor_id: this.requiredText(
        authority.actor_id,
        "goals.goal_tree_proposal.user_actor_required",
        "Goal Tree 决定需要用户确认身份",
      ),
      actor_kind: "user",
      authority_source: authority.authority_source,
      conversation_ref: this.requiredText(
        authority.conversation_ref,
        "goals.goal_tree_proposal.conversation_ref_required",
        "Goal Tree 决定需要对话引用",
      ),
      message_ref: this.requiredText(
        authority.message_ref,
        "goals.goal_tree_proposal.message_ref_required",
        "Goal Tree 决定需要确认消息引用",
      ),
      whole_confirmation_prompted: authority.whole_confirmation_prompted === true,
      prompted_proposal_id: authority.prompted_proposal_id == null
        ? undefined
        : this.requiredText(
          authority.prompted_proposal_id,
          "goals.goal_tree_proposal.prompted_proposal_id_required",
          "整份确认需要记录上一问明确指向的 Proposal ID",
        ),
    };
  }

  normalizeDecisions(
    decisions: GoalTreeProposalItemDecisionInput[] | undefined,
    fallbackReason: string | undefined,
  ): NormalizedGoalTreeProposalDecision[] {
    const ids = new Set<string>();
    return (decisions ?? []).map((decision, index) => {
      const itemId = this.requiredText(
        decision.item_id,
        "goals.goal_tree_proposal.decision_item_required",
        `第 ${index + 1} 个决定缺少 item_id`,
      );
      if (ids.has(itemId)) {
        throw treeErrors["goals.goal_tree_proposal.decision_item_duplicate"]("同一次用户决定不能重复处理同一个提案条目");
      }
      ids.add(itemId);
      if (!["confirm", "reject", "revise"].includes(decision.decision)) {
        throw treeErrors["goals.goal_tree_proposal.decision_invalid"](`第 ${index + 1} 个条目的决定必须是 confirm、reject 或 revise`);
      }
      const reasonText = (decision.reason || fallbackReason || "").trim();
      if (!reasonText) {
        throw treeErrors["goals.goal_tree_proposal.decision_reason_required"](`第 ${index + 1} 个条目的用户决定需要说明理由或修改意见`);
      }
      const revisedItem = decision.revised_item
        ? this.items
          .normalizeGoalTreeProposalItems([decision.revised_item])[0] ?? null
        : null;
      if (decision.decision === "revise" && !revisedItem) {
        throw treeErrors["goals.goal_tree_proposal.revision_item_required"]("修改条目时必须提供完整的新条目内容");
      }
      if (decision.decision !== "revise" && revisedItem) {
        throw treeErrors["goals.goal_tree_proposal.revision_item_unexpected"]("只有 revise 决定可以包含新的条目内容");
      }
      return {
        item_id: itemId,
        decision: decision.decision,
        reason: reasonText,
        revised_item: revisedItem,
      };
    });
  }
}
