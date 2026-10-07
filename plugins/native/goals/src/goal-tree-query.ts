import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceApplicationApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi, GoalTreeProposalListQuery, GoalTreeProposalListResult } from "./goal-tree-contract.js";
import { GoalTreeBaselineQuery } from "./proposal-baselines.js";

/** Structure proposals read through one view, never a second record store. */
export class GoalTreeQueryApplication implements Pick<GoalTreeApplicationApi, "listGoalTreeProposals"> {
  readonly baselines: GoalTreeBaselineQuery;
  constructor(private readonly ports: {
    goals: Pick<GoalsQueryApi, "getBoard" | "getGoal" | "snapshot">;
    governance: Pick<GovernanceApplicationApi, "query" | "provenance">;
    errorFactory: (code: string, message: string) => Error;
  }) {
    this.baselines = new GoalTreeBaselineQuery(ports.goals);
  }

  readNative(projectId: string, proposalId: string) {
    if (!this.ports.goals.getBoard(projectId)) throw this.ports.errorFactory("board.not_found", `Board 不存在: ${projectId}`);
    const proposal = this.ports.governance.query.getGoalTreeProposal(projectId, proposalId);
    if (!proposal) throw this.ports.errorFactory("goal_tree_proposal.not_found", `找不到 Goal Tree 提案: ${proposalId}`);
    return proposal;
  }

  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult {
    if (!this.ports.goals.getBoard(input.project_id)) {
      throw this.ports.errorFactory("board.not_found", `Board 不存在: ${input.project_id}`);
    }
    if (input.root_goal_id && !this.ports.goals.getGoal(input.project_id, input.root_goal_id)) {
      throw this.ports.errorFactory("goal.not_found", `Goal 不存在: ${input.root_goal_id}`);
    }
    const snapshot = this.ports.governance.query.snapshot(input.project_id);
    const proposals = snapshot.goal_tree_proposals
      .filter(proposal => !input.proposal_id || proposal.proposal_id === input.proposal_id)
      .filter(proposal => !input.root_goal_id || proposal.root_goal_id === input.root_goal_id)
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || left.proposal_id.localeCompare(right.proposal_id));
    return { observed_event_cursor: this.ports.governance.query.eventCursor(input.project_id), proposals };
  }
}
