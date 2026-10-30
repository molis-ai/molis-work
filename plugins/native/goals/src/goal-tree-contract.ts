import type { GoalTreeProposalDecisionResult as StoredGoalTreeDecisionResult } from "./contract/governance-collaboration.js";
export type { GoalTreeSemanticReview } from "./contract/governance-collaboration.js";
import type { GoalTreeProposalCheckResult } from "./contract/governance-collaboration.js";
export type { GoalTreeProposalCheckResult } from "./contract/governance-collaboration.js";
import type { GoalTreeProposalRecord, GoalTreeProposalSubmitInput, GoalTreeProposalCheckInput, GoalTreeProposalDecideInput } from "./contract/governance-collaboration.js";

export type { GoalTreeProposalListQuery, GoalTreeProposalListResult } from "./contract/governance-collaboration.js";
import type { GoalTreeProposalListQuery, GoalTreeProposalListResult } from "./contract/governance-collaboration.js";

export type GoalTreeProposalDecisionResult = StoredGoalTreeDecisionResult<never>;

export interface GoalTreeApplicationApi {
  submitGoalTreeProposal(input: GoalTreeProposalSubmitInput): { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number };
  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult;
  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult;
  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult;
}
