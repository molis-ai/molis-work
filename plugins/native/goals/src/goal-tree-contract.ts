import type { GoalTreeProposalDecisionResult as StoredGoalTreeDecisionResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
export type { GoalTreeSemanticReview } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeProposalCheckResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
export type { GoalTreeProposalCheckResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeProposalRecord, GoalTreeProposalSubmitInput, GoalTreeProposalCheckInput, GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export type { GoalTreeProposalListQuery, GoalTreeProposalListResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeProposalListQuery, GoalTreeProposalListResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export type GoalTreeProposalDecisionResult = StoredGoalTreeDecisionResult<never>;

export interface GoalTreeApplicationApi {
  submitGoalTreeProposal(input: GoalTreeProposalSubmitInput): { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number };
  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult;
  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult;
  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult;
}
