import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi, GoalTreeProposalListQuery, GoalTreeProposalListResult } from "./goal-tree-contract.js";
import { GoalTreeBaselineQuery } from "./proposal-baselines.js";

/** Native and historical proposals share one read view, never a second record store. */
export class GoalTreeQueryApplication implements Pick<GoalTreeApplicationApi, "listGoalTreeProposals"> {
  readonly baselines: GoalTreeBaselineQuery;
  constructor(private readonly ports: {
    goals: Pick<GoalsQueryApi, "getBoard" | "getGoal" | "snapshot" | "policyBindingVersion">;
    governance: Pick<GovernanceApplicationApi, "query" | "provenance">;
    errorFactory: (code: string, message: string) => Error;
  }) {
    this.baselines = new GoalTreeBaselineQuery(ports.goals, ports.governance.query);
  }

  readNative(boardId: string, proposalId: string) {
    if (!this.ports.goals.getBoard(boardId)) throw this.ports.errorFactory("board.not_found", `Board 不存在: ${boardId}`);
    const proposal = this.ports.governance.query.getGoalTreeProposal(boardId, proposalId);
    if (!proposal) throw this.ports.errorFactory("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    return proposal;
  }

  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult {
    if (!this.ports.goals.getBoard(input.board_id)) {
      throw this.ports.errorFactory("board.not_found", `Board 不存在: ${input.board_id}`);
    }
    if (input.root_goal_id && !this.ports.goals.getGoal(input.board_id, input.root_goal_id)) {
      throw this.ports.errorFactory("goal.not_found", `Goal 不存在: ${input.root_goal_id}`);
    }
    const snapshot = this.ports.governance.query.snapshot(input.board_id);
    const proposals = [
      ...snapshot.goal_tree_proposals,
      ...(input.include_legacy === false ? [] : this.ports.governance.provenance.legacyProposalView(snapshot)),
    ].filter(proposal => {
      if (!input.proposal_id || proposal.proposal_id === input.proposal_id) return true;
      if (proposal.origin === "native") return false;
      const separator = proposal.proposal_id.indexOf(":");
      return separator >= 0 && proposal.proposal_id.slice(separator + 1) === input.proposal_id;
    }).filter(proposal => !input.root_goal_id || proposal.root_goal_id === input.root_goal_id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || left.proposal_id.localeCompare(right.proposal_id));
    return { observed_event_cursor: this.ports.governance.query.eventCursor(input.board_id), proposals };
  }
}
