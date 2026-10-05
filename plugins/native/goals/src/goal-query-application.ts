import type {
  GoalsQueryApi,
  ProjectGuidanceView,
} from "@molis-ai/molis-work-contracts/modules/goals";

import type { GoalContractView } from "./goal-entry-contract.js";
import type { GoalPolicy, GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export interface GoalReadApplicationPorts {
  now(): Date;

  goalTreeProposals(boardId: string, rootGoalId: string): GoalTreeProposalRecord[];
}

/** Compose Goal facts with the Goal tree proposals about it. Current work status is event-owned. */
export class GoalReadApplication {
  constructor(
    private readonly goals: GoalsQueryApi,
    private readonly ports: GoalReadApplicationPorts,
  ) {}

  readProjectGuidance(boardId: string): ProjectGuidanceView {
    return this.goals.readProjectGuidance(boardId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goals.listTrashedGoals(boardId);
  }

  listPolicyHistory(boardId: string) { return this.goals.listPolicyHistory(boardId); }
  listGoalRiskLinks(boardId: string) { return this.goals.listGoalRiskLinks(boardId); }
  listWorkEventGoalLinks(boardId: string) { return this.goals.listWorkEventGoalLinks(boardId); }

  getResolvedGoalPolicy(input: { board_id: string; goal_id: string }): GoalPolicy {
    return this.goals.resolvePolicy(input.board_id, input.goal_id);
  }

  getGoal(boardId: string, goalId: string): GoalRecord {
    return this.goals.readGoal(boardId, goalId).goal;
  }

  readGoalContract(boardId: string, goalId: string): GoalContractView {
    const goalFacts = this.goals.readGoal(boardId, goalId);
    return {
      board: goalFacts.board,
      observed_event_cursor: goalFacts.observed_event_cursor,
      goal_path: goalFacts.goal_path,
      goal: goalFacts.goal,
      parent_contract_coverage: goalFacts.parent_contract_coverage,
      relations: goalFacts.relations,
      risks: goalFacts.risks,
      resolved_policy: goalFacts.resolved_policy,
      goal_tree_proposals: this.ports.goalTreeProposals(boardId, goalId),
      project_guidance: goalFacts.project_guidance,
    };
  }
}
