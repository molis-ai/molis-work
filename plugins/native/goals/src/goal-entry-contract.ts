import type { GoalFactsView, GoalsBoardRecord, PlanningMethodPack, ProjectGuidanceEntryRecord, GoalRecord, GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

/** Existing full project snapshot; every record is defined by its fact owner. */
export interface BoardSnapshot {
  cursor: number;
  board: GoalsBoardRecord;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  planning_method_packs: PlanningMethodPack[];
  project_guidance: ProjectGuidanceEntryRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
}

/** Public entry contract: Goal facts plus the owners' records about it. */
export interface GoalContractView extends GoalFactsView {
  goal_tree_proposals: GoalTreeProposalRecord[];
}
