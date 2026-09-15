import type { GoalTreeProposalRecord, ContractProposalRecord, CandidateGoalRecord, RewireRecord, ReviewRecord, ReviewObligationRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { RiskRecord, GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsSafetyItem } from "./safety-ui-model.js";
export interface GoalsDecisionEvent {
  seq: number;
  event_id: string;
  actor_id: string;
  type: string;
  object_type: string;
  object_id: string;
  reason: string;
  payload: unknown;
  at: string;
}
export interface GoalsDecisionView<T extends GoalsSafetyItem = GoalsSafetyItem> {
  goals: T[];
  archived_goals: T[];
  events: GoalsDecisionEvent[];
  snapshot: {
    goal_tree_proposals: GoalTreeProposalRecord[]; contract_proposals: ContractProposalRecord[];
    candidates: CandidateGoalRecord[]; rewires: RewireRecord[];
    risks: RiskRecord[]; relations: GoalRelationRecord[];
    reviews: ReviewRecord[]; review_obligations: ReviewObligationRecord[];
    runs: Array<{ run_id: string; goal_id: string }>;
  };
}
export interface GoalsDecisionGroup<T extends GoalsSafetyItem = GoalsSafetyItem> {
  ownerGoalId: string | null;
  item: T | null;
  goalTreeProposals: GoalTreeProposalRecord[];
}
