import type { GoalFactsView, ProjectGuidanceView, GoalsActorWrite, GoalsBoardRecord, GoalContractRevisionRecord, PlanningMethodPack, ProjectGuidanceEntryRecord, GoalRecord, GoalRelationRecord, RiskRecord, GoalRiskLinkRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { StoredModuleEvent } from "@molis-ai/molis-work-contracts/platform/storage";

/** Existing full project snapshot; every record is defined by its fact owner. */
export interface BoardSnapshot {
  cursor: number;
  board: GoalsBoardRecord;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  risks: RiskRecord[];
  goal_risks: GoalRiskLinkRecord[];
  goal_contract_revisions: GoalContractRevisionRecord[];
  lifecycle_events: StoredModuleEvent[];
  planning_method_packs: PlanningMethodPack[];
  project_guidance: ProjectGuidanceEntryRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
}

/** Public entry contract: Goal facts plus the owners' records about it. */
export interface GoalContractView extends GoalFactsView {
  goal_tree_proposals: GoalTreeProposalRecord[];
}

export const readGoalContractCapability = {
  capability_id: "io.molis.work.local-host.goals.contract",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string; goal_id: string }, GoalContractView>;

export const readProjectGuidanceCapability = {
  capability_id: "io.molis.work.local-host.project.guidance",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string }, ProjectGuidanceView>;

export const setActiveGoalCapability = {
  capability_id: "io.molis.work.local-host.goals.set-active",
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<{
  board_id: string;
  goal: { goal_id: string; reason: string };
  write: GoalsActorWrite;
}, { active_goal_id: string; replayed: boolean; observed_event_cursor: number }>;
