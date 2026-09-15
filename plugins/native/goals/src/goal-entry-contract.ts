import type { GoalFactsView, ImpactBindingRecord, ProjectGuidanceView, GoalsActorWrite, GoalsBoardRecord, GoalContractRevisionRecord, CoverageContractRevisionRecord, PlanningMethodPack, ProjectGuidanceEntryRecord, GoalRecord, GoalRelationRecord, RiskRecord, GoalRiskLinkRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ExecutionClaimRecord, ExecutionRunRecord } from "@molis-ai/molis-work-contracts/modules/execution";
import type { EvidenceRecord, EvidenceCorrectionRecord } from "@molis-ai/molis-work-contracts/modules/evidence-verification";
import type { ReviewObligationRecord, ReviewRecord, CandidateGoalRecord, ContractProposalRecord, RewireRecord, ClarificationSessionRecord, ClarificationTurnRecord, GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { StoredModuleEvent } from "@molis-ai/molis-work-contracts/platform/storage";

/** Existing full project snapshot; every record is defined by its fact owner. */
export interface BoardSnapshot {
  cursor: number;
  board: GoalsBoardRecord;
  goals: GoalRecord[];
  relations: GoalRelationRecord[];
  impacts: ImpactBindingRecord[];
  risks: RiskRecord[];
  goal_risks: GoalRiskLinkRecord[];
  claims: ExecutionClaimRecord[];
  runs: ExecutionRunRecord[];
  evidence: EvidenceRecord[];
  evidence_corrections: EvidenceCorrectionRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  goal_contract_revisions: GoalContractRevisionRecord[];
  coverage_contract_revisions: CoverageContractRevisionRecord[];
  lifecycle_events: StoredModuleEvent[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  clarification_sessions: ClarificationSessionRecord[];
  clarification_turns: ClarificationTurnRecord[];
  planning_method_packs: PlanningMethodPack[];
  project_guidance: ProjectGuidanceEntryRecord[];
  goal_tree_proposals: GoalTreeProposalRecord[];
}

/** Public entry contract: Goal facts plus historical owner records. */
export interface GoalContractView extends GoalFactsView {
  impacts: ImpactBindingRecord[];
  claims: ExecutionClaimRecord[];
  runs: ExecutionRunRecord[];
  evidence: EvidenceRecord[];
  evidence_corrections: EvidenceCorrectionRecord[];
  review_obligations: ReviewObligationRecord[];
  reviews: ReviewRecord[];
  candidates: CandidateGoalRecord[];
  contract_proposals: ContractProposalRecord[];
  rewires: RewireRecord[];
  clarification_sessions: ClarificationSessionRecord[];
  clarification_turns: ClarificationTurnRecord[];
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
