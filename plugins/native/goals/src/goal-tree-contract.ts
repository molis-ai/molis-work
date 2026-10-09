import type { GoalTreeProposalDecisionResult as StoredGoalTreeDecisionResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
export type { GoalTreeSemanticReview } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeProposalCheckResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
export type { GoalTreeProposalCheckResult } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeProposalRecord, GoalTreeProposalSubmitInput, GoalTreeProposalCheckInput, GoalTreeProposalDecideInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export interface GoalTreeProposalListQuery {
  project_id: string;
  proposal_id?: string;
  root_goal_id?: string;
}

export interface GoalTreeProposalListResult {
  observed_event_cursor: number;
  proposals: GoalTreeProposalRecord[];
}

export type GoalTreeProposalDecisionResult = StoredGoalTreeDecisionResult<never>;

export interface GoalTreeApplicationApi {
  submitGoalTreeProposal(input: GoalTreeProposalSubmitInput): { proposal: GoalTreeProposalRecord; replayed: boolean; observed_event_cursor: number };
  listGoalTreeProposals(input: GoalTreeProposalListQuery): GoalTreeProposalListResult;
  checkGoalTreeProposal(input: GoalTreeProposalCheckInput): GoalTreeProposalCheckResult;
  decideGoalTreeProposal(input: GoalTreeProposalDecideInput): GoalTreeProposalDecisionResult;
}

/**
 * What the Host entry (the typed client, the CLI) takes to check a proposal. It names no one: the host records the person on this
 * machine and refuses an `actor_id` in the arguments (specs/goal-closure-identity). The domain method above keeps the actor its
 * caller, the action handler, reads from the call context.
 */
export type GoalTreeCheckEntryInput = Omit<GoalTreeProposalCheckInput, "actor_id">;

/** The proposal API as the Host entries offer it: the domain API, except that checking takes no identity. */
export type GoalTreeEntryApi = Omit<GoalTreeApplicationApi, "checkGoalTreeProposal"> & {
  checkGoalTreeProposal(input: GoalTreeCheckEntryInput): GoalTreeProposalCheckResult;
};
