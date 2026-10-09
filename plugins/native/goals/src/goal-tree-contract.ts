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

/**
 * What the Host entry takes to submit a proposal. It names no one either: the person on this machine submits, and there is no
 * Runtime Session behind this door to name, so `submitted_session_id` is not taken from the arguments (a Runtime's action takes
 * its Session from the call context).
 */
export type GoalTreeSubmitEntryInput = Omit<GoalTreeProposalSubmitInput, "actor_id" | "submitted_session_id">;

/** The proposal API as the Host entries offer it: the domain API, except that checking and submitting take no identity. */
export type GoalTreeEntryApi = Omit<GoalTreeApplicationApi, "checkGoalTreeProposal" | "submitGoalTreeProposal"> & {
  checkGoalTreeProposal(input: GoalTreeCheckEntryInput): GoalTreeProposalCheckResult;
  submitGoalTreeProposal(input: GoalTreeSubmitEntryInput): ReturnType<GoalTreeApplicationApi["submitGoalTreeProposal"]>;
};
